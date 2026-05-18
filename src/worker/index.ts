import type {
  AiProviderConfig,
  AiProviderInput,
  AiProviderKind,
  AiProviderUsage,
  AiScheduleDraftRequest,
  AiScheduleDraftResponse,
  AdminSummary,
  AdminUser,
  FeedbackStatus,
  Notice,
  NoticeRecord,
  SessionUser,
  UserFeedback,
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
  expectedUpdatedAt?: string | null;
  force?: boolean;
};

type PublicSettings = {
  registrationEnabled: boolean;
};

type FeedbackRequest = {
  title?: unknown;
  content?: unknown;
};

type FeedbackUpdateRequest = {
  status?: unknown;
  adminNote?: unknown;
};

type AiProviderRow = {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  enabled: number;
  is_default: number;
  daily_limit: number;
  max_output_tokens: number;
  temperature: number;
  created_at: string;
  updated_at: string;
  last_tested_at: string | null;
  last_error: string | null;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    text?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: {
    message?: string;
  };
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

type FeedbackRow = {
  id: string;
  user_id: string | null;
  username: string;
  title: string;
  content: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  handled_at: string | null;
  handled_by: string | null;
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

const defaultNoticeRecord: NoticeRecord = {
  ...defaultNotice,
  id: "default_notice",
  createdAt: defaultNotice.updatedAt
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

function isFeedbackStatus(value: string): value is FeedbackStatus {
  return value === "unread" || value === "read" || value === "in_progress" || value === "completed";
}

function isAiProviderKind(value: string): value is AiProviderKind {
  return value === "newapi" || value === "openai_compatible" || value === "deepseek" || value === "openai" || value === "gemini";
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

function feedbackFromRow(row: FeedbackRow): UserFeedback {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    title: row.title,
    content: row.content,
    status: isFeedbackStatus(row.status) ? row.status : "unread",
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    handledAt: row.handled_at,
    handledBy: row.handled_by
  };
}

function maskApiKey(apiKey: string): string {
  const value = apiKey.trim();
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}****${value.slice(-2)}`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function aiProviderFromRow(row: AiProviderRow): AiProviderConfig {
  return {
    id: row.id,
    name: row.name,
    provider: isAiProviderKind(row.provider) ? row.provider : "openai_compatible",
    baseUrl: row.base_url,
    model: row.model,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    dailyLimit: row.daily_limit,
    maxOutputTokens: row.max_output_tokens,
    temperature: row.temperature,
    maskedApiKey: maskApiKey(row.api_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTestedAt: row.last_tested_at,
    lastError: row.last_error
  };
}

async function aiProviderConfigWithUsage(env: Env, row: AiProviderRow, includeSensitive: boolean, actorUserId: string): Promise<AiProviderConfig> {
  const usedToday = await providerDailyUsage(env, row.id, actorUserId);
  const dailyLimit = Math.max(row.daily_limit, 0);
  return {
    ...aiProviderFromRow(row),
    baseUrl: includeSensitive ? row.base_url : "",
    maskedApiKey: includeSensitive ? maskApiKey(row.api_key) : "",
    usedToday,
    remainingToday: Math.max(dailyLimit - usedToday, 0)
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
  return /no such table: user_sessions|no such table: user_deletion_events|no such table: user_feedback|no such table: ai_provider_configs|no such table: ai_usage_logs|no such column: .*delete_|no such column: deleted_at/i.test(
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
  const notices = await readNoticeList(env);
  return json(activeNoticeFromList(notices));
}

function normalizeNoticeRecord(value: unknown, fallbackId: string): NoticeRecord | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<NoticeRecord>;
  const title = String(item.title ?? "").trim().slice(0, 80);
  const content = String(item.content ?? "").trim().slice(0, 2000);
  const updatedAt = String(item.updatedAt ?? item.createdAt ?? new Date().toISOString());
  if (!title || !content) return null;
  return {
    id: String(item.id ?? fallbackId),
    enabled: Boolean(item.enabled),
    title,
    content,
    updatedAt,
    createdAt: String(item.createdAt ?? updatedAt)
  };
}

async function readNoticeList(env: Env): Promise<NoticeRecord[]> {
  const listRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind("login_notices")
    .first<{ value: string }>();

  if (listRow) {
    try {
      const parsed = JSON.parse(listRow.value) as unknown;
      if (Array.isArray(parsed)) {
        const notices = parsed
          .map((item, index) => normalizeNoticeRecord(item, `notice_${index}`))
          .filter((item): item is NoticeRecord => Boolean(item))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (notices.length > 0) return notices;
      }
    } catch {
      // Fall back to the legacy single-notice setting.
    }
  }

  const legacyRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind("login_notice")
    .first<{ value: string }>();
  if (!legacyRow) return [defaultNoticeRecord];

  try {
    const legacy = normalizeNoticeRecord(JSON.parse(legacyRow.value) as Notice, "legacy_notice");
    return legacy ? [legacy] : [defaultNoticeRecord];
  } catch {
    return [defaultNoticeRecord];
  }
}

function activeNoticeFromList(notices: NoticeRecord[]): Notice {
  const active = notices.find((notice) => notice.enabled) ?? notices[0] ?? defaultNoticeRecord;
  return {
    enabled: active.enabled,
    title: active.title,
    content: active.content,
    updatedAt: active.updatedAt
  };
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

async function listLoginNotices(env: Env): Promise<Response> {
  return json(await readNoticeList(env));
}

async function createLoginNotice(request: Request, env: Env): Promise<Response> {
  const body = await readJson<Partial<Notice>>(request).catch((): Partial<Notice> => ({}));
  const now = new Date().toISOString();
  const nextNotice: NoticeRecord = {
    id: crypto.randomUUID(),
    enabled: Boolean(body.enabled ?? true),
    title: String(body.title || "系统公告").trim().slice(0, 80),
    content: String(body.content || "").trim().slice(0, 2000),
    createdAt: now,
    updatedAt: now
  };

  if (!nextNotice.content) {
    return json({ error: "Notice content required" }, 400);
  }

  const notices = await readNoticeList(env);
  const nextNotices = [nextNotice, ...notices];
  await upsertSetting(env, "login_notices", JSON.stringify(nextNotices));
  await upsertSetting(env, "login_notice", JSON.stringify(activeNoticeFromList(nextNotices)));
  return json(nextNotice, 201);
}

async function updateLoginNoticeRecord(request: Request, env: Env, noticeId: string): Promise<Response> {
  const body = await readJson<Partial<Notice>>(request).catch((): Partial<Notice> => ({}));
  const notices = await readNoticeList(env);
  const existing = notices.find((notice) => notice.id === noticeId);
  if (!existing) return notFound();

  const updated: NoticeRecord = {
    ...existing,
    enabled: Boolean(body.enabled ?? existing.enabled),
    title: String(body.title ?? existing.title).trim().slice(0, 80) || existing.title,
    content: String(body.content ?? existing.content).trim().slice(0, 2000) || existing.content,
    updatedAt: new Date().toISOString()
  };
  const nextNotices = notices.map((notice) => (notice.id === noticeId ? updated : notice));
  await upsertSetting(env, "login_notices", JSON.stringify(nextNotices));
  await upsertSetting(env, "login_notice", JSON.stringify(activeNoticeFromList(nextNotices)));
  return json(updated);
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

async function getMyVaultMeta(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }

  const row = await env.DB.prepare(
    `SELECT updated_at
     FROM encrypted_documents
     WHERE user_id = ? AND doc_type = ? AND doc_key = ?`
  )
    .bind(context.user.id, vaultDocType, vaultDocKey)
    .first<{ updated_at: string }>();

  return row ? json({ updatedAt: row.updated_at }) : notFound();
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

  if (!body.force && body.expectedUpdatedAt) {
    const current = await env.DB.prepare(
      `SELECT updated_at
       FROM encrypted_documents
       WHERE user_id = ? AND doc_type = ? AND doc_key = ?`
    )
      .bind(context.user.id, vaultDocType, vaultDocKey)
      .first<{ updated_at: string }>();
    if (current && current.updated_at !== body.expectedUpdatedAt) {
      return json({ error: "Vault version conflict", currentUpdatedAt: current.updated_at }, 409);
    }
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

async function submitFeedback(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }

  const body = await readJson<FeedbackRequest>(request).catch((): FeedbackRequest => ({}));
  const content = String(body.content ?? "").trim().slice(0, 4000);
  const title = String(body.title ?? "").trim().slice(0, 120) || "用户反馈";

  if (!content) {
    return json({ error: "Feedback content required" }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO user_feedback (
      id,
      user_id,
      username,
      title,
      content,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, 'unread', ?, ?)`
  )
    .bind(id, context.user.id, context.user.username, title, content, now, now)
    .run();

  return json({ ok: true, id, createdAt: now }, 201);
}

async function listFeedback(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT
      id,
      user_id,
      username,
      title,
      content,
      status,
      admin_note,
      created_at,
      updated_at,
      handled_at,
      handled_by
     FROM user_feedback
     ORDER BY created_at DESC
     LIMIT 200`
  ).all<FeedbackRow>();

  return json((result.results ?? []).map(feedbackFromRow));
}

async function updateFeedback(request: Request, env: Env, actor: AuthContext, feedbackId: string): Promise<Response> {
  const body = await readJson<FeedbackUpdateRequest>(request).catch((): FeedbackUpdateRequest => ({}));
  const status = typeof body.status === "string" && isFeedbackStatus(body.status) ? body.status : null;
  if (!status) {
    return json({ error: "Invalid feedback status" }, 400);
  }

  const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 1000) : null;
  const now = new Date().toISOString();
  const handledAt = status === "completed" ? now : null;

  await env.DB.prepare(
    `UPDATE user_feedback SET
      status = ?,
      admin_note = ?,
      updated_at = ?,
      handled_at = ?,
      handled_by = ?
     WHERE id = ?`
  )
    .bind(status, adminNote || null, now, handledAt, actor.user.id, feedbackId)
    .run();

  const updated = await env.DB.prepare(
    `SELECT
      id,
      user_id,
      username,
      title,
      content,
      status,
      admin_note,
      created_at,
      updated_at,
      handled_at,
      handled_by
     FROM user_feedback
     WHERE id = ?`
  )
    .bind(feedbackId)
    .first<FeedbackRow>();

  return updated ? json(feedbackFromRow(updated)) : notFound();
}

function normalizeAiBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/v1\/chat\/completions$/i, "").replace(/\/chat\/completions$/i, "");
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeAiBaseUrl(baseUrl);
  return /\/v1$/i.test(normalized) ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function sanitizeAiProviderInput(body: Partial<AiProviderInput>, existing?: AiProviderRow): AiProviderInput {
  const provider = typeof body.provider === "string" && isAiProviderKind(body.provider)
    ? body.provider
    : existing && isAiProviderKind(existing.provider)
      ? existing.provider
      : "newapi";
  const name = String(body.name ?? existing?.name ?? "").trim().slice(0, 80);
  const baseUrl = normalizeAiBaseUrl(String(body.baseUrl ?? existing?.base_url ?? "").trim()).slice(0, 300);
  const model = String(body.model ?? existing?.model ?? "").trim().slice(0, 120);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  return {
    name,
    provider,
    baseUrl,
    model,
    apiKey,
    enabled: Boolean(body.enabled ?? existing?.enabled ?? true),
    isDefault: Boolean(body.isDefault ?? existing?.is_default ?? false),
    dailyLimit: Math.round(numberInRange(body.dailyLimit, existing?.daily_limit ?? 50, 1, 2000)),
    maxOutputTokens: Math.round(numberInRange(body.maxOutputTokens, existing?.max_output_tokens ?? 1200, 256, 8000)),
    temperature: Number(numberInRange(body.temperature, existing?.temperature ?? 0.2, 0, 2).toFixed(2))
  };
}

async function getAiProviderRow(env: Env, providerId: string): Promise<AiProviderRow | null> {
  return env.DB.prepare(
    `SELECT
      id,
      name,
      provider,
      base_url,
      model,
      api_key,
      enabled,
      is_default,
      daily_limit,
      max_output_tokens,
      temperature,
      created_at,
      updated_at,
      last_tested_at,
      last_error
     FROM ai_provider_configs
     WHERE id = ?`
  )
    .bind(providerId)
    .first<AiProviderRow>();
}

async function listAiProviders(env: Env, actorUserId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT
      id,
      name,
      provider,
      base_url,
      model,
      api_key,
      enabled,
      is_default,
      daily_limit,
      max_output_tokens,
      temperature,
      created_at,
      updated_at,
      last_tested_at,
      last_error
     FROM ai_provider_configs
     ORDER BY is_default DESC, updated_at DESC`
  ).all<AiProviderRow>();

  const providers = await Promise.all((result.results ?? []).map((row) => aiProviderConfigWithUsage(env, row, true, actorUserId)));
  return json(providers);
}

async function listUsableAiProviders(env: Env, includeSensitive: boolean, actorUserId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT
      id,
      name,
      provider,
      base_url,
      model,
      api_key,
      enabled,
      is_default,
      daily_limit,
      max_output_tokens,
      temperature,
      created_at,
      updated_at,
      last_tested_at,
      last_error
     FROM ai_provider_configs
     WHERE enabled = 1
     ORDER BY is_default DESC, updated_at DESC`
  ).all<AiProviderRow>();

  const providers = await Promise.all((result.results ?? []).map((row) => aiProviderConfigWithUsage(env, row, includeSensitive, actorUserId)));
  return json(providers);
}

async function saveAiProvider(request: Request, env: Env, providerId?: string): Promise<Response> {
  const body = await readJson<Partial<AiProviderInput>>(request).catch((): Partial<AiProviderInput> => ({}));
  const existing = providerId ? await getAiProviderRow(env, providerId) : null;
  if (providerId && !existing) {
    return notFound();
  }

  const input = sanitizeAiProviderInput(body, existing ?? undefined);
  if (!input.name || !input.baseUrl || !input.model) {
    return json({ error: "Missing AI provider fields" }, 400);
  }

  const apiKey = input.apiKey || existing?.api_key || "";
  if (!apiKey) {
    return json({ error: "Missing AI API key" }, 400);
  }

  const now = new Date().toISOString();
  const id = providerId ?? crypto.randomUUID();
  if (input.isDefault) {
    await env.DB.prepare("UPDATE ai_provider_configs SET is_default = 0").run();
  }

  await env.DB.prepare(
    `INSERT INTO ai_provider_configs (
      id,
      name,
      provider,
      base_url,
      model,
      api_key,
      enabled,
      is_default,
      daily_limit,
      max_output_tokens,
      temperature,
      created_at,
      updated_at,
      last_tested_at,
      last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      provider = excluded.provider,
      base_url = excluded.base_url,
      model = excluded.model,
      api_key = excluded.api_key,
      enabled = excluded.enabled,
      is_default = excluded.is_default,
      daily_limit = excluded.daily_limit,
      max_output_tokens = excluded.max_output_tokens,
      temperature = excluded.temperature,
      updated_at = excluded.updated_at`
  )
    .bind(
      id,
      input.name,
      input.provider,
      input.baseUrl,
      input.model,
      apiKey,
      input.enabled ? 1 : 0,
      input.isDefault ? 1 : 0,
      input.dailyLimit,
      input.maxOutputTokens,
      input.temperature,
      existing?.created_at ?? now,
      now,
      existing?.last_tested_at ?? null,
      existing?.last_error ?? null
    )
    .run();

  const saved = await getAiProviderRow(env, id);
  return saved ? json(aiProviderFromRow(saved), providerId ? 200 : 201) : notFound();
}

async function deleteAiProvider(env: Env, providerId: string): Promise<Response> {
  await env.DB.prepare("DELETE FROM ai_provider_configs WHERE id = ?").bind(providerId).run();
  return json({ ok: true });
}

async function providerDailyUsage(env: Env, providerId: string, actorUserId: string): Promise<number> {
  const now = new Date();
  const todayBeijingMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0);
  const since = new Date(now.getTime() < todayBeijingMidnight ? todayBeijingMidnight - 24 * 60 * 60 * 1000 : todayBeijingMidnight);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM ai_usage_logs
     WHERE provider_id = ?
       AND actor_user_id = ?
       AND success = 1
       AND created_at >= ?`
  )
    .bind(providerId, actorUserId, since.toISOString())
    .first<{ total: number }>();
  return row?.total ?? 0;
}

async function addAiUsageLog(
  env: Env,
  providerId: string,
  actorUserId: string,
  action: string,
  success: boolean,
  usage?: AiScheduleDraftResponse["usage"],
  error?: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ai_usage_logs (
      id,
      provider_id,
      actor_user_id,
      action,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      success,
      error,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      providerId,
      actorUserId,
      action,
      usage?.promptTokens ?? null,
      usage?.completionTokens ?? null,
      usage?.totalTokens ?? null,
      success ? 1 : 0,
      error ? error.slice(0, 1000) : null,
      new Date().toISOString()
    )
    .run();
}

function chatContentText(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part.text === "string" ? part.text : "").join("").trim();
  }
  return "";
}

function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // Fall through to object extraction.
      }
    }
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function scheduleAssistantSystemPrompt(): string {
  return [
    "你是一个中文教学排课系统的 AI 助手。",
    "你只能把用户的自然语言整理成结构化 JSON 建议，不能声称已经修改系统数据。",
    "不要输出 Markdown。只输出 JSON。",
    "支持的动作类型：create_student、create_course、update_course、delete_course、migrate_course、delete_lesson、schedule_lessons、sync_lessons、ask_clarification。",
    "create_course、update_course、migrate_course 涉及课程命名时，对用户展示和追问必须使用“课程档案名称”，不要只说“课程名称”或“课程名”；JSON 字段仍使用 courseName/newCourseName/targetCourseName。",
    "update_course 用于修改已有课程档案名称、科目、班型、校区、关联学生或启用/暂停状态；data 里应包含 courseId 或 courseName。",
    "update_course 修改课程班型或计费规则时，默认只影响未来待上课/草稿课节；历史课、已完成课、补课课节默认保留原课型和原费用。若用户明确要求，可用 lessonUpdateScope：future_scheduled、all_unfinished、all、none。",
    "delete_course 用于删除或暂停课程；已有课时引用时除非用户明确 forceDelete，否则系统会暂停课程以保留历史课时。",
    "delete_lesson 用于删除单节课；data 可包含 lessonId、courseId、courseName、subject、date、startTime、endTime。",
    "migrate_course 用于把已有课程迁移到新课程或目标课程；data 可包含 sourceCourseId/sourceCourseName、targetCourseId/targetCourseName、type/targetType、migrateLessons、effectiveFrom、effectiveTo、pauseSource。",
    "必须保留用户没有明确说明的字段为 null 或放入 questions，不要自行编造。",
    "时间使用 24 小时制 HH:mm，日期使用 YYYY-MM-DD。",
    "如果发现信息不足，actions 可以为空，并在 questions 里列出需要确认的问题。",
    "输出结构：{\"summary\":\"...\",\"actions\":[...],\"questions\":[...],\"warnings\":[...]}"
  ].join("\n");
}

async function callOpenAiCompatibleChat(
  provider: AiProviderRow,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<{ text: string; draft: unknown; usage?: AiScheduleDraftResponse["usage"] }> {
  const requestUrl = chatCompletionsUrl(provider.base_url);
  const requestBody = (useJsonMode: boolean) => ({
      model: provider.model,
      messages,
      temperature: provider.temperature,
      max_tokens: provider.max_output_tokens,
      ...(useJsonMode ? { response_format: { type: "json_object" } } : {})
  });
  const send = (useJsonMode: boolean) => fetch(requestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.api_key}`
    },
    body: JSON.stringify(requestBody(useJsonMode))
  });

  let response = await send(true);
  let rawText = await response.text();
  let payload: ChatCompletionResponse | null = null;
  try {
    payload = rawText ? JSON.parse(rawText) as ChatCompletionResponse : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || rawText.slice(0, 500) || `AI request failed (${response.status})`;
    if (/response_format|json_object|unsupported|not support|不支持/i.test(message)) {
      response = await send(false);
      rawText = await response.text();
      try {
        payload = rawText ? JSON.parse(rawText) as ChatCompletionResponse : null;
      } catch {
        payload = null;
      }
      if (response.ok) {
        const firstChoice = payload?.choices?.[0];
        const text = chatContentText(firstChoice?.message?.content) || firstChoice?.text || "";
        if (!text.trim()) {
          throw new Error("AI returned empty content");
        }
        const usage = payload?.usage
          ? {
              promptTokens: payload.usage.prompt_tokens ?? payload.usage.promptTokens,
              completionTokens: payload.usage.completion_tokens ?? payload.usage.completionTokens,
              totalTokens: payload.usage.total_tokens ?? payload.usage.totalTokens
            }
          : undefined;
        return {
          text,
          draft: extractJsonFromText(text),
          usage
        };
      }
      const fallbackMessage = payload?.error?.message || rawText.slice(0, 500) || `AI request failed (${response.status})`;
      throw new Error(fallbackMessage);
    }
    throw new Error(message);
  }

  const firstChoice = payload?.choices?.[0];
  const text = chatContentText(firstChoice?.message?.content) || firstChoice?.text || "";
  if (!text.trim()) {
    throw new Error("AI returned empty content");
  }

  const usage = payload?.usage
    ? {
        promptTokens: payload.usage.prompt_tokens ?? payload.usage.promptTokens,
        completionTokens: payload.usage.completion_tokens ?? payload.usage.completionTokens,
        totalTokens: payload.usage.total_tokens ?? payload.usage.totalTokens
      }
    : undefined;

  return {
    text,
    draft: extractJsonFromText(text),
    usage
  };
}

async function testAiProvider(request: Request, env: Env, actor: AuthContext, providerId: string): Promise<Response> {
  const provider = await getAiProviderRow(env, providerId);
  if (!provider) return notFound();

  try {
    const result = await callOpenAiCompatibleChat(provider, [
      { role: "system", content: "只输出 JSON。" },
      { role: "user", content: "请输出 {\"ok\":true,\"message\":\"connected\"}" }
    ]);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE ai_provider_configs SET last_tested_at = ?, last_error = NULL, updated_at = ? WHERE id = ?")
      .bind(now, now, providerId)
      .run();
    await addAiUsageLog(env, providerId, actor.user.id, "test", true, result.usage);
    return json({ ok: true, provider: aiProviderFromRow({ ...provider, last_tested_at: now, last_error: null }), response: result.draft ?? result.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 测试连接失败。";
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE ai_provider_configs SET last_tested_at = ?, last_error = ?, updated_at = ? WHERE id = ?")
      .bind(now, message.slice(0, 1000), now, providerId)
      .run();
    await addAiUsageLog(env, providerId, actor.user.id, "test", false, undefined, message);
    return json({ error: "AI provider test failed", detail: message }, 502);
  }
}

async function generateAiScheduleDraft(request: Request, env: Env, actor: AuthContext): Promise<Response> {
  const body = await readJson<AiScheduleDraftRequest>(request).catch((): AiScheduleDraftRequest => ({
    providerId: "",
    taskType: "auto",
    instruction: "",
    context: null
  }));
  const instruction = String(body.instruction ?? "").trim().slice(0, 8000);
  if (!instruction) {
    return json({ error: "AI instruction required" }, 400);
  }

  const providerId = String(body.providerId ?? "").trim();
  const provider = providerId
    ? await getAiProviderRow(env, providerId)
    : await env.DB.prepare(
        `SELECT
          id,
          name,
          provider,
          base_url,
          model,
          api_key,
          enabled,
          is_default,
          daily_limit,
          max_output_tokens,
          temperature,
          created_at,
          updated_at,
          last_tested_at,
          last_error
         FROM ai_provider_configs
         WHERE enabled = 1
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`
      ).first<AiProviderRow>();

  if (!provider) {
    return json({ error: "AI provider not configured" }, 400);
  }
  if (!provider.enabled) {
    return json({ error: "AI provider disabled" }, 400);
  }

  const usedToday = await providerDailyUsage(env, provider.id, actor.user.id);
  if (usedToday >= provider.daily_limit) {
    return json({ error: "AI daily limit reached" }, 429);
  }
  const usageBeforeCall: AiProviderUsage = {
    dailyLimit: provider.daily_limit,
    usedToday,
    remainingToday: Math.max(provider.daily_limit - usedToday, 0)
  };

  const userContext = JSON.stringify(body.context ?? null).slice(0, 30000);
  try {
    const result = await callOpenAiCompatibleChat(provider, [
      { role: "system", content: scheduleAssistantSystemPrompt() },
      {
        role: "user",
        content: JSON.stringify({
          taskType: body.taskType || "auto",
          instruction,
          appContext: userContext
        })
      }
    ]);
    const createdAt = new Date().toISOString();
    await addAiUsageLog(env, provider.id, actor.user.id, "schedule_draft", true, result.usage);
    const usageAfterCall: AiProviderUsage = {
      dailyLimit: provider.daily_limit,
      usedToday: usageBeforeCall.usedToday + 1,
      remainingToday: Math.max(provider.daily_limit - usageBeforeCall.usedToday - 1, 0)
    };
    return json({
      providerId: provider.id,
      model: provider.model,
      createdAt,
      text: result.text,
      draft: result.draft,
      providerUsage: usageAfterCall,
      usage: result.usage
    } satisfies AiScheduleDraftResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 生成建议失败。";
    await addAiUsageLog(env, provider.id, actor.user.id, "schedule_draft", false, undefined, message);
    return json({ error: "AI schedule draft failed", detail: message }, 502);
  }
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
  const body = await readJson<{ reason?: unknown; targetPasswordVerifier?: unknown }>(request).catch(
    (): { reason?: unknown; targetPasswordVerifier?: unknown } => ({ reason: "" })
  );
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
  const targetPasswordVerifier = typeof body.targetPasswordVerifier === "string" ? body.targetPasswordVerifier : "";
  const targetPasswordConfirmed = Boolean(targetPasswordVerifier);

  if (targetPasswordConfirmed && targetPasswordVerifier !== target.password_verifier) {
    return json({ error: "Target password confirmation failed" }, 401);
  }

  await env.DB.prepare(
    `UPDATE users SET
      status = ?,
      delete_requested_at = ?,
      delete_requested_by = ?,
      delete_notice_count = 0,
      delete_second_confirmed_at = ?,
      delete_scheduled_at = ?,
      delete_cancelled_at = NULL,
      delete_reason = ?,
      updated_at = ?
     WHERE id = ?`
  )
    .bind(
      targetPasswordConfirmed ? "delete_scheduled" : "delete_requested",
      now,
      actor.user.id,
      targetPasswordConfirmed ? now : null,
      scheduledAt,
      reason,
      now,
      targetUserId
    )
    .run();

  await addDeletionEvent(env, targetUserId, actor.user.id, "request", reason);
  if (targetPasswordConfirmed) {
    await addDeletionEvent(env, targetUserId, actor.user.id, "confirm", null);
  }
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

  if (request.method === "GET" && pathname === "/api/admin/login-notices") {
    return listLoginNotices(env);
  }

  if (request.method === "POST" && pathname === "/api/admin/login-notices") {
    return createLoginNotice(request, env);
  }

  const noticeMatch = /^\/api\/admin\/login-notices\/([^/]+)$/.exec(pathname);
  if (noticeMatch) {
    if (request.method !== "PATCH") return notFound();
    return updateLoginNoticeRecord(request, env, decodeURIComponent(noticeMatch[1]));
  }

  if (request.method === "PUT" && pathname === "/api/admin/registration") {
    return updateRegistrationSetting(request, env);
  }

  if (request.method === "POST" && pathname === "/api/admin/deletions/run-due") {
    return runDueDeletions(env);
  }

  if (request.method === "GET" && pathname === "/api/admin/feedback") {
    return listFeedback(env);
  }

  if (request.method === "GET" && pathname === "/api/admin/ai/providers") {
    return listAiProviders(env, context.user.id);
  }

  if (request.method === "POST" && pathname === "/api/admin/ai/providers") {
    return saveAiProvider(request, env);
  }

  if (request.method === "POST" && pathname === "/api/admin/ai/schedule-draft") {
    return generateAiScheduleDraft(request, env, context);
  }

  const aiProviderMatch = /^\/api\/admin\/ai\/providers\/([^/]+)$/.exec(pathname);
  if (aiProviderMatch) {
    const providerId = decodeURIComponent(aiProviderMatch[1]);
    if (request.method === "PUT") {
      return saveAiProvider(request, env, providerId);
    }
    if (request.method === "DELETE") {
      return deleteAiProvider(env, providerId);
    }
    return notFound();
  }

  const aiProviderTestMatch = /^\/api\/admin\/ai\/providers\/([^/]+)\/test$/.exec(pathname);
  if (aiProviderTestMatch) {
    if (request.method !== "POST") {
      return notFound();
    }
    return testAiProvider(request, env, context, decodeURIComponent(aiProviderTestMatch[1]));
  }

  const feedbackMatch = /^\/api\/admin\/feedback\/([^/]+)$/.exec(pathname);
  if (feedbackMatch) {
    if (request.method !== "PATCH") {
      return notFound();
    }
    return updateFeedback(request, env, context, feedbackMatch[1]);
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

  if (request.method === "POST" && pathname === "/api/feedback") {
    return submitFeedback(request, env);
  }

  if (pathname.startsWith("/api/ai/")) {
    const context = await requireAuth(request, env);
    if (context instanceof Response) {
      return context;
    }
    if (request.method === "GET" && pathname === "/api/ai/providers") {
      return listUsableAiProviders(env, false, context.user.id);
    }
    if (request.method === "POST" && pathname === "/api/ai/schedule-draft") {
      return generateAiScheduleDraft(request, env, context);
    }
    return notFound();
  }

  if (request.method === "GET" && pathname === "/api/me/vault") {
    return getMyVault(request, env);
  }

  if (request.method === "GET" && pathname === "/api/me/vault/meta") {
    return getMyVaultMeta(request, env);
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
              detail: "请先在 Cloudflare D1 按顺序执行 migrations 目录下尚未执行的 SQL，然后刷新页面。"
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
