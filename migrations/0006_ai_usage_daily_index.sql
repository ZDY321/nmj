CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider_actor_success_date
  ON ai_usage_logs(provider_id, actor_user_id, success, created_at DESC);
