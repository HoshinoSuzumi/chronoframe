ALTER TABLE platform_plans ADD COLUMN monthly_discount_bps INTEGER NOT NULL DEFAULT 0 CHECK(monthly_discount_bps BETWEEN 0 AND 9999);
ALTER TABLE platform_plans ADD COLUMN quarterly_discount_bps INTEGER NOT NULL DEFAULT 0 CHECK(quarterly_discount_bps BETWEEN 0 AND 9999);
