import type { Notice } from "../shared/types";

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
};

type EncryptedDocumentRequest = {
  userId: string;
  encryptedPayload: string;
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function isAuthorizedAdminRequest(request: Request, env: Env): boolean {
  const token = env.ADMIN_API_TOKEN;
  if (!token) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
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

async function updateLoginNotice(request: Request, env: Env): Promise<Response> {
  const notice = await readJson<Notice>(request);
  const nextNotice: Notice = {
    enabled: Boolean(notice.enabled),
    title: String(notice.title || "系统提示").slice(0, 80),
    content: String(notice.content || "").slice(0, 2000),
    updatedAt: new Date().toISOString()
  };

  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind("login_notice", JSON.stringify(nextNotice), nextNotice.updatedAt)
    .run();

  return json(nextNotice);
}

async function adminSummary(env: Env): Promise<Response> {
  const users = await env.DB.prepare(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) AS disabled
     FROM users`
  ).first<{ total: number; active: number; disabled: number }>();

  const docs = await env.DB.prepare("SELECT COUNT(*) AS total FROM encrypted_documents").first<{
    total: number;
  }>();

  return json({
    users: users ?? { total: 0, active: 0, disabled: 0 },
    encryptedDocuments: docs?.total ?? 0
  });
}

async function listUsers(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, username, role, status, created_at, updated_at, last_login_at
     FROM users
     ORDER BY created_at DESC`
  ).all();

  return json(result.results);
}

async function registerUser(request: Request, env: Env): Promise<Response> {
  const body = await readJson<RegisterRequest>(request);
  const now = new Date().toISOString();

  if (!body.username || !body.passwordVerifier || !body.passwordSalt) {
    return json({ error: "Missing required registration fields" }, 400);
  }

  const id = crypto.randomUUID();
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
    ) VALUES (?, ?, ?, ?, ?, ?, 'teacher', 'active', ?, ?)`
  )
    .bind(
      id,
      body.username,
      body.passwordVerifier,
      body.passwordSalt,
      body.encryptedDataKeyByPassword,
      body.encryptedDataKeyByRecovery,
      now,
      now
    )
    .run();

  return json({ id, username: body.username, role: "teacher", status: "active" }, 201);
}

async function getEncryptedDocument(pathname: string, request: Request, env: Env): Promise<Response> {
  const [, , , docType, docKey] = pathname.split("/");
  const userId = new URL(request.url).searchParams.get("userId");

  if (!docType || !docKey || !userId) {
    return json({ error: "Missing document key or userId" }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT id, user_id, doc_type, doc_key, encrypted_payload, created_at, updated_at
     FROM encrypted_documents
     WHERE user_id = ? AND doc_type = ? AND doc_key = ?`
  )
    .bind(userId, docType, docKey)
    .first();

  return row ? json(row) : notFound();
}

async function putEncryptedDocument(pathname: string, request: Request, env: Env): Promise<Response> {
  const [, , , docType, docKey] = pathname.split("/");
  const body = await readJson<EncryptedDocumentRequest>(request);

  if (!docType || !docKey || !body.userId || !body.encryptedPayload) {
    return json({ error: "Missing encrypted document fields" }, 400);
  }

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
    .bind(id, body.userId, docType, docKey, body.encryptedPayload, now, now)
    .run();

  return json({ ok: true, updatedAt: now });
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname.startsWith("/api/admin/") && !isAuthorizedAdminRequest(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (request.method === "GET" && pathname === "/api/health") {
    return json({ ok: true, service: "teacher-salary-tracker" });
  }

  if (request.method === "GET" && pathname === "/api/public/login-notice") {
    return getLoginNotice(env);
  }

  if (request.method === "POST" && pathname === "/api/auth/register") {
    return registerUser(request, env);
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
        return await handleApi(request, env);
      } catch (error) {
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
  }
};
