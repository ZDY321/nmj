import { Env } from "./types";

export async function upsertEncryptedPayload(
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
