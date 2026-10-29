CREATE TABLE platform_dodo_sync_failures(
  provider_key TEXT NOT NULL REFERENCES platform_payment_providers(id),
  plan_id TEXT NOT NULL REFERENCES platform_plans(id),
  interval INTEGER NOT NULL CHECK(interval IN(1,3)),
  plan_revision INTEGER NOT NULL,
  credential_revision INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  next_attempt_at INTEGER NOT NULL,
  error TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(provider_key,plan_id,interval)
);
