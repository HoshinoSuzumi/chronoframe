-- Provider configuration is independent from the purchase method and availability switch.
CREATE TABLE platform_payment_providers(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN('test','live')),
  credentials_ciphertext TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO platform_payment_providers(id,name,environment,credentials_ciphertext,updated_at)
SELECT 'creem','Creem','test',credentials_ciphertext,updated_at FROM platform_payment_settings WHERE id=1;
ALTER TABLE platform_payment_settings ADD COLUMN current_provider TEXT REFERENCES platform_payment_providers(id);
UPDATE platform_payment_settings SET current_provider='creem',auto_sync=0,revision=revision+1 WHERE id=1;
