import { requireAuth } from "./auth";
import { upsertEncryptedPayload } from "./encryptedPayloads";
import { json, notFound, readJson, vaultDocKey, vaultDocType } from "./runtime";
import { EncryptedDocumentRequest, Env } from "./types";

export async function getMyVault(request: Request, env: Env): Promise<Response> {
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

export async function getMyVaultMeta(request: Request, env: Env): Promise<Response> {
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

export async function putMyVault(request: Request, env: Env): Promise<Response> {
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

export async function getEncryptedDocument(pathname: string, request: Request, env: Env): Promise<Response> {
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

export async function putEncryptedDocument(pathname: string, request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }

  const [, , , docType, docKey] = pathname.split("/");
  const body = await readJson<EncryptedDocumentRequest>(request);

  if (!docType || !docKey || !body.encryptedPayload) {
    return json({ error: "Missing encrypted document fields" }, 400);
  }

  if (!body.force && body.expectedUpdatedAt != null) {
    const current = await env.DB.prepare(
      `SELECT updated_at
       FROM encrypted_documents
       WHERE user_id = ? AND doc_type = ? AND doc_key = ?`
    )
      .bind(context.user.id, docType, docKey)
      .first<{ updated_at: string }>();
    if ((current?.updated_at ?? "") !== body.expectedUpdatedAt) {
      return json({ error: "Document version conflict", currentUpdatedAt: current?.updated_at ?? "" }, 409);
    }
  }

  const updatedAt = await upsertEncryptedPayload(env, context.user.id, docType, docKey, body.encryptedPayload);
  return json({ ok: true, updatedAt });
}

export async function deleteEncryptedDocument(pathname: string, request: Request, env: Env): Promise<Response> {
  const context = await requireAuth(request, env);
  if (context instanceof Response) {
    return context;
  }

  const [, , , docType, docKey] = pathname.split("/");
  const body: Pick<EncryptedDocumentRequest, "expectedUpdatedAt" | "force"> = await readJson<
    Pick<EncryptedDocumentRequest, "expectedUpdatedAt" | "force">
  >(request).catch(() => ({}));
  if (!docType || !docKey) {
    return json({ error: "Missing document key" }, 400);
  }

  if (!body.force && body.expectedUpdatedAt != null) {
    const current = await env.DB.prepare(
      `SELECT updated_at
       FROM encrypted_documents
       WHERE user_id = ? AND doc_type = ? AND doc_key = ?`
    )
      .bind(context.user.id, docType, docKey)
      .first<{ updated_at: string }>();
    if ((current?.updated_at ?? "") !== body.expectedUpdatedAt) {
      return json({ error: "Document version conflict", currentUpdatedAt: current?.updated_at ?? "" }, 409);
    }
  }

  await env.DB.prepare(
    `DELETE FROM encrypted_documents
     WHERE user_id = ? AND doc_type = ? AND doc_key = ?`
  )
    .bind(context.user.id, docType, docKey)
    .run();
  return json({ ok: true });
}
