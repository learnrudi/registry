import crypto from 'node:crypto';

export function randomBytes(size) {
  return crypto.randomBytes(size);
}

export function randomUUID() {
  return crypto.randomUUID();
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createCipheriv(algorithm, key, iv) {
  return crypto.createCipheriv(algorithm, key, iv);
}

export function createDecipheriv(algorithm, key, iv) {
  return crypto.createDecipheriv(algorithm, key, iv);
}

export function timingSafeEqual(left, right) {
  return crypto.timingSafeEqual(left, right);
}
