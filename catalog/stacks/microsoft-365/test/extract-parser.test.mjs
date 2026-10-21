import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { extractDocument } from '../src/extract-parser.js';
function book(cells, date1904=false) { const ws={...cells,'!ref':'A1:F1'}; return XLSX.write({SheetNames:['Data'],Sheets:{Data:ws},Workbook:{WBProps:{date1904}}},{type:'buffer',bookType:'xlsx'}); }
test('normalizes styled Excel dates but preserves ordinary numbers and cached formulas',async()=>{
 const r=await extractDocument(book({A1:{t:'n',v:45292,z:'yyyy-mm-dd'},B1:{t:'n',v:45292.5,z:'yyyy-mm-dd hh:mm:ss'},C1:{t:'n',v:45292},D1:{t:'n',v:2,f:'1+1'}}),'xlsx');
 assert.equal(r.date_system,'1900'); const c=r.sheets[0].cells;
 assert.equal(c[0].value,'2024-01-01'); assert.equal(c[0].raw_value,45292);assert.equal(c[1].value,'2024-01-01T12:00:00');assert.equal(c[2].value,45292);assert.equal(c[3].formula,'1+1');assert.equal(c[3].value,2);
});
test('marks uncached formulas so callers cannot mistake absent values for results',async()=>{
 const r=await extractDocument(book({A1:{t:'n',f:'SUM(B1:B2)'}}),'xlsx');
 assert.ok(r.warnings.some(x=>x.code==='FORMULA_CACHE_MISSING'));
});
test('honors 1904 epoch and preserves fictitious 1900 leap day and durations with warnings',async()=>{
 const r=await extractDocument(book({A1:{t:'n',v:0,z:'yyyy-mm-dd'}},true),'xlsx');
 assert.equal(r.date_system,'1904');assert.equal(r.sheets[0].cells[0].value,'1904-01-01');
 const bad=await extractDocument(book({A1:{t:'n',v:60,z:'yyyy-mm-dd'},B1:{t:'n',v:1.5,z:'[h]:mm'},C1:{t:'n',v:0.5,z:'hh:mm'}}),'xlsx');
 assert.deepEqual(bad.sheets[0].cells.map(x=>x.value),[60,1.5,0.5]);
 assert.deepEqual(bad.warnings.map(x=>x.code),['EXCEL_FICTITIOUS_DATE','TIME_VALUE_PRESERVED','TIME_VALUE_PRESERVED']);
});
test('rejects oversized text and malformed documents with typed errors',async()=>{
 await assert.rejects(extractDocument(book({A1:{t:'s',v:'x'.repeat(10001)}}),'xlsx'),{code:'EXTRACTION_LIMIT'});
 await assert.rejects(extractDocument(Buffer.from('not a document'),'xlsx'),{code:'EXTRACTION_FORMAT'});
 await assert.rejects(extractDocument(Buffer.from('not a pdf'),'pdf'),{code:'EXTRACTION_FORMAT'});
});
function pdf(text) {
 const stream=text?`BT /F1 12 Tf 50 700 Td (${text}) Tj ET`:'';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let data='%PDF-1.4\n', offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(data.length);data+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=data.length;data+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return Buffer.from(data);
}
test('extracts PDF page text and flags pages without text for possible OCR',async()=>{
 const r=await extractDocument(pdf('Invoice total 123.45'),'pdf');
 assert.match(r.pages[0].text,/Invoice total 123.45/);assert.equal(r.ocr_required,false);
 const blank=await extractDocument(pdf(''),'pdf');assert.equal(blank.ocr_required,true);assert.deepEqual(blank.empty_page_numbers,[1]);
});
test('rejects actual expanded ZIP data over the per-entry bound',async()=>{
 const {zipSync}=await import('fflate');const zip=zipSync({'[Content_Types].xml':Buffer.from('x'),'xl/workbook.xml':new Uint8Array(16*1024*1024+1)},{level:9});
 await assert.rejects(extractDocument(zip,'xlsx'),{code:'EXTRACTION_LIMIT'});
});
test('preserves zero serial in 1900 date system instead of emitting an invalid ISO date',async()=>{
 const r=await extractDocument(book({A1:{t:'n',v:0,z:'yyyy-mm-dd'}}),'xlsx');assert.equal(r.sheets[0].cells[0].value,0);assert.equal(r.warnings[0].code,'INVALID_EXCEL_DATE');
});
