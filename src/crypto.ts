/**
 * Password hashing and secret encryption, both on WebCrypto.
 *
 * Users hand this app a mail app-password so it can send on their behalf, so
 * that value is encrypted at rest rather than sat in KV as plain text.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Iterations the BROWSER runs before sending anything. The Worker never does
 * this work, so the cost lands on the visitor's machine (~0.5s once per login)
 * instead of the 10ms CPU budget a Workers Free request gets.
 *
 * Must stay in sync with the same constant in the login/signup page script.
 */
export const CLIENT_PBKDF2_ITERATIONS = 600_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Folds the configured master secret into a fixed-length AES-GCM key. */
async function aesKey(masterSecret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(masterSecret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Returns base64(iv ‖ ciphertext) — a fresh random IV every time. */
export async function encryptSecret(masterSecret: string, plaintext: string): Promise<string> {
  const key = await aesKey(masterSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext))
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv);
  packed.set(cipher, iv.length);
  return toBase64(packed);
}

export async function decryptSecret(masterSecret: string, payload: string): Promise<string> {
  const key = await aesKey(masterSecret);
  const packed = fromBase64(payload);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.subarray(0, 12) },
    key,
    packed.subarray(12)
  );
  return dec.decode(plain);
}

/**
 * Hashes the key the browser already derived, with a random per-user salt.
 *
 * This is a single SHA-256 — deliberately cheap, because the expensive
 * stretching already happened client-side. The salt still matters: it stops a
 * stolen KV dump from being replayed straight back as a login, and stops one
 * leaked record from revealing that two users share a password.
 *
 * Pass an existing salt to verify, omit it to enrol.
 */
export async function hashClientKey(
  clientKey: string,
  existingSalt?: string
): Promise<{ hash: string; salt: string }> {
  const salt = existingSalt ? fromBase64(existingSalt) : crypto.getRandomValues(new Uint8Array(16));
  const keyBytes = enc.encode(clientKey);
  const input = new Uint8Array(salt.length + keyBytes.length);
  input.set(salt);
  input.set(keyBytes, salt.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return { hash: toBase64(new Uint8Array(digest)), salt: toBase64(salt) };
}

/** Constant-time compare, so a wrong hash can't be narrowed down by timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
