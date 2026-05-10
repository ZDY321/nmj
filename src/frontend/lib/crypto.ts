import type { EncryptedBox } from "../../shared/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 210_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
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
