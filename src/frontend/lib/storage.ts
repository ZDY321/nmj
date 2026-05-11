import type { CloudSession, EncryptedBox, Notice, TeacherVault, UserDeletionState, UserRole, UserStatus } from "../../shared/types";
import { apiRequest, getLoginNotice } from "./cloud";
import {
  createPasswordSalt,
  decryptJson,
  derivePasswordVerifier,
  encryptJson,
  randomBase64
} from "./crypto";
import { createSampleVault } from "./sampleData";

const storagePrefix = "teacher-salary-tracker:vault:";
const accountsKey = "teacher-salary-tracker:accounts";
const sessionKey = "teacher-salary-tracker:session";

type LookupResponse = {
  username: string;
  passwordSalt: string;
};

type VaultDocumentResponse = {
  encrypted_payload: string;
  updated_at: string;
};

export type LocalAccount = {
  id?: string;
  username: string;
  role: UserRole;
  status?: UserStatus;
  createdAt: string;
};

export type StoredSession = {
  token: string;
  account: LocalAccount;
};

export type AuthenticatedVault = {
  token: string;
  account: LocalAccount;
  vault: TeacherVault;
  deletion: UserDeletionState | null;
};

function storageKey(username: string): string {
  return `${storagePrefix}${username}`;
}

function normalizeUsername(username: string): string {
  return username.trim();
}

export function listAccounts(): LocalAccount[] {
  const stored = localStorage.getItem(accountsKey);
  if (!stored) {
    return [];
  }

  try {
    return JSON.parse(stored) as LocalAccount[];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: LocalAccount[]): void {
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
}

function upsertAccount(account: LocalAccount): void {
  const accounts = listAccounts().filter((item) => item.username !== account.username);
  saveAccounts([account, ...accounts]);
}

export function hasAnyAccount(): boolean {
  return listAccounts().length > 0;
}

export function getAccount(username: string): LocalAccount | undefined {
  return listAccounts().find((account) => account.username === username);
}

export function hasStoredVault(username: string): boolean {
  return Boolean(localStorage.getItem(storageKey(username)));
}

export function getStoredSession(): StoredSession | null {
  const stored = localStorage.getItem(sessionKey);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem(sessionKey);
}

function accountFromSession(session: CloudSession): LocalAccount {
  return {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role,
    status: session.user.status,
    createdAt: new Date().toISOString()
  };
}

async function cloudNoticeFallback(): Promise<Notice | null> {
  try {
    return await getLoginNotice();
  } catch {
    return null;
  }
}

async function withCloudNotice(vault: TeacherVault): Promise<TeacherVault> {
  const notice = await cloudNoticeFallback();
  if (!notice) {
    return vault;
  }
  return {
    ...vault,
    notice
  };
}

async function encryptedDataKeyByPassword(password: string): Promise<string> {
  const dataKey = randomBase64(32);
  const box = await encryptJson({ dataKey }, password);
  return JSON.stringify(box);
}

export async function registerAccount(
  username: string,
  password: string
): Promise<AuthenticatedVault> {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    throw new Error("请输入用户名。");
  }

  const passwordSalt = createPasswordSalt();
  const passwordVerifier = await derivePasswordVerifier(password, passwordSalt);
  const vault = createSampleVault();
  vault.profile.displayName = normalizedUsername;
  const notice = await cloudNoticeFallback();
  if (notice) {
    vault.notice = notice;
  }

  const encryptedVault = await encryptJson(vault, password);
  const encryptedDataKey = await encryptedDataKeyByPassword(password);

  const session = await apiRequest<CloudSession>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username: normalizedUsername,
      passwordVerifier,
      passwordSalt,
      encryptedDataKeyByPassword: encryptedDataKey,
      encryptedDataKeyByRecovery: encryptedDataKey,
      encryptedPayload: JSON.stringify(encryptedVault)
    })
  });

  const account = accountFromSession(session);
  upsertAccount(account);
  saveSession({ token: session.token, account });
  localStorage.setItem(storageKey(normalizedUsername), JSON.stringify(encryptedVault));

  return {
    token: session.token,
    account,
    vault,
    deletion: session.user.deletion
  };
}

export async function loginAccount(username: string, password: string): Promise<AuthenticatedVault> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error("请输入用户名。");
  }

  const lookup = await apiRequest<LookupResponse>(
    `/api/auth/lookup?username=${encodeURIComponent(normalizedUsername)}`
  );
  const passwordVerifier = await derivePasswordVerifier(password, lookup.passwordSalt);
  const session = await apiRequest<CloudSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: normalizedUsername,
      passwordVerifier
    })
  });

  const account = accountFromSession(session);
  const vault = await loadCloudVault(session.token, password, normalizedUsername);
  upsertAccount(account);
  saveSession({ token: session.token, account });

  return {
    token: session.token,
    account,
    vault,
    deletion: session.user.deletion
  };
}

export async function loadCloudVault(
  token: string,
  password: string,
  username: string
): Promise<TeacherVault> {
  try {
    const document = await apiRequest<VaultDocumentResponse>("/api/me/vault", { token });
    const box = JSON.parse(document.encrypted_payload) as EncryptedBox;
    const vault = await decryptJson<TeacherVault>(box, password);
    localStorage.setItem(storageKey(username), JSON.stringify(box));
    return withCloudNotice(vault);
  } catch (error) {
    const stored = localStorage.getItem(storageKey(username));
    if (!stored) {
      throw error;
    }
    const vault = await decryptJson<TeacherVault>(JSON.parse(stored) as EncryptedBox, password);
    return withCloudNotice(vault);
  }
}

export async function loadVault(username: string, password: string): Promise<TeacherVault> {
  const stored = localStorage.getItem(storageKey(username));
  if (!stored) {
    throw new Error("Account does not exist");
  }

  return withCloudNotice(await decryptJson<TeacherVault>(JSON.parse(stored) as EncryptedBox, password));
}

export async function saveVault(
  username: string,
  password: string,
  vault: TeacherVault,
  token?: string
): Promise<void> {
  const existing = localStorage.getItem(storageKey(username));
  const existingBox = existing ? (JSON.parse(existing) as EncryptedBox) : undefined;
  const encrypted = await encryptJson(vault, password, existingBox?.salt);
  encrypted.createdAt = existingBox?.createdAt ?? encrypted.createdAt;
  localStorage.setItem(storageKey(username), JSON.stringify(encrypted));

  if (token) {
    await apiRequest<{ ok: boolean; updatedAt: string }>("/api/me/vault", {
      method: "PUT",
      token,
      body: JSON.stringify({
        encryptedPayload: JSON.stringify(encrypted)
      })
    });
  }
}

export async function logoutCloud(token: string): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      token
    });
  } finally {
    clearStoredSession();
  }
}

export function clearVault(username: string): void {
  localStorage.removeItem(storageKey(username));
  saveAccounts(listAccounts().filter((account) => account.username !== username));
}
