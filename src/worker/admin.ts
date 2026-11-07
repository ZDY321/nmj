import type {
  AdminSummary,
  AdminUserNote,
  Notice,
  NoticeRecord,
  SchoolPalExportScript
} from "../shared/types";
import { getUserById, requireAuth } from "./auth";
import { adminUser, adminUserNote, defaultNoticeRecord, feedbackFromRow, isFeedbackStatus, json, notFound, readJson, schoolPalExportScriptMaxLength, schoolPalExportScriptSettingKey } from "./runtime";
import { getSetting, upsertSetting } from "./settings";
import { AdminUserNoteRequest, AdminUserNoteRow, AuthContext, Env, FeedbackRequest, FeedbackRow, FeedbackUpdateRequest, PublicSettings, UserRow } from "./types";

export async function getLoginNotice(env: Env): Promise<Response> {
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

export async function getPublicSettings(env: Env): Promise<Response> {
  const registrationEnabled = (await getSetting(env, "registration_enabled")) !== "false";
  return json({ registrationEnabled } satisfies PublicSettings);
}

export async function getSchoolPalExportScript(env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT value, updated_at FROM app_settings WHERE key = ?")
    .bind(schoolPalExportScriptSettingKey)
    .first<{ value: string; updated_at: string }>();
  return json({
    content: row?.value ?? "",
    updatedAt: row?.updated_at ?? null
  } satisfies SchoolPalExportScript);
}

export async function updateSchoolPalExportScript(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ content?: unknown }>(request);
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return json({ error: "SchoolPal export script required" }, 400);
  }
  if (content.length > schoolPalExportScriptMaxLength) {
    return json({ error: "SchoolPal export script too large" }, 400);
  }
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(schoolPalExportScriptSettingKey, content, updatedAt)
    .run();
  return json({ content, updatedAt } satisfies SchoolPalExportScript);
}

export async function updateRegistrationSetting(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ enabled?: unknown }>(request);
  const enabled = Boolean(body.enabled);
  await upsertSetting(env, "registration_enabled", enabled ? "true" : "false");
  return json({ registrationEnabled: enabled } satisfies PublicSettings);
}

export async function updateLoginNotice(request: Request, env: Env): Promise<Response> {
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

export async function listLoginNotices(env: Env): Promise<Response> {
  return json(await readNoticeList(env));
}

export async function createLoginNotice(request: Request, env: Env): Promise<Response> {
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

export async function updateLoginNoticeRecord(request: Request, env: Env, noticeId: string): Promise<Response> {
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

export async function adminSummary(env: Env): Promise<Response> {
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

export async function listUsers(env: Env): Promise<Response> {
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

  const notesResult = await env.DB.prepare(
    `SELECT id, user_id, name, content, created_at, updated_at, created_by, updated_by
     FROM admin_user_notes
     ORDER BY updated_at DESC`
  ).all<AdminUserNoteRow>();
  const notesByUser = new Map<string, AdminUserNote[]>();
  for (const row of notesResult.results ?? []) {
    const notes = notesByUser.get(row.user_id) ?? [];
    notes.push(adminUserNote(row));
    notesByUser.set(row.user_id, notes);
  }

  return json((result.results ?? []).map((row) => adminUser(row, notesByUser.get(row.id) ?? [])));
}

export async function listUserNotes(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, user_id, name, content, created_at, updated_at, created_by, updated_by
     FROM admin_user_notes
     ORDER BY updated_at DESC`
  ).all<AdminUserNoteRow>();
  return json((result.results ?? []).map(adminUserNote));
}

function readAdminUserNote(body: AdminUserNoteRequest): { name: string; content: string } {
  return {
    name: String(body.name ?? "").trim().slice(0, 120),
    content: String(body.content ?? "").trim().slice(0, 4000)
  };
}

export async function createUserNote(request: Request, env: Env, actor: AuthContext, userId: string): Promise<Response> {
  const target = await getUserById(env, userId);
  if (!target || target.status === "deleted") return notFound();
  const body = await readJson<AdminUserNoteRequest>(request).catch((): AdminUserNoteRequest => ({}));
  const { name, content } = readAdminUserNote(body);
  if (!name || !content) return json({ error: "User note fields required" }, 400);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO admin_user_notes (id, user_id, name, content, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, name, content, now, now, actor.user.id, actor.user.id).run();
  const created = await env.DB.prepare(
    `SELECT id, user_id, name, content, created_at, updated_at, created_by, updated_by
     FROM admin_user_notes WHERE id = ?`
  ).bind(id).first<AdminUserNoteRow>();
  return created ? json(adminUserNote(created), 201) : notFound();
}

export async function updateUserNote(request: Request, env: Env, actor: AuthContext, noteId: string): Promise<Response> {
  const body = await readJson<AdminUserNoteRequest>(request).catch((): AdminUserNoteRequest => ({}));
  const { name, content } = readAdminUserNote(body);
  if (!name || !content) return json({ error: "User note fields required" }, 400);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE admin_user_notes SET name = ?, content = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).bind(name, content, now, actor.user.id, noteId).run();
  if (!result.meta.changes) return notFound();
  const updated = await env.DB.prepare(
    `SELECT id, user_id, name, content, created_at, updated_at, created_by, updated_by
     FROM admin_user_notes WHERE id = ?`
  ).bind(noteId).first<AdminUserNoteRow>();
  return updated ? json(adminUserNote(updated)) : notFound();
}

export async function deleteUserNote(env: Env, _actor: AuthContext, noteId: string): Promise<Response> {
  const result = await env.DB.prepare("DELETE FROM admin_user_notes WHERE id = ?").bind(noteId).run();
  return result.meta.changes ? json({ ok: true }) : notFound();
}

export async function submitFeedback(request: Request, env: Env): Promise<Response> {
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

export async function listFeedback(env: Env): Promise<Response> {
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

export async function updateFeedback(request: Request, env: Env, actor: AuthContext, feedbackId: string): Promise<Response> {
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
