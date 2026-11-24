import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';

export interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface VapidHeaderOptions {
  endpoint: string;
  subject: string;
  publicKey: string;
  privateKey: string;
  expirationSeconds?: number;
  nowSeconds?: number;
}

export interface EncryptWebPushOptions {
  payload: Buffer | string;
  p256dh: string;
  auth: string;
  salt?: Buffer;
  serverPrivateKey?: Buffer;
  recordSize?: number;
}

export interface EncryptedWebPushResult {
  body: Buffer;
  salt: Buffer;
  serverPublicKey: Buffer;
}

const DEFAULT_RECORD_SIZE = 4096;
const DEFAULT_VAPID_EXP_SECONDS = 12 * 60 * 60;
const UNCOMPRESSED_POINT_PREFIX = 0x04;
const P256_UNCOMPRESSED_PUBKEY_BYTES = 65;
const P256_PRIVATE_KEY_BYTES = 32;
const AUTH_SECRET_BYTES = 16;
const SALT_BYTES = 16;

export function encodeBase64Url(input: Buffer | Uint8Array | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBase64Url(input: string): Buffer {
  const normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
}

/**
 * Generates an EC P-256 (prime256v1) VAPID key pair encoded in base64url:
 * - publicKey: 65-byte uncompressed point (0x04 || x || y)
 * - privateKey: 32-byte scalar d
 */
export function generateVapidKeyPair(): VapidKeyPair {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const publicKeyBuf = ecdh.getPublicKey();
  const privateKeyBuf = ecdh.getPrivateKey();
  return {
    publicKey: encodeBase64Url(publicKeyBuf),
    privateKey: encodeBase64Url(privateKeyBuf),
  };
}

function buildP256JwkFromRawKeys(publicKeyB64: string, privateKeyB64?: string) {
  const pubBuf = decodeBase64Url(publicKeyB64);
  if (pubBuf.length !== P256_UNCOMPRESSED_PUBKEY_BYTES || pubBuf[0] !== UNCOMPRESSED_POINT_PREFIX) {
    throw new Error('Invalid VAPID P-256 public key (expected 65-byte uncompressed point)');
  }
  const x = encodeBase64Url(pubBuf.subarray(1, 33));
  const y = encodeBase64Url(pubBuf.subarray(33, 65));

  if (!privateKeyB64) {
    return { kty: 'EC' as const, crv: 'P-256' as const, x, y };
  }

  const privBuf = decodeBase64Url(privateKeyB64);
  if (privBuf.length !== P256_PRIVATE_KEY_BYTES) {
    throw new Error('Invalid VAPID P-256 private key (expected 32-byte scalar)');
  }

  return {
    kty: 'EC' as const,
    crv: 'P-256' as const,
    x,
    y,
    d: encodeBase64Url(privBuf),
  };
}

/**
 * Builds RFC 8292 VAPID Authorization header: `vapid t=<JWT>, k=<publicKey>`.
 */
export function buildVapidAuthorizationHeader(options: VapidHeaderOptions): string {
  const endpointUrl = new URL(options.endpoint);
  const audience = endpointUrl.origin;
  const nowSec = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expSec = nowSec + (options.expirationSeconds ?? DEFAULT_VAPID_EXP_SECONDS);

  const headerSegment = encodeBase64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payloadSegment = encodeBase64Url(
    JSON.stringify({
      aud: audience,
      exp: expSec,
      sub: options.subject,
    }),
  );

  const signingInput = `${headerSegment}.${payloadSegment}`;
  const jwk = buildP256JwkFromRawKeys(options.publicKey, options.privateKey);
  const privateKeyObj = createPrivateKey({ key: jwk, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(signingInput, 'utf8'), {
    key: privateKeyObj,
    dsaEncoding: 'ieee-p1363',
  });

  const jwt = `${signingInput}.${encodeBase64Url(signature)}`;
  return `vapid t=${jwt}, k=${options.publicKey}`;
}

/**
 * Verifies an RFC 8292 VAPID JWT signature against a raw base64url P-256 public key.
 */
export function verifyVapidJwt(jwt: string, publicKeyB64: string): boolean {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  const [headerSeg, payloadSeg, sigSeg] = parts;
  if (!headerSeg || !payloadSeg || !sigSeg) return false;

  const jwk = buildP256JwkFromRawKeys(publicKeyB64);
  const publicKeyObj = createPublicKey({ key: jwk, format: 'jwk' });
  return verify(
    'sha256',
    Buffer.from(`${headerSeg}.${payloadSeg}`, 'utf8'),
    { key: publicKeyObj, dsaEncoding: 'ieee-p1363' },
    decodeBase64Url(sigSeg),
  );
}

/**
 * Encrypts a Web Push payload using RFC 8291 / RFC 8188 (`aes128gcm` content coding).
 */
export function encryptWebPushPayload(options: EncryptWebPushOptions): EncryptedWebPushResult {
  const uaPublic = decodeBase64Url(options.p256dh);
  if (uaPublic.length !== P256_UNCOMPRESSED_PUBKEY_BYTES || uaPublic[0] !== UNCOMPRESSED_POINT_PREFIX) {
    throw new Error('Invalid subscription p256dh public key');
  }

  const authSecret = decodeBase64Url(options.auth);
  if (authSecret.length !== AUTH_SECRET_BYTES) {
    throw new Error('Invalid subscription auth secret (expected 16 bytes)');
  }

  const ecdh = createECDH('prime256v1');
  if (options.serverPrivateKey) {
    ecdh.setPrivateKey(options.serverPrivateKey);
  } else {
    ecdh.generateKeys();
  }

  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const salt = options.salt ? Buffer.from(options.salt) : randomBytes(SALT_BYTES);
  if (salt.length !== SALT_BYTES) {
    throw new Error('Salt must be exactly 16 bytes');
  }

  // RFC 8291 §3.3: IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info\0" || ua_public || as_public, L=32)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));

  // RFC 8291 §3.4 & RFC 8188: CEK (16 bytes) and NONCE (12 bytes)
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12),
  );

  const payloadBuf =
    typeof options.payload === 'string' ? Buffer.from(options.payload, 'utf8') : Buffer.from(options.payload);
  // RFC 8188 §2: delimiter 0x02 marks the final record with zero trailing padding
  const recordPlaintext = Buffer.concat([payloadBuf, Buffer.from([0x02])]);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(recordPlaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const recordSize = options.recordSize ?? DEFAULT_RECORD_SIZE;
  const rsBuf = Buffer.alloc(4);
  rsBuf.writeUInt32BE(recordSize, 0);

  const header = Buffer.concat([salt, rsBuf, Buffer.from([asPublic.length]), asPublic]);
  return {
    body: Buffer.concat([header, ciphertext]),
    salt,
    serverPublicKey: asPublic,
  };
}

/**
 * Decrypts an RFC 8291 (`aes128gcm`) encrypted payload given the user-agent private key and auth secret.
 * Used for cryptographic verification and end-to-end testing.
 */
export function decryptWebPushPayload(options: {
  body: Buffer;
  uaPrivateKey: Buffer;
  auth: string;
}): Buffer {
  const salt = options.body.subarray(0, 16);
  const idLen = options.body.readUInt8(20);
  const asPublic = options.body.subarray(21, 21 + idLen);
  const ciphertextWithTag = options.body.subarray(21 + idLen);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(options.uaPrivateKey);
  const uaPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(asPublic);
  const authSecret = decodeBase64Url(options.auth);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12),
  );

  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(authTag);
  const padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Strip trailing 0x00 padding bytes and final 0x02 delimiter
  let endIdx = padded.length - 1;
  while (endIdx >= 0 && padded[endIdx] === 0x00) {
    endIdx -= 1;
  }
  if (endIdx < 0 || padded[endIdx] !== 0x02) {
    throw new Error('Invalid RFC 8188 record delimiter');
  }
  return padded.subarray(0, endIdx);
}
