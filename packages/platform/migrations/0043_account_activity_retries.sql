CREATE TABLE platform_account_activity_retries (
  user_id INTEGER PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
  active_at INTEGER NOT NULL
);

CREATE INDEX platform_activity_retries_due ON platform_account_activity_retries(active_at,user_id);
