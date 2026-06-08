import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from './crypto-utils.js';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTED_TOKEN_PREFIX = 'enc';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function base64UrlEncode(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url');
}

function decodeKeyMaterial(keyMaterial) {
  if (!keyMaterial) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required');
  }

  const trimmed = keyMaterial.trim();

  if (trimmed.startsWith('hex:')) {
    return Buffer.from(trimmed.slice(4), 'hex');
  }

  if (trimmed.startsWith('base64:')) {
    return Buffer.from(trimmed.slice(7), 'base64');
  }

  if (trimmed.startsWith('base64url:')) {
    return Buffer.from(trimmed.slice(10), 'base64url');
  }

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length === KEY_BYTES * 2) {
    return Buffer.from(trimmed, 'hex');
  }

  const base64Key = Buffer.from(trimmed, 'base64');

  if (base64Key.length === KEY_BYTES) {
    return base64Key;
  }

  return Buffer.from(trimmed, 'base64url');
}

function getEncryptionKey(keyMaterial) {
  const key = decodeKeyMaterial(keyMaterial);

  if (key.length !== KEY_BYTES) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  return key;
}

function getAdditionalAuthenticatedData(keyVersion) {
  return Buffer.from(`social-token:${keyVersion}`, 'utf8');
}

export function encryptToken(token, { keyMaterial, keyVersion = 'v1' }) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Token must be a non-empty string');
  }

  const key = getEncryptionKey(keyMaterial);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  cipher.setAAD(getAdditionalAuthenticatedData(keyVersion));

  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_TOKEN_PREFIX,
    keyVersion,
    base64UrlEncode(iv),
    base64UrlEncode(authTag),
    base64UrlEncode(encrypted),
  ].join(':');
}

export function decryptToken(encryptedToken, { keyMaterial, keyVersion = 'v1' }) {
  if (typeof encryptedToken !== 'string' || encryptedToken.length === 0) {
    throw new Error('Encrypted token must be a non-empty string');
  }

  const [prefix, tokenKeyVersion, encodedIv, encodedAuthTag, encodedCiphertext] = encryptedToken.split(':');

  if (prefix !== ENCRYPTED_TOKEN_PREFIX || !tokenKeyVersion || !encodedIv || !encodedAuthTag || !encodedCiphertext) {
    throw new Error('Encrypted token has an invalid format');
  }

  if (tokenKeyVersion !== keyVersion) {
    throw new Error(`Encrypted token key version ${tokenKeyVersion} does not match configured version ${keyVersion}`);
  }

  const key = getEncryptionKey(keyMaterial);
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, base64UrlDecode(encodedIv));

  decipher.setAAD(getAdditionalAuthenticatedData(tokenKeyVersion));
  decipher.setAuthTag(base64UrlDecode(encodedAuthTag));

  return Buffer.concat([
    decipher.update(base64UrlDecode(encodedCiphertext)),
    decipher.final(),
  ]).toString('utf8');
}
