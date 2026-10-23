-- D1 is the durable transactional work queue. External processing uses leases.
ALTER TABLE cloud_processing_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_processing_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE cloud_processing_jobs ADD COLUMN available_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_processing_jobs ADD COLUMN lease_until INTEGER;
ALTER TABLE cloud_processing_jobs ADD COLUMN attempt_id TEXT;
ALTER TABLE cloud_processing_jobs ADD COLUMN worker_id TEXT;
ALTER TABLE cloud_processing_jobs ADD COLUMN error_code TEXT;
ALTER TABLE cloud_photos ADD COLUMN metadata_json TEXT;
CREATE TABLE cloud_job_attempts (
 site_id INTEGER NOT NULL,
 job_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL,
 worker_id TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 finished_at INTEGER,
 state TEXT NOT NULL CHECK (state IN ('running','expired','succeeded','failed','cancelled')),
 PRIMARY KEY(site_id,job_id,attempt_id),
 UNIQUE(site_id,attempt_id),
 FOREIGN KEY(site_id,job_id) REFERENCES cloud_processing_jobs(site_id,id)
);
CREATE TABLE cloud_media_assets (
 site_id INTEGER NOT NULL,
 photo_id TEXT NOT NULL,
 source_version TEXT NOT NULL,
 pipeline_version TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('thumbnail','live-video','display')),
 connection_id TEXT NOT NULL,
 object_key TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes>0),
 content_type TEXT NOT NULL,
 PRIMARY KEY(site_id,photo_id,source_version,pipeline_version,role),
 FOREIGN KEY(site_id,photo_id) REFERENCES cloud_photos(site_id,id)
);
CREATE INDEX cloud_jobs_available ON cloud_processing_jobs(site_id,state,available_at,lease_until,created_at);
CREATE INDEX cloud_jobs_global_poll ON cloud_processing_jobs(state,available_at,lease_until,created_at,site_id);
CREATE TABLE cloud_site_dispatch (
 site_id INTEGER PRIMARY KEY REFERENCES platform_sites(id),
 last_claim_at INTEGER NOT NULL
);
