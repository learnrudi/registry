import { publicError, SafeError } from './contracts.js';
import { extractDocument } from './extract-parser.js';

// Parsers never receive OAuth state or inherited environment. This is resource
// isolation, not an OS sandbox; attachments remain untrusted input.
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw new SafeError('EXTRACTION_LIMIT', 'Attachment exceeds 5 MiB.');
    chunks.push(chunk);
  }
  const extraction = await extractDocument(Buffer.concat(chunks), process.argv[2]);
  process.stdout.write(JSON.stringify({ extraction }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: publicError(error) }));
}
