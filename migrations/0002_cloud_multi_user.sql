ALTER TABLE users ADD COLUMN delete_requested_at TEXT;
ALTER TABLE users ADD COLUMN delete_requested_by TEXT;
ALTER TABLE users ADD COLUMN delete_notice_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN delete_second_confirmed_at TEXT;
ALTER TABLE users ADD COLUMN delete_scheduled_at TEXT;
ALTER TABLE users ADD COLUMN delete_cancelled_at TEXT;
ALTER TABLE users ADD COLUMN delete_reason TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS user_deletion_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_deletion_events_user
  ON user_deletion_events(user_id, created_at DESC);
