-- Support identifying legacy filename titles in photo and album projections.
CREATE INDEX cloud_uploads_photo_source
ON cloud_uploads(site_id, photo_id, source_version);
