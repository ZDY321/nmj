import { getUserById, requireAuth } from "./auth";
import { adminUser, daysFrom, deletionGraceDays, json, notFound, readJson } from "./runtime";
import { AuthContext, Env, UserRow } from "./types";

export async function requestDeleteUser(request: Request, env: Env, actor: AuthContext, targetUserId: string): Promise<Response> {
  const body = await readJson<{ reason?: unknown }>(request).catch((): { reason?: unknown } => ({ reason: "" }));
  const target = await getUserById(env, targetUserId);
  if (!target || target.status === "deleted") {
    return notFound();
  }
  if (target.role === "admin" && target.id === actor.user.id) {
    return json({ error: "Admin cannot request deletion for the current admin session" }, 400);
  }

  const now = new Date().toISOString();
  const reason = String(body.reason ?? "").slice(0, 500);

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
      "delete_requested",
      now,
      actor.user.id,
      null,
      null,
      reason,
      now,
      targetUserId
    )
    .run();

  await addDeletionEvent(env, targetUserId, actor.user.id, "request", reason);
  const updated = await getUserById(env, targetUserId);
  return json(adminUser(updated!));
}

export async function confirmDeleteUser(request: Request, env: Env, actor: AuthContext, targetUserId: string): Promise<Response> {
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
  if (target.status !== "delete_requested") {
    return json({ error: "Deletion has not been requested" }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users SET
      status = 'delete_scheduled',
      delete_second_confirmed_at = ?,
      delete_scheduled_at = ?,
      updated_at = ?
     WHERE id = ?`
  )
    .bind(now, daysFrom(now, deletionGraceDays), now, targetUserId)
    .run();

  await addDeletionEvent(env, targetUserId, actor.user.id, "confirm", null);
  const updated = await getUserById(env, targetUserId);
  return json(adminUser(updated!));
}

export async function cancelDeleteUser(env: Env, actor: AuthContext, targetUserId: string): Promise<Response> {
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

export async function selfCancelDeletion(request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }
  return cancelDeleteUser(env, context, context.user.id);
}

export async function runDueDeletions(env: Env): Promise<Response> {
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
     WHERE status = 'delete_scheduled'
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
  await env.DB.prepare("DELETE FROM admin_user_notes WHERE user_id = ?").bind(userId).run();
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
