CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_verifier TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  encrypted_data_key_by_password TEXT NOT NULL,
  encrypted_data_key_by_recovery TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS encrypted_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, doc_type, doc_key)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_encrypted_documents_user_doc
  ON encrypted_documents(user_id, doc_type, doc_key);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES (
  'login_notice',
  '{"enabled":true,"title":"系统提示","content":"请及时核对课时、请假、补课和工资明细。课程、学生、费用和排课信息会加密保存。","updatedAt":"2026-05-10T00:00:00.000Z"}',
  '2026-05-10T00:00:00.000Z'
);
