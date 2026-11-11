-- Keep existing email-only and authenticator-only enrollment semantics.
ALTER TABLE platform_users ADD COLUMN email_two_factor_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_two_factor_enabled IN (0, 1));
ALTER TABLE platform_users ADD COLUMN preferred_two_factor_method TEXT CHECK (preferred_two_factor_method IN ('totp', 'otp'));
UPDATE platform_users SET email_two_factor_enabled = 1
WHERE two_factor_enabled = 1 AND NOT EXISTS (
  SELECT 1 FROM platform_two_factors f WHERE f.user_id = platform_users.id AND f.verified = 1
);
