import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createToolkit } from '../src/tools.js';
function workbook() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['Date', 'Amount'], [46310, 125.5]]);
  sheet.A2.z = 'yyyy-mm-dd';
  XLSX.utils.book_append_sheet(book, sheet, 'Test');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
function kit(bytes, overrides = {}) {
  return createToolkit({ withAuthorized: async (account, callback) => {
    assert.equal(account, 'reader');
    return callback({ get: async endpoint => {
      assert.equal(endpoint, '/me/messages/message/attachments/attachment');
      return { '@odata.type': '#microsoft.graph.fileAttachment', name: 'test.xlsx', size: bytes.length,
        contentBytes: bytes.toString('base64'), ...overrides };
    } });
  } });
}
const input = { account: 'reader', message_id: 'message', attachment_id: 'attachment' };
test('named Outlook attachment extracts date-formatted Excel data and provenance without a file write', async () => {
  const result = await kit(workbook()).call('outlook_attachment_extract', input);
  assert.equal(result.account, 'reader');
  assert.equal(result.source.message_id, 'message');
  assert.equal(result.source.attachment_id, 'attachment');
  assert.match(result.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.extraction.date_system, '1900');
  const cells = result.extraction.sheets[0].cells;
  assert.equal(cells.find(cell => cell.address === 'A2').value, '2026-10-15');
  assert.equal(cells.find(cell => cell.address === 'B2').value, 125.5);
});

test('extraction rejects unsupported attachment types without interpreting content', async () => {
  await assert.rejects(kit(Buffer.from('not executable'), {name: 'script.js'}).call('outlook_attachment_extract', input), {code:'EXTRACTION_TYPE'});
});

test('extraction never evaluates corrupt workbook content and returns a typed failure', async () => {
  await assert.rejects(kit(Buffer.from('not a workbook')).call('outlook_attachment_extract', input), {code:'EXTRACTION_FORMAT'});
});

test('extraction rejects unexpected input fields before provider access', async () => {
  const toolkit = createToolkit({withAuthorized: () => { throw new Error('must not call provider'); }});
  await assert.rejects(toolkit.call('outlook_attachment_extract', {...input,path:'/etc/passwd'}), {code:'INPUT'});
});

test('worker deadline terminates parsing and reports a safe timeout', async () => {
  const {runParser} = await import('../src/extraction.js');
  await assert.rejects(runParser(workbook(), 'xlsx', {timeoutMs:1}), {code:'EXTRACTION_TIMEOUT'});
});

test('oversized extracted JSON fails rather than returning partial cells', async () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({length:500}, () => ['x'.repeat(9000)]));
  XLSX.utils.book_append_sheet(book, sheet, 'Large');
  const bytes = XLSX.write(book, {type:'buffer',bookType:'xlsx',compression:true});
  await assert.rejects(kit(bytes).call('outlook_attachment_extract', input), {code:'EXTRACTION_LIMIT'});
});
