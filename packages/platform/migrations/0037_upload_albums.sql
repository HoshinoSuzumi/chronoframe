-- Preserve upload-time album choices through resumable uploads and background processing.
ALTER TABLE cloud_uploads ADD COLUMN album_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(album_ids_json) AND json_type(album_ids_json)='array');
