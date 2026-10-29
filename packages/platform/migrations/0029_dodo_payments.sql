ALTER TABLE platform_payment_providers ADD COLUMN provider TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE platform_payment_checkouts ADD COLUMN provider TEXT NOT NULL DEFAULT 'creem';
ALTER TABLE platform_payment_checkouts ADD COLUMN provider_key TEXT REFERENCES platform_payment_providers(id);
ALTER TABLE platform_payment_checkouts ADD COLUMN environment TEXT NOT NULL DEFAULT 'test';
ALTER TABLE platform_payment_subscriptions ADD COLUMN provider TEXT NOT NULL DEFAULT 'creem';
ALTER TABLE platform_payment_subscriptions ADD COLUMN provider_key TEXT REFERENCES platform_payment_providers(id);
ALTER TABLE platform_payment_subscriptions ADD COLUMN environment TEXT NOT NULL DEFAULT 'test';
ALTER TABLE platform_payment_events ADD COLUMN provider TEXT NOT NULL DEFAULT 'creem';
ALTER TABLE platform_payment_events ADD COLUMN provider_key TEXT REFERENCES platform_payment_providers(id);
ALTER TABLE platform_payment_events ADD COLUMN environment TEXT NOT NULL DEFAULT 'test';
CREATE TABLE platform_dodo_products(
  provider_key TEXT NOT NULL REFERENCES platform_payment_providers(id),
  plan_id TEXT NOT NULL REFERENCES platform_plans(id),
  interval INTEGER NOT NULL CHECK(interval IN(1,3)),
  product_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  currency TEXT NOT NULL,
  discount_bps INTEGER NOT NULL DEFAULT 0,
  effective_price INTEGER NOT NULL,
  plan_revision INTEGER NOT NULL,
  credential_revision INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(provider_key,plan_id,interval),
  UNIQUE(provider_key,product_id)
);
CREATE INDEX platform_dodo_events_due ON platform_payment_events(provider,environment,state,available_at);
UPDATE platform_payment_checkouts SET state='expired',error='payment_provider_retired' WHERE provider='creem' AND state IN('creating','open','uncertain');
CREATE TABLE platform_dodo_sync_locks(provider_key TEXT PRIMARY KEY REFERENCES platform_payment_providers(id),token TEXT NOT NULL,expires_at INTEGER NOT NULL);
