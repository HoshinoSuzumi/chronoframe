ALTER TABLE platform_sites ADD COLUMN preferred_storage_id TEXT;
ALTER TABLE cloud_storage_connections ADD COLUMN retired INTEGER NOT NULL DEFAULT 0 CHECK(retired IN(0,1));
CREATE TRIGGER cloud_upload_connection_available BEFORE INSERT ON cloud_uploads
WHEN EXISTS(SELECT 1 FROM cloud_storage_connections WHERE site_id=NEW.site_id AND id=NEW.connection_id AND retired=1)
BEGIN SELECT RAISE(ABORT,'storage_connection_unavailable'); END;
