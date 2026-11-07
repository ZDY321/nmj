import type {
  AdminUser,
  AdminUserNote,
  FeedbackStatus,
  Notice,
  NoticeRecord,
  SessionUser,
  UserDeletionState,
  UserFeedback,
  UserRole,
  UserStatus
} from "../shared/types";
import { AdminUserNoteRow, Env, FeedbackRow, UserRow } from "./types";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

const staticSecurityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'"
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

const defaultNotice: Notice = {
  enabled: true,
  title: "系统提示",
  content: "请及时核对课时、请假、补课和工资明细。敏感数据会加密保存。",
  updatedAt: "2026-05-10T00:00:00.000Z"
};

export const defaultNoticeRecord: NoticeRecord = {
  ...defaultNotice,
  id: "default_notice",
  createdAt: defaultNotice.updatedAt
};

export const vaultDocType = "vault";

export const vaultDocKey = "primary";

export const sessionDays = 30;

export const deletionGraceDays = 10;

export const schoolPalExportScriptSettingKey = "schoolpal_export_script";

export const schoolPalExportScriptMaxLength = 500_000;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders
  });
}

export function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

export async function serveStaticAsset(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(staticSecurityHeaders)) {
    secured.headers.set(name, value);
  }
  return secured;
}

export function normalizeUsername(username: string): string {
  return username.trim();
}

export function isValidUsername(username: string): boolean {
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

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return value === "unread" || value === "read" || value === "in_progress" || value === "completed";
}

export function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function deletionState(row: UserRow): UserDeletionState | null {
  if (
    !row.delete_requested_at ||
    (row.status !== "delete_requested" && row.status !== "delete_scheduled")
  ) {
    return null;
  }

  return {
    requestedAt: row.delete_requested_at,
    requestedBy: row.delete_requested_by,
    noticeCount: row.delete_notice_count ?? 0,
    secondConfirmedAt: row.delete_second_confirmed_at,
    scheduledAt: row.status === "delete_scheduled" ? row.delete_scheduled_at : null,
    cancelledAt: row.delete_cancelled_at,
    reason: row.delete_reason
  };
}

export function daysFrom(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function sessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    role: isUserRole(row.role) ? row.role : "teacher",
    status: isUserStatus(row.status) ? row.status : "active",
    displayName: row.username,
    deletion: deletionState(row)
  };
}

export function adminUser(row: UserRow, notes: AdminUserNote[] = []): AdminUser {
  return {
    id: row.id,
    username: row.username,
    role: isUserRole(row.role) ? row.role : "teacher",
    status: isUserStatus(row.status) ? row.status : "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    deletion: deletionState(row),
    notes
  };
}

export function adminUserNote(row: AdminUserNoteRow): AdminUserNote {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

export function feedbackFromRow(row: FeedbackRow): UserFeedback {
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

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

export function forbidden(): Response {
  return json({ error: "Forbidden" }, 403);
}

export function isMigrationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /no such table: user_sessions|no such table: user_deletion_events|no such table: user_feedback|no such table: admin_user_notes|no such table: ai_provider_configs|no such table: ai_usage_logs|no such column: .*delete_|no such column: deleted_at|no such column: last_latency_ms/i.test(
    error.message
  );
}
