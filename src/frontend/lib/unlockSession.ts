import { base64ToBytes, bytesToBase64 } from "@/frontend/lib/crypto";
import type { TeacherVault, UserDeletionState, UserRole } from "@/shared/types";

export type UnlockedSession = {
  username: string;
  password: string;
  token: string;
  role: UserRole;
  deletion: UserDeletionState | null;
  vault: TeacherVault;
  selectedDate: string;
  cloudVersion?: string;
  persistAfterClose?: boolean;
};

type TrustedDeviceSessionBox = {
  version: 2;
  kind: "trusted-device-session";
  iv: string;
  ciphertext: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

const unlockedSessionKey = "teacher-salary-tracker:unlocked-session";
const persistentLoginPreferencePrefix = "teacher-salary-tracker:persistent-login:";
const trustedUnlockDbName = "teacher-salary-tracker-trusted-unlock";
const trustedUnlockStoreName = "keys";
const trustedUnlockKeyId = "trusted-device-unlock-key-v1";
const trustedUnlockDays = 30;

export function readPersistentLoginPreference(username: string): boolean {
  if (!username.trim()) return false;
  return localStorage.getItem(persistentLoginPreferenceKey(username.trim())) === "true";
}

export function writePersistentLoginPreference(username: string, persistAfterClose: boolean): void {
  if (!username.trim()) return;
  localStorage.setItem(persistentLoginPreferenceKey(username.trim()), persistAfterClose ? "true" : "false");
}

export async function readUnlockedSession(): Promise<UnlockedSession | null> {
  const sessionSession = sessionStorage.getItem(unlockedSessionKey);
  if (sessionSession) {
    const session = parseUnlockedSession(sessionSession);
    if (session) return { ...session, persistAfterClose: false };
    sessionStorage.removeItem(unlockedSessionKey);
  }

  const persistentSession = localStorage.getItem(unlockedSessionKey);
  if (!persistentSession) return null;

  try {
    const parsed: unknown = JSON.parse(persistentSession);
    if (isTrustedDeviceSessionBox(parsed)) {
      const session = await decryptTrustedDeviceSession(parsed);
      if (session) return { ...session, persistAfterClose: true };
      clearUnlockedSession();
      return null;
    }
  } catch {
    // Fall through to legacy parser so older plaintext sessions can still be migrated.
  }

  const legacySession = parseUnlockedSession(persistentSession);
  if (!legacySession) {
    clearUnlockedSession();
    return null;
  }
  return { ...legacySession, persistAfterClose: true };
}

export async function writeUnlockedSession(session: UnlockedSession): Promise<void> {
  const normalizedSession: UnlockedSession = {
    ...session,
    persistAfterClose: Boolean(session.persistAfterClose)
  };
  const serialized = JSON.stringify(normalizedSession);
  if (normalizedSession.persistAfterClose) {
    try {
      const box = await encryptTrustedDeviceSession(normalizedSession);
      localStorage.setItem(unlockedSessionKey, JSON.stringify(box));
      sessionStorage.removeItem(unlockedSessionKey);
      return;
    } catch {
      sessionStorage.setItem(unlockedSessionKey, JSON.stringify({ ...normalizedSession, persistAfterClose: false }));
      localStorage.removeItem(unlockedSessionKey);
      return;
    }
  }

  sessionStorage.setItem(unlockedSessionKey, serialized);
  localStorage.removeItem(unlockedSessionKey);
  void deleteTrustedDeviceKey().catch(() => undefined);
}

export function clearUnlockedSession(): void {
  sessionStorage.removeItem(unlockedSessionKey);
  localStorage.removeItem(unlockedSessionKey);
  void deleteTrustedDeviceKey().catch(() => undefined);
}

function persistentLoginPreferenceKey(username: string): string {
  return `${persistentLoginPreferencePrefix}${encodeURIComponent(username)}`;
}

function parseUnlockedSession(raw: string): UnlockedSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<UnlockedSession>;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.password !== "string" ||
      typeof parsed.token !== "string" ||
      !parsed.vault ||
      typeof parsed.vault !== "object"
    ) {
      return null;
    }
    return parsed as UnlockedSession;
  } catch {
    return null;
  }
}

function isTrustedDeviceSessionBox(value: unknown): value is TrustedDeviceSessionBox {
  if (!value || typeof value !== "object") return false;
  const box = value as Partial<TrustedDeviceSessionBox>;
  return (
    box.version === 2 &&
    box.kind === "trusted-device-session" &&
    typeof box.iv === "string" &&
    typeof box.ciphertext === "string" &&
    typeof box.expiresAt === "string"
  );
}

async function encryptTrustedDeviceSession(session: UnlockedSession): Promise<TrustedDeviceSessionBox> {
  const key = await trustedDeviceKey(true);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bufferSource(iv) },
    key,
    bufferSource(plaintext)
  );
  const now = new Date().toISOString();
  return {
    version: 2,
    kind: "trusted-device-session",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + trustedUnlockDays * 24 * 60 * 60 * 1000).toISOString()
  };
}

async function decryptTrustedDeviceSession(box: TrustedDeviceSessionBox): Promise<UnlockedSession | null> {
  if (box.expiresAt <= new Date().toISOString()) return null;
  const key = await trustedDeviceKey(false);
  if (!key) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bufferSource(base64ToBytes(box.iv)) },
      key,
      bufferSource(base64ToBytes(box.ciphertext))
    );
    return parseUnlockedSession(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function trustedDeviceKey(createIfMissing: true): Promise<CryptoKey>;
async function trustedDeviceKey(createIfMissing: false): Promise<CryptoKey | null>;
async function trustedDeviceKey(createIfMissing: boolean): Promise<CryptoKey | null> {
  if (!supportsTrustedDeviceStorage()) {
    if (createIfMissing) throw new Error("Trusted unlock storage is not available.");
    return null;
  }
  const existing = await readTrustedDeviceKey();
  if (existing || !createIfMissing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  await writeTrustedDeviceKey(key);
  return key;
}

function supportsTrustedDeviceStorage(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window && Boolean(crypto.subtle);
}

async function openTrustedDeviceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(trustedUnlockDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(trustedUnlockStoreName)) {
        db.createObjectStore(trustedUnlockStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Trusted unlock storage failed."));
  });
}

async function readTrustedDeviceKey(): Promise<CryptoKey | null> {
  if (!supportsTrustedDeviceStorage()) return null;
  const db = await openTrustedDeviceDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(trustedUnlockStoreName, "readonly");
      const request = transaction.objectStore(trustedUnlockStoreName).get(trustedUnlockKeyId);
      request.onsuccess = () => resolve(isCryptoKey(request.result) ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("Trusted unlock key read failed."));
    });
  } finally {
    db.close();
  }
}

async function writeTrustedDeviceKey(key: CryptoKey): Promise<void> {
  if (!supportsTrustedDeviceStorage()) throw new Error("Trusted unlock storage is not available.");
  const db = await openTrustedDeviceDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(trustedUnlockStoreName, "readwrite");
      const request = transaction.objectStore(trustedUnlockStoreName).put(key, trustedUnlockKeyId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Trusted unlock key write failed."));
    });
  } finally {
    db.close();
  }
}

async function deleteTrustedDeviceKey(): Promise<void> {
  if (!supportsTrustedDeviceStorage()) return;
  const db = await openTrustedDeviceDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(trustedUnlockStoreName, "readwrite");
      const request = transaction.objectStore(trustedUnlockStoreName).delete(trustedUnlockKeyId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Trusted unlock key delete failed."));
    });
  } finally {
    db.close();
  }
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return Boolean(value && typeof value === "object" && "algorithm" in value && "usages" in value && "type" in value);
}
