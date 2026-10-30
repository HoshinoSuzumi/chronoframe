CREATE TABLE platform_payment_plan_rules (
 from_plan TEXT NOT NULL REFERENCES platform_plans(id),
 to_plan TEXT NOT NULL REFERENCES platform_plans(id),
 direction TEXT NOT NULL CHECK(direction IN('upgrade','downgrade')),
 enabled INTEGER NOT NULL DEFAULT 1,
 revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(from_plan,to_plan),
 CHECK(from_plan<>to_plan)
);
ALTER TABLE platform_payment_subscriptions ADD COLUMN price INTEGER;
ALTER TABLE platform_payment_subscriptions ADD COLUMN currency TEXT;
UPDATE platform_payment_subscriptions SET price=(SELECT c.price FROM platform_payment_checkouts c WHERE c.id=checkout_id),currency=(SELECT c.currency FROM platform_payment_checkouts c WHERE c.id=checkout_id);
CREATE TABLE platform_payment_plan_changes (
 id TEXT PRIMARY KEY,
 workspace_id INTEGER NOT NULL REFERENCES platform_workspaces(id) ON DELETE CASCADE,
 user_id INTEGER REFERENCES platform_users(id) ON DELETE SET NULL,
 subscription_id TEXT NOT NULL REFERENCES platform_payment_subscriptions(id) ON DELETE CASCADE,
 provider_key TEXT NOT NULL REFERENCES platform_payment_providers(id),
 credential_revision INTEGER NOT NULL,
 from_product TEXT NOT NULL,
 from_plan TEXT NOT NULL,
 to_product TEXT NOT NULL,
 to_plan TEXT NOT NULL,
 interval INTEGER NOT NULL CHECK(interval IN(1,3)),
 price INTEGER NOT NULL,
 currency TEXT NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN('upgrade','downgrade')),
 rule_revision INTEGER NOT NULL,
 plan_revision INTEGER NOT NULL,
 subscription_revision INTEGER NOT NULL,
 quote_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('quoted','submitting','pending','scheduled','uncertain','applied','failed')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX platform_payment_change_pending ON platform_payment_plan_changes(workspace_id) WHERE state IN('submitting','pending','scheduled','uncertain');
CREATE INDEX platform_payment_change_subscription ON platform_payment_plan_changes(subscription_id,state);
