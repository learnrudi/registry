const assert = require('node:assert/strict');
const { test } = require('node:test');
test('includes the approved HTML signature once and preserves plain text', async () => {
  const { includeSignature } = await import('./src/gmail-signature.ts');
  const signature = '<div>Sender Name<br>Company</div>';
  const result = includeSignature('Hello <team> & friends\nThanks', signature);
  assert.match(result, /Hello &lt;team&gt; &amp; friends<br>Thanks/);
  assert.ok(result.includes(signature));
  assert.equal(includeSignature(result, signature), result);
});
test('unsigned drafts cannot be sent and sent-read failures do not invite a duplicate send', async () => {
  const { assertSignature, verifySentSignature } = await import('./src/gmail-signature.ts');
  assert.throws(() => assertSignature('Hello', '<div>Sender Name</div>'), /review/);
  const gmail = { users: { messages: { get: async () => { throw new Error('private provider detail'); } } } };
  assert.deepEqual(await verifySentSignature(gmail, 'sent-id', '<div>Sender Name</div>'), {
    signatureVerified: false,
    warning: 'Message was sent, but signature verification failed. Do not resend; inspect the sent message.',
  });
});
test('quoted signatures do not replace the authored signature, and duplicates fail closed', async () => {
  const { includeSignature, assertSignature, signatureCount, messageBody, loadSignature } = await import('./src/gmail-signature.ts');
  const sig = '<div>Sender Name<br>Company</div>';
  const quoted = '<p>Reply</p><blockquote>' + sig + '</blockquote>';
  const result = includeSignature(quoted, sig);
  assert.equal(signatureCount(result, sig), 1);
  assert.ok(result.indexOf('gmail_signature') < result.indexOf('<blockquote>'));
  assert.throws(() => assertSignature(quoted, sig), /review/);
  assert.throws(() => includeSignature(sig + sig, sig), /Duplicate/);
  assert.throws(() => includeSignature('Hi', ''), /saved/);
  const part = (mimeType, body) => ({ mimeType, body: { data: Buffer.from(body).toString('base64url') } });
  assert.equal(messageBody({ mimeType: 'multipart/alternative', parts: [part('text/plain', 'plain'), part('text/html', sig), { ...part('text/html', 'attachment'), filename: 'a.html' }] }), sig);
  const requested = [];
  const gmail = { users: { getProfile: async () => ({data:{emailAddress:'sender@example.com'}}), settings: { sendAs: { get: async ({sendAsEmail}) => { requested.push(sendAsEmail); return {data:{sendAsEmail,signature:sig}}; } } } } };
  assert.deepEqual(await loadSignature(gmail), {from:'sender@example.com',signature:sig});
  assert.deepEqual(await loadSignature(gmail, 'alias@example.com'), {from:'alias@example.com',signature:sig});
  assert.deepEqual(requested, ['sender@example.com','alias@example.com']);
});
test('nested MIME alternatives represent one signed message body', async () => {
  const { messageBody, assertSignature } = await import('./src/gmail-signature.ts');
  const sig = '<div>Sender Name<br>Company</div>';
  const part = (mimeType, body) => ({ mimeType, body: { data: Buffer.from(body).toString('base64url') } });
  const html = '<p>Hello</p>' + sig;
  const payload = { mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [
      part('text/plain', 'Hello\nSender Name\nCompany'),
      { mimeType: 'multipart/related', parts: [part('text/html', html), { mimeType: 'image/png', filename: 'logo.png', body: { attachmentId: 'logo' } }] },
    ] },
    { ...part('text/plain', 'Unrelated attachment'), filename: 'notes.txt' },
  ] };
  assert.equal(messageBody(payload), html);
  assert.doesNotThrow(() => assertSignature(messageBody(payload), sig));
});
test('mixed independent authored parts fail closed rather than discard content', async () => {
  const { messageBody } = await import('./src/gmail-signature.ts');
  const part = (mimeType, body) => ({ mimeType, body: { data: Buffer.from(body).toString('base64url') } });
  const payload = { mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [part('text/plain', 'Hello Sender'), part('text/html', '<p>Hello Sender</p>')] },
    part('text/plain', 'IMPORTANT authored body continuation'),
  ] };
  assert.throws(() => messageBody(payload), /independent.*body/i);
});
