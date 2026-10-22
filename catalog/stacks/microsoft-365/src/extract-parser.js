import * as XLSX from 'xlsx';
import { Unzip, UnzipInflate } from 'fflate';
import { SafeError } from './contracts.js';

const failLimit = () => { throw new SafeError('EXTRACTION_LIMIT', 'Document exceeds extraction limits.'); };
const malformed = () => new SafeError('EXTRACTION_FORMAT', 'Document is invalid or unsupported.');
function checkedText(value) { const text=String(value); if(text.length>10000) failLimit(); return text; }

// Inspect actual expanded bytes, not only ZIP headers, before the workbook parser runs.
function checkZip(bytes) {
  let entries=0, total=0, error;
  const names=new Set();
  const unzip=new Unzip(file=>{
    if(++entries>1000 || names.has(file.name)) failLimit();
    names.add(file.name); let size=0;
    file.ondata=(err,data)=>{
      if(err) { error ??= err; return; }
      size+=data.length; total+=data.length;
      if(size>16*1024*1024 || total>32*1024*1024) {
        error=new SafeError('EXTRACTION_LIMIT','Document exceeds extraction limits.');
        throw error;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for(let offset=0;offset<bytes.length;offset+=16384) {
    unzip.push(bytes.subarray(offset,offset+16384),offset+16384>=bytes.length);
    if(error) throw error instanceof SafeError ? error : malformed();
  }
  if(!names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) throw malformed();
}

function dateValue(cell,date1904,warnings,address) {
  const serial=cell.v;
  const format=cell.z.replace(/"[^"]*"|\\./g,'').toLowerCase();
  // Duration/time-only formats are kept numeric rather than inventing a calendar date.
  if(/\[[hms]+\]/.test(format) || !/[yd]/.test(format)) {
    warnings.push({code:'TIME_VALUE_PRESERVED',address}); return {type:'number',value:serial,raw_value:serial};
  }
  if(!date1904 && Math.floor(serial)===60) {
    warnings.push({code:'EXCEL_FICTITIOUS_DATE',address}); return {type:'number',value:serial,raw_value:serial};
  }
  const parsed=XLSX.SSF.parse_date_code(serial,{date1904});
  if(!parsed || parsed.y<1 || parsed.y>9999 || parsed.d<1 || parsed.m<1) {
    warnings.push({code:'INVALID_EXCEL_DATE',address}); return {type:'number',value:serial,raw_value:serial};
  }
  const pad=n=>String(n).padStart(2,'0');
  const date=`${String(parsed.y).padStart(4,'0')}-${pad(parsed.m)}-${pad(parsed.d)}`;
  const hasTime=/[hs]|am\/pm/.test(format);
  const ms=Math.round((parsed.u??0)*1000);
  // Preserve exact serial when subsecond rounding would cross a second boundary.
  if(ms===1000) { warnings.push({code:'DATE_PRECISION_PRESERVED',address}); return {type:'number',value:serial,raw_value:serial}; }
  const time=`${pad(parsed.H)}:${pad(parsed.M)}:${pad(parsed.S)}${ms?'.'+String(ms).padStart(3,'0'):''}`;
  return {type:hasTime?'datetime':'date',value:hasTime?`${date}T${time}`:date,raw_value:serial};
}

function extractWorkbook(bytes) {
  checkZip(bytes);
  const workbook=XLSX.read(bytes,{type:'array',cellDates:false,cellNF:true,cellFormula:true,sheetStubs:true,bookVBA:false});
  if(workbook.SheetNames.length>20) failLimit();
  const date1904=!!workbook.Workbook?.WBProps?.date1904;
  let count=0; const warnings=[];
  const sheets=workbook.SheetNames.map(name=>{
    checkedText(name); const sheet=workbook.Sheets[name]; const cells=[];
    for(const address of Object.keys(sheet)) {
      if(address.startsWith('!')) continue;
      const cell=sheet[address]; if(cell.v===undefined && !cell.f) continue;
      if(++count>20000) failLimit();
      if(cell.f && cell.v===undefined) warnings.push({code:'FORMULA_CACHE_MISSING',address:`${name}!${address}`});
      let value;
      if(cell.t==='n' && Number.isFinite(cell.v)) value=typeof cell.z==='string' && XLSX.SSF.is_date(cell.z)?dateValue(cell,date1904,warnings,`${name}!${address}`):{type:'number',value:cell.v};
      else if(cell.t==='b') value={type:'boolean',value:!!cell.v};
      else if(cell.v===undefined) value={type:'missing',value:null};
      else value={type:cell.t==='e'?'error':'string',value:checkedText(cell.v)};
      cells.push({address,...value,...(cell.f?{formula:checkedText(cell.f)}:{})});
    }
    return {name,cells};
  });
  return {format:'xlsx',date_system:date1904?'1904':'1900',sheets,warnings};
}

async function extractPdf(bytes) {
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0});
  let document;
  try {
    document=await task.promise;
    if(document.numPages>100) failLimit();
    let total=0; const pages=[],empty_page_numbers=[];
    for(let page=1;page<=document.numPages;page++) {
      const pdfPage=await document.getPage(page);
      const content=await pdfPage.getTextContent();
      let text='';
      for(const item of content.items) {
        if(typeof item.str!=='string') continue;
        const addition=item.str+(item.hasEOL?'\n':' ');
        total+=addition.length; if(total>1000000) failLimit(); text+=addition;
      }
      text=text.trim(); if(!text) empty_page_numbers.push(page);
      pages.push({page,text}); pdfPage.cleanup();
    }
    return {format:'pdf',pages,empty_page_numbers,ocr_required:empty_page_numbers.length>0,warnings:empty_page_numbers.length?[{code:'OCR_MAY_BE_REQUIRED',message:'Pages without extractable text may be scanned or blank; OCR was not performed.'}]:[]};
  } finally { await task.destroy(); }
}

export async function extractDocument(bytes,format) {
  if(!(bytes instanceof Uint8Array) || !bytes.length) throw malformed();
  try {
    if(format==='xlsx') return extractWorkbook(bytes);
    if(format==='pdf') return await extractPdf(bytes);
    throw malformed();
  } catch(error) {
    if(error instanceof SafeError) throw error;
    if(error?.name==='PasswordException') throw new SafeError('EXTRACTION_ENCRYPTED','Password-protected documents are unsupported.');
    throw malformed();
  }
}
