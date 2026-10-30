ALTER TABLE platform_payment_checkouts ADD COLUMN handover_json TEXT;
ALTER TABLE platform_payment_subscriptions ADD COLUMN activation_state TEXT NOT NULL DEFAULT 'paid' CHECK(activation_state IN('authorized','paid'));
ALTER TABLE platform_payment_subscriptions ADD COLUMN handover_at INTEGER;
ALTER TABLE platform_payment_subscriptions ADD COLUMN handover_revision INTEGER;
