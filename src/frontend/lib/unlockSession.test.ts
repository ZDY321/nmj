import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUnlockedSession,
  readPersistentLoginPreference,
  readUnlockedSession,
  type UnlockedSession,
  writePersistentLoginPreference,
  writeUnlockedSession
} from "@/frontend/lib/unlockSession";
import type { TeacherVault } from "@/shared/types";

const unlockedSessionKey = "teacher-salary-tracker:unlocked-session";

const originalDescriptors = {
  localStorage: Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
  sessionStorage: Object.getOwnPropertyDescriptor(globalThis, "sessionStorage"),
  window: Object.getOwnPropertyDescriptor(globalThis, "window"),
  indexedDB: Object.getOwnPropertyDescriptor(globalThis, "indexedDB")
};

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function restoreGlobal(name: keyof typeof originalDescriptors): void {
  const descriptor = originalDescriptors[name];
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }
  delete (globalThis as Record<string, unknown>)[name];
}

function installMemoryStorage(): void {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });
}

function installNoTrustedDeviceStorage(): void {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
}

function installTrustedDeviceStorage(): void {
  const indexedDB = createFakeIndexedDB();
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { indexedDB }, configurable: true });
}

function createFakeIndexedDB(): IDBFactory {
  const storesByDb = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();

  return {
    open(name: string): IDBOpenDBRequest {
      const request: Partial<IDBOpenDBRequest> = {};
      queueMicrotask(() => {
        let stores = storesByDb.get(name);
        const needsUpgrade = !stores;
        if (!stores) {
          stores = new Map<string, Map<IDBValidKey, unknown>>();
          storesByDb.set(name, stores);
        }
        const db = createFakeDatabase(stores);
        Object.assign(request, { result: db });
        if (needsUpgrade) request.onupgradeneeded?.call(request as IDBOpenDBRequest, new Event("upgradeneeded") as IDBVersionChangeEvent);
        request.onsuccess?.call(request as IDBOpenDBRequest, new Event("success"));
      });
      return request as IDBOpenDBRequest;
    }
  } as IDBFactory;
}

function createFakeDatabase(stores: Map<string, Map<IDBValidKey, unknown>>): IDBDatabase {
  return {
    objectStoreNames: {
      contains: (name: string) => stores.has(name)
    },
    createObjectStore: (name: string) => {
      const store = stores.get(name) ?? new Map<IDBValidKey, unknown>();
      stores.set(name, store);
      return createFakeObjectStore(store);
    },
    transaction: (name: string) => {
      const store = stores.get(name) ?? new Map<IDBValidKey, unknown>();
      stores.set(name, store);
      return {
        objectStore: () => createFakeObjectStore(store)
      };
    },
    close: vi.fn()
  } as unknown as IDBDatabase;
}

function createFakeObjectStore(store: Map<IDBValidKey, unknown>): IDBObjectStore {
  return {
    get(key: IDBValidKey): IDBRequest {
      return resolveRequest(() => store.get(key));
    },
    put(value: unknown, key: IDBValidKey): IDBRequest {
      return resolveRequest(() => {
        store.set(key, value);
        return key;
      });
    },
    delete(key: IDBValidKey): IDBRequest {
      return resolveRequest(() => {
        store.delete(key);
        return undefined;
      });
    }
  } as IDBObjectStore;
}

function resolveRequest<T>(resolveValue: () => T): IDBRequest<T> {
  const request: Partial<IDBRequest<T>> = {};
  queueMicrotask(() => {
    Object.assign(request, { result: resolveValue() });
    request.onsuccess?.call(request as IDBRequest<T>, new Event("success"));
  });
  return request as IDBRequest<T>;
}

function makeVault(): TeacherVault {
  return {
    version: 1,
    profile: { displayName: "Teacher", baseSalary: 0, currency: "CNY" },
    preferences: { weekStartsOn: 1 },
    campuses: [],
    students: [],
    courseGroups: [],
    scheduleRules: [],
    lessons: [],
    salaryAdjustments: [],
    notice: { enabled: false, title: "", content: "", updatedAt: "2026-06-01T00:00:00.000Z" }
  };
}

function makeSession(persistAfterClose: boolean): UnlockedSession {
  return {
    username: "teacher",
    password: "data-password",
    token: "cloud-token",
    role: "teacher",
    deletion: null,
    vault: makeVault(),
    selectedDate: "2026-06-22",
    cloudVersion: "version_1",
    persistAfterClose
  };
}

beforeEach(() => {
  vi.useRealTimers();
  installMemoryStorage();
  installNoTrustedDeviceStorage();
});

afterEach(() => {
  vi.useRealTimers();
  restoreGlobal("localStorage");
  restoreGlobal("sessionStorage");
  restoreGlobal("window");
  restoreGlobal("indexedDB");
});

describe("unlock session strategy", () => {
  it("stores only-current-window sessions in sessionStorage and clears localStorage", async () => {
    await writeUnlockedSession(makeSession(false));

    expect(sessionStorage.getItem(unlockedSessionKey)).toContain("data-password");
    expect(localStorage.getItem(unlockedSessionKey)).toBeNull();

    const restored = await readUnlockedSession();
    expect(restored).toMatchObject({
      username: "teacher",
      password: "data-password",
      persistAfterClose: false
    });
  });

  it("falls back to current-window storage when trusted-device encryption is unavailable", async () => {
    await writeUnlockedSession(makeSession(true));

    expect(localStorage.getItem(unlockedSessionKey)).toBeNull();
    expect(sessionStorage.getItem(unlockedSessionKey)).toContain("\"persistAfterClose\":false");
    expect(await readUnlockedSession()).toMatchObject({ username: "teacher", persistAfterClose: false });
  });

  it("encrypts trusted-device sessions in localStorage without storing the plaintext password", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    installTrustedDeviceStorage();

    await writeUnlockedSession(makeSession(true));

    const rawLocalSession = localStorage.getItem(unlockedSessionKey);
    expect(sessionStorage.getItem(unlockedSessionKey)).toBeNull();
    expect(rawLocalSession).not.toContain("data-password");
    expect(rawLocalSession).not.toContain("cloud-token");
    expect(JSON.parse(rawLocalSession ?? "{}")).toMatchObject({
      version: 2,
      kind: "trusted-device-session",
      expiresAt: "2026-07-22T00:00:00.000Z"
    });

    const restored = await readUnlockedSession();
    expect(restored).toMatchObject({
      username: "teacher",
      password: "data-password",
      token: "cloud-token",
      persistAfterClose: true
    });
  });

  it("drops expired trusted-device sessions instead of restoring them", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    installTrustedDeviceStorage();
    await writeUnlockedSession(makeSession(true));
    const box = JSON.parse(localStorage.getItem(unlockedSessionKey) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(unlockedSessionKey, JSON.stringify({ ...box, expiresAt: "2026-06-21T23:59:59.000Z" }));

    expect(await readUnlockedSession()).toBeNull();
    expect(localStorage.getItem(unlockedSessionKey)).toBeNull();
    expect(sessionStorage.getItem(unlockedSessionKey)).toBeNull();
  });

  it("clears both unlock stores and keeps persistent-login preference separate", async () => {
    await writeUnlockedSession(makeSession(false));
    writePersistentLoginPreference(" teacher ", true);
    writePersistentLoginPreference("other", false);

    expect(readPersistentLoginPreference("teacher")).toBe(true);
    expect(readPersistentLoginPreference("other")).toBe(false);

    clearUnlockedSession();
    expect(sessionStorage.getItem(unlockedSessionKey)).toBeNull();
    expect(localStorage.getItem(unlockedSessionKey)).toBeNull();
    expect(readPersistentLoginPreference(" teacher ")).toBe(true);
  });
});
