-- Default-domain aliases remain reserved to their original Site during address changes.
ALTER TABLE platform_domains ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE platform_domains ADD COLUMN redirect_to TEXT;
ALTER TABLE platform_domains ADD COLUMN redirect_until INTEGER;
CREATE TABLE platform_site_slugs (
 slug TEXT PRIMARY KEY,
 site_id INTEGER NOT NULL REFERENCES platform_sites(id)
);
INSERT INTO platform_site_slugs(slug,site_id) SELECT slug,id FROM platform_sites WHERE slug IS NOT NULL;
CREATE TABLE platform_custom_domains (
 hostname TEXT PRIMARY KEY,
 site_id INTEGER NOT NULL REFERENCES platform_sites(id),
 generation TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','active','paused','deleting','deleted','expired')),
 dns_status TEXT NOT NULL DEFAULT 'missing',
 provider_id TEXT,
 route_id TEXT,
 hostname_status TEXT NOT NULL DEFAULT 'unknown',
 ssl_status TEXT NOT NULL DEFAULT 'unknown',
 error TEXT,
 is_primary INTEGER NOT NULL DEFAULT 0,
 redirects INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 checked_at INTEGER,
 expires_at INTEGER NOT NULL,
 next_check_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until INTEGER,
 CHECK(is_primary=0 OR state='active')
);
CREATE UNIQUE INDEX platform_site_primary_domain ON platform_custom_domains(site_id) WHERE is_primary=1;
CREATE INDEX platform_domains_due ON platform_custom_domains(next_check_at,lease_until);
CREATE TABLE platform_domain_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 site_id INTEGER NOT NULL,
 hostname TEXT NOT NULL,
 generation TEXT NOT NULL,
 action TEXT NOT NULL,
 user_id INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX platform_domain_audit_site ON platform_domain_audit(site_id,created_at);
ALTER TABLE platform_custom_domains ADD COLUMN provider_attempted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform_custom_domains ADD COLUMN route_attempted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform_custom_domains ADD COLUMN verified_at INTEGER;
ALTER TABLE platform_custom_domains ADD COLUMN retry_requested INTEGER NOT NULL DEFAULT 0;
INSERT INTO platform_domains(hostname,site_id,verified,active,kind)
SELECT slug||'.chronoframe.art',id,1,1,'default' FROM platform_sites
WHERE length(slug) BETWEEN 3 AND 40 AND slug NOT GLOB '*[^a-z0-9-]*'
AND substr(slug,1,1) GLOB '[a-z0-9]' AND substr(slug,-1,1) GLOB '[a-z0-9]'
AND slug NOT IN ('www','app','api','admin','account','auth','cloud','site','sites','cname','staging','preview','production','dev','test','mail','email','smtp','noreply','support','help','docs','status','assets','static','cdn','chronoframe')
ON CONFLICT(hostname) DO NOTHING;
UPDATE platform_domains SET kind='legacy',redirect_to=(SELECT slug||'.chronoframe.art' FROM platform_sites WHERE id=platform_domains.site_id)
WHERE EXISTS(SELECT 1 FROM platform_sites s WHERE s.id=platform_domains.site_id AND platform_domains.hostname=s.slug||'.site.chronoframe.art'
AND EXISTS(SELECT 1 FROM platform_domains target WHERE target.hostname=s.slug||'.chronoframe.art' AND target.site_id=s.id AND target.kind='default'));

CREATE TABLE platform_domain_provider_lock (
 id INTEGER PRIMARY KEY CHECK(id=1),
 lease_token TEXT,
 lease_until INTEGER
);
INSERT INTO platform_domain_provider_lock(id) VALUES(1);
