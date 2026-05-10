import type { EncryptedBox, TeacherVault, UserRole } from "../../shared/types";
import { decryptJson, encryptJson } from "./crypto";
import { createSampleVault } from "./sampleData";

const storagePrefix = "teacher-salary-tracker:vault:";
const accountsKey = "teacher-salary-tracker:accounts";

export type LocalAccount = {
  username: string;
  role: UserRole;
  createdAt: string;
};

function storageKey(username: string): string {
  return `${storagePrefix}${username}`;
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

export function hasAnyAccount(): boolean {
  return listAccounts().length > 0;
}

export function getAccount(username: string): LocalAccount | undefined {
  return listAccounts().find((account) => account.username === username);
}

export function hasStoredVault(username: string): boolean {
  return Boolean(localStorage.getItem(storageKey(username)));
}

export async function registerAccount(
  username: string,
  password: string
): Promise<LocalAccount> {
  const normalizedUsername = username.trim();
  const accounts = listAccounts();

  if (!normalizedUsername) {
    throw new Error("Username is required");
  }

  if (accounts.some((account) => account.username === normalizedUsername)) {
    throw new Error("Account already exists");
  }

  const role: UserRole = accounts.length === 0 ? "admin" : "teacher";
  const account: LocalAccount = {
    username: normalizedUsername,
    role,
    createdAt: new Date().toISOString()
  };

  const vault = createSampleVault();
  vault.profile.displayName = role === "admin" ? "管理员" : normalizedUsername;
  await saveVault(normalizedUsername, password, vault);
  saveAccounts([...accounts, account]);

  return account;
}

export async function loadVault(username: string, password: string): Promise<TeacherVault> {
  const stored = localStorage.getItem(storageKey(username));
  if (!stored) {
    throw new Error("Account does not exist");
  }

  return decryptJson<TeacherVault>(JSON.parse(stored) as EncryptedBox, password);
}

export async function saveVault(
  username: string,
  password: string,
  vault: TeacherVault
): Promise<void> {
  const existing = localStorage.getItem(storageKey(username));
  const existingBox = existing ? (JSON.parse(existing) as EncryptedBox) : undefined;
  const encrypted = await encryptJson(vault, password, existingBox?.salt);
  encrypted.createdAt = existingBox?.createdAt ?? encrypted.createdAt;
  localStorage.setItem(storageKey(username), JSON.stringify(encrypted));
}

export function clearVault(username: string): void {
  localStorage.removeItem(storageKey(username));
  saveAccounts(listAccounts().filter((account) => account.username !== username));
}
