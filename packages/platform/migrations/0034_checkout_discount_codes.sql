ALTER TABLE platform_payment_checkouts ADD COLUMN coupon_enabled INTEGER NOT NULL DEFAULT 0 CHECK(coupon_enabled IN(0,1));
