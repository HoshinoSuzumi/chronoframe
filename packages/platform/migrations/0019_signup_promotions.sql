CREATE TABLE platform_signup_promotions (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 plan_id TEXT NOT NULL REFERENCES platform_plans(id),
 starts_at INTEGER,
 ends_at INTEGER NOT NULL,
 duration_unit TEXT NOT NULL CHECK(duration_unit IN('permanent','days','months')),
 duration_value INTEGER,
 priority INTEGER NOT NULL DEFAULT 0,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 created_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 CHECK(starts_at IS NULL OR starts_at<ends_at),
 CHECK((duration_unit='permanent' AND duration_value IS NULL)
  OR (duration_unit='days' AND duration_value IS NOT NULL AND typeof(duration_value)='integer' AND duration_value BETWEEN 1 AND 36500)
  OR (duration_unit='months' AND duration_value IS NOT NULL AND typeof(duration_value)='integer' AND duration_value BETWEEN 1 AND 1200))
);
CREATE INDEX platform_signup_promotions_eligibility ON platform_signup_promotions(enabled,ends_at);
ALTER TABLE platform_users ADD COLUMN signup_offer TEXT;
