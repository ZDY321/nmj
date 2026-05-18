CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 50,
  max_output_tokens INTEGER NOT NULL DEFAULT 1200,
  temperature REAL NOT NULL DEFAULT 0.2,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_tested_at TEXT,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_enabled
  ON ai_provider_configs(enabled, is_default);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  success INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES ai_provider_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider_date
  ON ai_usage_logs(provider_id, created_at DESC);
