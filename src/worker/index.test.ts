import { beforeEach, expect, it, vi } from "vitest";
import worker from "./index";
import type { Env, UserRow } from "./types";
let user: UserRow;
let writes: Array<{ sql: string; values: unknown[] }>;
let docVersion: string;
let env: Env;
let expired: boolean;
beforeEach(() => {
  user = { id: "u", username: "synthetic", role: "teacher", status: "active", password_verifier: "verify", password_salt: "salt", encrypted_data_key_by_password: "p", encrypted_data_key_by_recovery: "r", created_at: "", updated_at: "", last_login_at: null, delete_requested_at: null, delete_requested_by: null, delete_notice_count: null, delete_second_confirmed_at: null, delete_scheduled_at: null, delete_cancelled_at: null, delete_reason: null, deleted_at: null };
  writes = []; docVersion = "v2"; expired = false;
  env = { DB: { prepare(sql: string) {
    let values: unknown[] = []; const statement = {
      bind(...args: unknown[]) { values = args; return statement; },
      async first() {
        if (sql.includes("FROM user_sessions")) return { user_id: "u", expires_at: expired ? "2000-01-01" : "2999-01-01" };
        if (sql.includes("FROM users")) return user;
        if (sql.includes("FROM encrypted_documents")) return { updated_at: docVersion, encrypted_payload: "ciphertext" };
        return null;
      },
      async all() { return { results: [] }; },
      async run() { writes.push({ sql, values }); return { success: true, meta: { changes: 1 } }; }
    }; return statement;
  } } as unknown as D1Database, ASSETS: { fetch: vi.fn(async () => new Response("asset")) } as unknown as Fetcher, ADMIN_API_TOKEN: "legacy-synthetic" };
});
function request(path: string, method = "GET", body?: unknown, authenticated = true) {
  return new Request("https://synthetic.example" + path, { method, headers: { ...(authenticated ? { authorization: "Bearer synthetic" } : {}), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
it("keeps anonymous and expired sessions out of encrypted vault routes", async () => {
  expect((await worker.fetch(request("/api/me/vault", "GET", undefined, false), env)).status).toBe(401);
  expired = true; expect((await worker.fetch(request("/api/me/vault"), env)).status).toBe(401);
  expect(writes.some(write => write.sql.includes("DELETE FROM user_sessions WHERE token_hash"))).toBe(true);
});
it("keeps teacher accounts out of admin provider and deletion endpoints", async () => {
  expect((await worker.fetch(request("/api/admin/ai/providers"), env)).status).toBe(403);
  expect((await worker.fetch(request("/api/admin/users/other/delete-request", "POST", {}), env)).status).toBe(403);
  expect(writes.some(write => write.sql.includes("UPDATE users"))).toBe(false);
});
it("rejects stale encrypted vault writes and accepts a matching version using the authenticated owner", async () => {
  const conflict = await worker.fetch(request("/api/me/vault", "PUT", { encryptedPayload: "new", expectedUpdatedAt: "v1" }), env);
  expect(conflict.status).toBe(409); await expect(conflict.json()).resolves.toMatchObject({ currentUpdatedAt: "v2" });
  expect(writes.some(write => write.sql.includes("INSERT INTO encrypted_documents"))).toBe(false);
  const saved = await worker.fetch(request("/api/me/vault", "PUT", { encryptedPayload: "new", expectedUpdatedAt: "v2" }), env);
  expect(saved.status).toBe(200); expect(writes.find(write => write.sql.includes("INSERT INTO encrypted_documents"))?.values).toEqual(expect.arrayContaining(["u", "vault", "primary", "new"]));
});
it("validates AI input before any provider call", async () => {
  const result = await worker.fetch(request("/api/ai/schedule-draft", "POST", { instruction: "" }), env);
  expect(result.status).toBe(400); await expect(result.json()).resolves.toMatchObject({ error: "AI instruction required" });
});
it("requires password confirmation for the second deletion step", async () => {
  user.role = "admin";
  const response = await worker.fetch(request("/api/admin/users/other/delete-confirm", "POST", { passwordVerifier: "wrong" }), env);
  expect(response.status).toBe(401); expect(writes.some(write => write.sql.includes("delete_scheduled"))).toBe(false);
});
it("keeps security headers on static responses and translates missing migrations", async () => {
  const response = await worker.fetch(request("/"), env); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff"); expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  env.DB.prepare = () => { throw new Error("no such table: user_sessions"); };
  const failed = await worker.fetch(request("/api/health"), env); expect(failed.status).toBe(503); await expect(failed.json()).resolves.toMatchObject({ error: "Database migration required" });
});
