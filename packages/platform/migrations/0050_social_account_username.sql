-- Keep the provider's own label separate from the editable local user profile.
ALTER TABLE platform_accounts ADD COLUMN provider_username TEXT;
