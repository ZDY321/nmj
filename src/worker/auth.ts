import { upsertEncryptedPayload } from "./encryptedPayloads";
import { daysFromNow, forbidden, isValidUsername, json, normalizeUsername, notFound, readJson, sessionDays, sessionUser, unauthorized, vaultDocKey, vaultDocType } from "./runtime";
import { getSetting } from "./settings";
import { AuthContext, Env, LoginRequest, RegisterRequest, UserRow } from "./types";

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/[+/=]/g, "");
}

export async function cleanupExpiredSessions(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();
}

async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const expiresAt = daysFromNow(sessionDays);

  await env.DB.prepare(
    `INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(tokenHash, userId, now, expiresAt, now)
    .run();

  return token;
}

export async function getUserById(env: Env, userId: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT
      id,
      username,
      password_verifier,
      password_salt,
      encrypted_data_key_by_password,
      encrypted_data_key_by_recovery,
      role,
      status,
      created_at,
      updated_at,
      last_login_at,
      delete_requested_at,
      delete_requested_by,
      delete_notice_count,
      delete_second_confirmed_at,
      delete_scheduled_at,
      delete_cancelled_at,
      delete_reason,
      deleted_at
     FROM users
     WHERE id = ?`
  )
    .bind(userId)
    .first<UserRow>();
}

async function getUserByUsername(env: Env, username: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT
      id,
      username,
      password_verifier,
      password_salt,
      encrypted_data_key_by_password,
      encrypted_data_key_by_recovery,
      role,
      status,
      created_at,
      updated_at,
      last_login_at,
      delete_requested_at,
      delete_requested_by,
      delete_notice_count,
      delete_second_confirmed_at,
      delete_scheduled_at,
      delete_cancelled_at,
      delete_reason,
      deleted_at
     FROM users
     WHERE username = ?`
  )
    .bind(username)
    .first<UserRow>();
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext | Response> {
  const token = bearerToken(request);
  if (!token) {
    return unauthorized();
  }

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT user_id, expires_at
     FROM user_sessions
     WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string }>();

  if (!row || row.expires_at <= new Date().toISOString()) {
    if (row) {
      await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(tokenHash).run();
    }
    return unauthorized();
  }

  const user = await getUserById(env, row.user_id);
  if (!user || user.status === "disabled" || user.status === "deleted" || user.deleted_at) {
    return forbidden();
  }

  await env.DB.prepare("UPDATE user_sessions SET last_seen_at = ? WHERE token_hash = ?")
    .bind(new Date().toISOString(), tokenHash)
    .run();

  return { tokenHash, user };
}

export function requireAdmin(context: AuthContext): Response | null {
  if (context.user.role !== "admin") {
    return forbidden();
  }
  return null;
}

export function isAuthorizedLegacyAdminRequest(request: Request, env: Env): boolean {
  const token = env.ADMIN_API_TOKEN;
  if (!token) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

export async function authLookup(request: Request, env: Env): Promise<Response> {
  const username = normalizeUsername(new URL(request.url).searchParams.get("username") ?? "");
  if (!username) {
    return json({ error: "Missing username" }, 400);
  }

  const user = await getUserByUsername(env, username);
  if (!user || user.status === "deleted") {
    return notFound();
  }

  return json({
    username: user.username,
    passwordSalt: user.password_salt
  });
}

export async function registerUser(request: Request, env: Env): Promise<Response> {
  const body = await readJson<RegisterRequest>(request);
  const username = normalizeUsername(body.username ?? "");
  const now = new Date().toISOString();
  const registrationEnabled = (await getSetting(env, "registration_enabled")) !== "false";

  if (!registrationEnabled) {
    return json({ error: "Registration is closed" }, 403);
  }

  if (
    !username ||
    !body.passwordVerifier ||
    !body.passwordSalt ||
    !body.encryptedDataKeyByPassword ||
    !body.encryptedDataKeyByRecovery
  ) {
    return json({ error: "Missing required registration fields" }, 400);
  }

  if (!isValidUsername(username)) {
    return json({ error: "Invalid username" }, 400);
  }

  const existingUsers = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE status != 'deleted'").first<{
    total: number;
  }>();
  const role = (existingUsers?.total ?? 0) === 0 ? "admin" : "teacher";
  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(
      `INSERT INTO users (
        id,
        username,
        password_verifier,
        password_salt,
        encrypted_data_key_by_password,
        encrypted_data_key_by_recovery,
        role,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    )
      .bind(
        id,
        username,
        body.passwordVerifier,
        body.passwordSalt,
        body.encryptedDataKeyByPassword,
        body.encryptedDataKeyByRecovery,
        role,
        now,
        now
      )
      .run();
  } catch {
    return json({ error: "Account already exists" }, 409);
  }

  if (body.encryptedPayload) {
    await upsertEncryptedPayload(env, id, vaultDocType, vaultDocKey, body.encryptedPayload);
  }

  const token = await createSession(env, id);
  const user = await getUserById(env, id);
  return json({ token, user: sessionUser(user!) }, 201);
}

export async function loginUser(request: Request, env: Env): Promise<Response> {
  const body = await readJson<LoginRequest>(request);
  const username = normalizeUsername(body.username ?? "");
  if (!username || !body.passwordVerifier) {
    return json({ error: "Missing username or password verifier" }, 400);
  }

  const user = await getUserByUsername(env, username);
  if (!user || user.status === "deleted" || user.deleted_at) {
    return unauthorized();
  }
  if (user.status === "disabled") {
    return forbidden();
  }
  if (user.password_verifier !== body.passwordVerifier) {
    return unauthorized();
  }

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, user.id)
    .run();

  if (user.status === "delete_requested" || user.status === "delete_scheduled") {
    await env.DB.prepare("UPDATE users SET delete_notice_count = delete_notice_count + 1 WHERE id = ?")
      .bind(user.id)
      .run();
  }

  const refreshed = await getUserById(env, user.id);
  const token = await createSession(env, user.id);
  return json({ token, user: sessionUser(refreshed!) });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }
  await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(context.tokenHash).run();
  return json({ ok: true });
}

export async function me(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }
  return json({ user: sessionUser(context.user) });
}
