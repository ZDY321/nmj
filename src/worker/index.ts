import type {
  AdminSummary,
  AdminUser,
  Notice,
  SessionUser,
  UserDeletionState,
  UserRole,
  UserStatus
} from "../shared/types";

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_API_TOKEN?: string;
};

type RegisterRequest = {
  username: string;
  passwordVerifier: string;
  passwordSalt: string;
  encryptedDataKeyByPassword: string;
  encryptedDataKeyByRecovery: string;
  encryptedPayload?: string;
};

type LoginRequest = {
  username: string;
  passwordVerifier: string;
};

type EncryptedDocumentRequest = {
  encryptedPayload: string;
};

type PublicSettings = {
  registrationEnabled: boolean;
};

type UserRow = {
  id: string;
  username: string;
  password_verifier: string;
  password_salt: string;
  encrypted_data_key_by_password: string;
  encrypted_data_key_by_recovery: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  delete_requested_at: string | null;
  delete_requested_by: string | null;
  delete_notice_count: number | null;
  delete_second_confirmed_at: string | null;
  delete_scheduled_at: string | null;
  delete_cancelled_at: string | null;
  delete_reason: string | null;
  deleted_at: string | null;
};

type AuthContext = {
  tokenHash: string;
  user: UserRow;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

const defaultNotice: Notice = {
  enabled: true,
  title: "系统提示",
  content: "请及时核对课时、请假、补课和工资明细。敏感数据会加密保存。",
  updatedAt: "2026-05-10T00:00:00.000Z"
};

const vaultDocType = "vault";
const vaultDocKey = "primary";
const sessionDays = 30;
const deletionGraceDays = 10;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function normalizeUsername(username: string): string {
  return username.trim();
}

function isValidUsername(username: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,30}[A-Za-z0-9])$/.test(username);
}

function isUserRole(value: string): value is UserRole {
  return value === "teacher" || value === "admin";
}

function isUserStatus(value: string): value is UserStatus {
  return (
    value === "active" ||
    value === "disabled" ||
    value === "delete_requested" ||
    value === "delete_scheduled" ||
    value === "deleted"
  );
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function deletionState(row: UserRow): UserDeletionState | null {
  if (!row.delete_requested_at || row.status === "deleted") {
    return null;
  }

  return {
    requestedAt: row.delete_requested_at,
    requestedBy: row.delete_requested_by,
    noticeCount: row.delete_notice_count ?? 0,
    secondConfirmedAt: row.delete_second_confirmed_at,
    scheduledAt: row.delete_scheduled_at ?? daysFrom(row.delete_requested_at, deletionGraceDays),
    cancelledAt: row.delete_cancelled_at,
    reason: row.delete_reason
  };
}

function daysFrom(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function sessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    role: isUserRole(row.role) ? row.role : "teacher",
    status: isUserStatus(row.status) ? row.status : "active",
    displayName: row.username,
    deletion: deletionState(row)
  };
}

function adminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    username: row.username,
    role: isUserRole(row.role) ? row.role : "teacher",
    status: isUserStatus(row.status) ? row.status : "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    deletion: deletionState(row)
  };
}

async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

function forbidden(): Response {
  return json({ error: "Forbidden" }, 403);
}

function isMigrationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /no such table: user_sessions|no such table: user_deletion_events|no such column: .*delete_|no such column: deleted_at/i.test(
    error.message
  );
}

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

async function cleanupExpiredSessions(env: Env): Promise<void> {
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

async function getUserById(env: Env, userId: string): Promise<UserRow | null> {
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

async function requireAuth(request: Request, env: Env): Promise<AuthContext | Response> {
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

function requireAdmin(context: AuthContext): Response | null {
  if (context.user.role !== "admin") {
    return forbidden();
  }
  return null;
}

function isAuthorizedLegacyAdminRequest(request: Request, env: Env): boolean {
  const token = env.ADMIN_API_TOKEN;
  if (!token) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

async function getLoginNotice(env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind("login_notice")
    .first<{ value: string }>();

  if (!row) {
    return json(defaultNotice);
  }

  try {
    return json(JSON.parse(row.value) as Notice);
  } catch {
    return json(defaultNotice);
  }
}

async function getSetting(env: Env, key: string): Promise<string | undefined> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value;
}

async function upsertSetting(env: Env, key: string, value: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(key, value, now)
    .run();
}

async function getPublicSettings(env: Env): Promise<Response> {
  const registrationEnabled = (await getSetting(env, "registration_enabled")) !== "false";
  return json({ registrationEnabled } satisfies PublicSettings);
}

async function updateRegistrationSetting(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ enabled?: unknown }>(request);
  const enabled = Boolean(body.enabled);
  await upsertSetting(env, "registration_enabled", enabled ? "true" : "false");
  return json({ registrationEnabled: enabled } satisfies PublicSettings);
}

async function updateLoginNotice(request: Request, env: Env): Promise<Response> {
  const notice = await readJson<Notice>(request);
  const nextNotice: Notice = {
    enabled: Boolean(notice.enabled),
    title: String(notice.title || "系统提示").slice(0, 80),
    content: String(notice.content || "").slice(0, 2000),
    updatedAt: new Date().toISOString()
  };

  await upsertSetting(env, "login_notice", JSON.stringify(nextNotice));
  return json(nextNotice);
}

async function adminSummary(env: Env): Promise<Response> {
  const users = await env.DB.prepare(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status IN ('delete_requested', 'delete_scheduled') THEN 1 ELSE 0 END) AS pendingDeletion,
      SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled
     FROM users
     WHERE status != 'deleted'`
  ).first<{ total: number; active: number | null; pendingDeletion: number | null; disabled: number | null }>();

  const docs = await env.DB.prepare("SELECT COUNT(*) AS total FROM encrypted_documents").first<{
    total: number;
  }>();

  const registrationEnabled = (await getSetting(env, "registration_enabled")) !== "false";

  return json({
    users: {
      total: users?.total ?? 0,
      active: users?.active ?? 0,
      pendingDeletion: users?.pendingDeletion ?? 0,
      disabled: users?.disabled ?? 0
    },
    encryptedDocuments: docs?.total ?? 0,
    registrationEnabled
  } satisfies AdminSummary);
}

async function listUsers(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
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
     WHERE status != 'deleted'
     ORDER BY created_at DESC`
  ).all<UserRow>();

  return json((result.results ?? []).map(adminUser));
}

async function authLookup(request: Request, env: Env): Promise<Response> {
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

async function registerUser(request: Request, env: Env): Promise<Response> {
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

async function loginUser(request: Request, env: Env): Promise<Response> {
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

async function logout(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }
  await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(context.tokenHash).run();
  return json({ ok: true });
}

async function me(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }
  return json({ user: sessionUser(context.user) });
}

async function getMyVault(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }

  const row = await env.DB.prepare(
    `SELECT id, user_id, doc_type, doc_key, encrypted_payload, created_at, updated_at
     FROM encrypted_documents
     WHERE user_id = ? AND doc_type = ? AND doc_key = ?`
  )
    .bind(context.user.id, vaultDocType, vaultDocKey)
    .first();

  return row ? json(row) : notFound();
}

async function putMyVault(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }

  const body = await readJson<EncryptedDocumentRequest>(request);
  if (!body.encryptedPayload) {
    return json({ error: "Missing encrypted payload" }, 400);
  }

  const updatedAt = await upsertEncryptedPayload(env, context.user.id, vaultDocType, vaultDocKey, body.encryptedPayload);
  return json({ ok: true, updatedAt });
}

async function getEncryptedDocument(pathname: string, request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }

  const [, , , docType, docKey] = pathname.split("/");
  if (!docType || !docKey) {
    return json({ error: "Missing document key" }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT id, user_id, doc_type, doc_key, encrypted_payload, created_at, updated_at
     FROM encrypted_documents
     WHERE user_id = ? AND doc_type = ? AND doc_key = ?`
  )
    .bind(context.user.id, docType, docKey)
    .first();

  return row ? json(row) : notFound();
}

async function putEncryptedDocument(pathname: string, request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }

  const [, , , docType, docKey] = pathname.split("/");
  const body = await readJson<EncryptedDocumentRequest>(request);

  if (!docType || !docKey || !body.encryptedPayload) {
    return json({ error: "Missing encrypted document fields" }, 400);
  }

  const updatedAt = await upsertEncryptedPayload(env, context.user.id, docType, docKey, body.encryptedPayload);
  return json({ ok: true, updatedAt });
}

async function upsertEncryptedPayload(
  env: Env,
  userId: string,
  docType: string,
  docKey: string,
  encryptedPayload: string
): Promise<string> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO encrypted_documents (
      id,
      user_id,
      doc_type,
      doc_key,
      encrypted_payload,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, doc_type, doc_key) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      updated_at = excluded.updated_at`
  )
    .bind(id, userId, docType, docKey, encryptedPayload, now, now)
    .run();

  return now;
}

async function requestDeleteUser(request: Request, env: Env, actor: AuthContext, targetUserId: string): Promise<Response> {
  const body = await readJson<{ reason?: unknown }>(request).catch(() => ({ reason: "" }));
  const target = await getUserById(env, targetUserId);
  if (!target || target.status === "deleted") {
    return notFound();
  }
  if (target.role === "admin" && target.id === actor.user.id) {
    return json({ error: "Admin cannot request deletion for the current admin session" }, 400);
  }

  const now = new Date().toISOString();
  const scheduledAt = daysFrom(now, deletionGraceDays);
  const reason = String(body.reason ?? "").slice(0, 500);

  await env.DB.prepare(
    `UPDATE users SET
      status = 'delete_requested',
      delete_requested_at = ?,
      delete_requested_by = ?,
      delete_notice_count = 0,
      delete_second_confirmed_at = NULL,
      delete_scheduled_at = ?,
      delete_cancelled_at = NULL,
      delete_reason = ?,
      updated_at = ?
     WHERE id = ?`
  )
    .bind(now, actor.user.id, scheduledAt, reason, now, targetUserId)
    .run();

  await addDeletionEvent(env, targetUserId, actor.user.id, "request", reason);
  const updated = await getUserById(env, targetUserId);
  return json(adminUser(updated!));
}

async function confirmDeleteUser(request: Request, env: Env, actor: AuthContext, targetUserId: string): Promise<Response> {
  const body = await readJson<{ passwordVerifier?: unknown }>(request).catch((): { passwordVerifier?: unknown } => ({}));
  const passwordVerifier = typeof body.passwordVerifier === "string" ? body.passwordVerifier : "";
  if (!passwordVerifier) {
    return json({ error: "Password confirmation required" }, 400);
  }
  if (passwordVerifier !== actor.user.password_verifier) {
    return json({ error: "Password confirmation failed" }, 401);
  }

  const target = await getUserById(env, targetUserId);
  if (!target || target.status === "deleted") {
    return notFound();
  }
  if (target.status !== "delete_requested" && target.status !== "delete_scheduled") {
    return json({ error: "Deletion has not been requested" }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users SET
      status = 'delete_scheduled',
      delete_second_confirmed_at = ?,
      delete_scheduled_at = COALESCE(delete_scheduled_at, ?),
      updated_at = ?
     WHERE id = ?`
  )
    .bind(now, daysFrom(now, deletionGraceDays), now, targetUserId)
    .run();

  await addDeletionEvent(env, targetUserId, actor.user.id, "confirm", null);
  const updated = await getUserById(env, targetUserId);
  return json(adminUser(updated!));
}

async function cancelDeleteUser(env: Env, actor: AuthContext, targetUserId: string): Promise<Response> {
  const target = await getUserById(env, targetUserId);
  if (!target || target.status === "deleted") {
    return notFound();
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users SET
      status = 'active',
      delete_cancelled_at = ?,
      updated_at = ?
     WHERE id = ?`
  )
    .bind(now, now, targetUserId)
    .run();

  await addDeletionEvent(env, targetUserId, actor.user.id, "cancel", null);
  const updated = await getUserById(env, targetUserId);
  return json(adminUser(updated!));
}

async function selfCancelDeletion(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }
  return cancelDeleteUser(env, context, context.user.id);
}

async function runDueDeletions(env: Env): Promise<Response> {
  const now = new Date().toISOString();
  const due = await env.DB.prepare(
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
     WHERE status IN ('delete_requested', 'delete_scheduled')
       AND delete_scheduled_at IS NOT NULL
       AND delete_scheduled_at <= ?`
  )
    .bind(now)
    .all<UserRow>();

  const users = due.results ?? [];
  for (const user of users) {
    await deleteUserData(env, user.id, "auto_delete");
  }

  return json({ deleted: users.length });
}

async function deleteUserData(env: Env, userId: string, action: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare("DELETE FROM encrypted_documents WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare(
    `UPDATE users SET
      username = ?,
      password_verifier = '',
      password_salt = '',
      encrypted_data_key_by_password = '',
      encrypted_data_key_by_recovery = '',
      status = 'deleted',
      deleted_at = ?,
      updated_at = ?
     WHERE id = ?`
  )
    .bind(`deleted:${userId}`, now, now, userId)
    .run();
  await addDeletionEvent(env, userId, null, action, null);
}

async function addDeletionEvent(
  env: Env,
  userId: string,
  actorUserId: string | null,
  action: string,
  reason: string | null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_deletion_events (id, user_id, actor_user_id, action, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), userId, actorUserId, action, reason, new Date().toISOString())
    .run();
}

async function handleAdminRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (isAuthorizedLegacyAdminRequest(request, env)) {
    if (request.method === "PUT" && pathname === "/api/admin/login-notice") {
      return updateLoginNotice(request, env);
    }
    if (request.method === "PUT" && pathname === "/api/admin/registration") {
      return updateRegistrationSetting(request, env);
    }
    if (request.method === "POST" && pathname === "/api/admin/deletions/run-due") {
      return runDueDeletions(env);
    }
  }

  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }
  const adminError = requireAdmin(context);
  if (adminError) {
    return adminError;
  }

  if (request.method === "GET" && pathname === "/api/admin/summary") {
    return adminSummary(env);
  }

  if (request.method === "GET" && pathname === "/api/admin/users") {
    return listUsers(env);
  }

  if (request.method === "PUT" && pathname === "/api/admin/login-notice") {
    return updateLoginNotice(request, env);
  }

  if (request.method === "PUT" && pathname === "/api/admin/registration") {
    return updateRegistrationSetting(request, env);
  }

  if (request.method === "POST" && pathname === "/api/admin/deletions/run-due") {
    return runDueDeletions(env);
  }

  const deleteMatch = /^\/api\/admin\/users\/([^/]+)\/delete-(request|confirm|cancel)$/.exec(pathname);
  if (deleteMatch) {
    const [, userId, action] = deleteMatch;
    if (request.method !== "POST") {
      return notFound();
    }
    if (action === "request") {
      return requestDeleteUser(request, env, context, userId);
    }
    if (action === "confirm") {
      return confirmDeleteUser(request, env, context, userId);
    }
    if (action === "cancel") {
      return cancelDeleteUser(env, context, userId);
    }
  }

  return null;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/api/health") {
    return json({ ok: true, service: "teacher-salary-tracker" });
  }

  if (request.method === "GET" && pathname === "/api/public/login-notice") {
    return getLoginNotice(env);
  }

  if (request.method === "GET" && pathname === "/api/public/settings") {
    return getPublicSettings(env);
  }

  if (request.method === "GET" && pathname === "/api/auth/lookup") {
    return authLookup(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/register") {
    return registerUser(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    return loginUser(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    return logout(request, env);
  }

  if (request.method === "GET" && pathname === "/api/auth/me") {
    return me(request, env);
  }

  if (request.method === "POST" && pathname === "/api/me/delete-cancel") {
    return selfCancelDeletion(request, env);
  }

  if (request.method === "GET" && pathname === "/api/me/vault") {
    return getMyVault(request, env);
  }

  if (request.method === "PUT" && pathname === "/api/me/vault") {
    return putMyVault(request, env);
  }

  if (pathname.startsWith("/api/admin/")) {
    const adminResponse = await handleAdminRequest(request, env);
    return adminResponse ?? notFound();
  }

  if (pathname.startsWith("/api/encrypted-documents/")) {
    if (request.method === "GET") {
      return getEncryptedDocument(pathname, request, env);
    }
    if (request.method === "PUT") {
      return putEncryptedDocument(pathname, request, env);
    }
  }

  return notFound();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        await cleanupExpiredSessions(env);
        if (request.method !== "GET" && url.pathname !== "/api/admin/deletions/run-due") {
          await runDueDeletions(env).catch(() => undefined);
        }
        return await handleApi(request, env);
      } catch (error) {
        if (isMigrationError(error)) {
          return json(
            {
              error: "Database migration required",
              detail: "请先对 D1 执行 migrations/0002_cloud_multi_user.sql，然后再注册或登录。"
            },
            503
          );
        }
        return json(
          {
            error: "Internal server error",
            detail: error instanceof Error ? error.message : "Unknown error"
          },
          500
        );
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await cleanupExpiredSessions(env);
    await runDueDeletions(env);
  }
};
