import { inferGmailContentType } from './gmail.js';
import type { gmail_v1 } from 'googleapis';

export function messageBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload || payload.filename) return '';
  if (/^text\/(html|plain)$/.test(payload.mimeType || '') && payload.body?.attachmentId) throw new Error('Message body is stored externally and cannot be read safely; no draft update was made.');
  if (payload.parts) {
    const parts = payload.parts.filter(part => !part.filename);
    if (payload.mimeType === 'multipart/alternative') {
      // Alternatives represent one logical body; prefer the richest supported form.
      const alternatives = [...parts].reverse();
      return messageBody(alternatives.find(part => containsTextPart(part, 'text/html'))
        || alternatives.find(part => containsTextPart(part, 'text/plain')));
    }
    if (payload.mimeType === 'multipart/related') {
      const contentType = payload.headers?.find(header => header.name?.toLowerCase() === 'content-type')?.value || '';
      const start = /;\s*start\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
      const rootId = start?.[1] || start?.[2];
      const root = rootId ? payload.parts.find(part => part.headers?.some(header =>
        header.name?.toLowerCase() === 'content-id' && header.value?.trim() === rootId)) : payload.parts[0];
      if (!root) throw new Error('Related message body root is not readable.');
      return messageBody(root);
    }
    const bodies = parts.map(messageBody).filter(body => body.trim());
    // Rebuilding independent MIME bodies as one HTML body could silently lose content.
    if (bodies.length > 1) throw new Error('Independent message body parts cannot be safely preserved; review a replacement body.');
    return bodies[0] || '';
  }
  return /^text\/(html|plain)$/.test(payload.mimeType || '') && payload.body?.data
    ? Buffer.from(payload.body.data, 'base64url').toString('utf8') : '';
}

function containsTextPart(payload: gmail_v1.Schema$MessagePart, mimeType: string): boolean {
  if (payload.filename) return false;
  return payload.mimeType === mimeType || Boolean(payload.parts?.some(part => containsTextPart(part, mimeType)));
}

export async function loadSignature(gmail: gmail_v1.Gmail, from?: string) {
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email = from || profile.data.emailAddress;
  if (!email || !/^[^\s<>@]+@[^\s<>@]+$/.test(email)) throw new Error('Cannot resolve sending address.');
  const result = await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: email });
  if (result.data.sendAsEmail?.toLowerCase() !== email.toLowerCase()) throw new Error('Signature address mismatch.');
  const signature = result.data.signature;
  if (typeof signature !== 'string' || signature.length > 100_000) throw new Error('No valid saved Gmail signature.');
  signatureCount('', signature);
  return { from: email, signature };
}

export async function verifySentSignature(gmail: gmail_v1.Gmail, id: string | null | undefined, signature: string) {
  try {
    if (!id) throw new Error('Missing sent message ID.');
    const sent = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    assertSignature(messageBody(sent.data.payload), signature);
    return { signatureVerified: true };
  } catch {
    return {
      signatureVerified: false,
      warning: 'Message was sent, but signature verification failed. Do not resend; inspect the sent message.',
    };
  }
}

function htmlText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function authoredBody(body: string): string {
  return body.split(/<blockquote\b|<[^>]*class=["'][^"']*gmail_quote|---------- Forwarded message/i)[0];
}

export function signatureCount(body: string, signature: string): number {
  const expected = htmlText(signature);
  if (!expected) throw new Error('A saved text-bearing Gmail signature is required. Configure one in Gmail settings.');
  return htmlText(authoredBody(body)).split(expected).length - 1;
}

export function assertSignature(body: string, signature: string): void {
  if (signatureCount(body, signature) !== 1) {
    throw new Error('Signature must appear exactly once in the authored message. Update the draft and review it before sending.');
  }
}

export function includeSignature(body: string, signature: string): string {
  const count = signatureCount(body, signature);
  if (count > 1) throw new Error('Duplicate signature: review the message before sending.');
  if (count === 1) return body;
  const html = inferGmailContentType(body).startsWith('text/html') ? body : body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');
  const boundary = html.search(/<blockquote\b|<[^>]*class=["'][^"']*gmail_quote|---------- Forwarded message/i);
  const block = `<br><div class="gmail_signature">${signature}</div><br>`;
  const result = boundary < 0 ? html + block : html.slice(0, boundary) + block + html.slice(boundary);
  assertSignature(result, signature);
  return result;
}
