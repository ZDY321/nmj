import type { EncryptedBox } from "../../shared/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 210_000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomBase64(length: number): string {
  return bytesToBase64(randomBytes(length));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bufferSource(salt),
      iterations
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveVerifierBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bufferSource(salt),
      iterations
    },
    material,
    256
  );

  return new Uint8Array(bits);
}

export function createPasswordSalt(): string {
  return randomBase64(16);
}

export async function derivePasswordVerifier(password: string, salt: string): Promise<string> {
  const bytes = await deriveVerifierBytes(password, base64ToBytes(salt));
  return bytesToBase64(bytes);
}

export async function encryptJson<T>(
  value: T,
  password: string,
  existingSalt?: string
): Promise<EncryptedBox> {
  const salt = existingSalt ? base64ToBytes(existingSalt) : randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  const plaintext = encoder.encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bufferSource(iv) },
    key,
    bufferSource(plaintext)
  );
  const now = new Date().toISOString();

  return {
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    createdAt: now,
    updatedAt: now
  };
}

export async function decryptJson<T>(box: EncryptedBox, password: string): Promise<T> {
  const key = await deriveKey(password, base64ToBytes(box.salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(base64ToBytes(box.iv)) },
    key,
    bufferSource(base64ToBytes(box.ciphertext))
  );
  return JSON.parse(decoder.decode(decrypted)) as T;
}

export function makeId(prefix: string): string {
  const bytes = randomBytes(8);
  return `${prefix}_${bytesToBase64(bytes).replace(/[+/=]/g, "").slice(0, 11)}`;
}
