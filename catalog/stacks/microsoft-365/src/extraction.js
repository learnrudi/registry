import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SafeError } from './contracts.js';

const WORKER = fileURLToPath(new URL('./extract-worker.js', import.meta.url));
const OUTPUT_LIMIT = 4 * 1024 * 1024;
let active = 0;

export async function extractAttachment(attachments, input) {
  if (active >= 2) throw new SafeError('BUSY', 'Two extractions are already running; retry after they finish.');
  active++;
  try {
    const { bytes, name } = await attachments.read(input);
    const format = name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : name.toLowerCase().endsWith('.pdf') ? 'pdf' : null;
    if (!format) throw new SafeError('EXTRACTION_TYPE', 'Only .xlsx and .pdf file attachments are supported.');
    const extraction = await runParser(bytes, format);
    return { account: input.account, source: { message_id: input.message_id, attachment_id: input.attachment_id,
      name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, extraction };
  } finally { active--; }
}

export function runParser(bytes, format, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=256', WORKER, format], {
      env: {}, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
    });
    const chunks = [];
    let size = 0;
    let failure;
    const abort = (code, message) => { failure ??= new SafeError(code, message); child.kill('SIGKILL'); };
    const timer = setTimeout(() => abort('EXTRACTION_TIMEOUT', 'Extraction exceeded its time limit.'), options.timeoutMs ?? 20000);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > OUTPUT_LIMIT) abort('EXTRACTION_LIMIT', 'Extraction exceeded its output limit.');
      else chunks.push(chunk);
    });
    child.stdin.on('error', () => {}); // Early parser exit is handled by close, without leaking input.
    child.on('error', () => { failure = new SafeError('EXTRACTION_FAILED', 'Unable to start the document parser.'); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) return reject(new SafeError('EXTRACTION_FAILED', 'Document parser failed or exceeded memory limits.'));
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (result.error) return reject(new SafeError(result.error.code, result.error.message));
        if (!result.extraction || typeof result.extraction !== 'object') throw new Error('Invalid parser response');
        resolve(result.extraction);
      } catch { reject(new SafeError('EXTRACTION_FAILED', 'Document parser returned an invalid result.')); }
    });
    child.stdin.end(bytes);
  });
}
