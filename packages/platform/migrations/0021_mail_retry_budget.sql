-- Delivery attempts include the initial send. Exhausted messages remain inspectable.
CREATE TABLE platform_mail_outbox_next (
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL,
 kind TEXT NOT NULL,
 cycle TEXT NOT NULL,
 to_email TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 available_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sent','cancelled','failed')),
 lease_token TEXT,
 lease_until INTEGER,
 error TEXT,
 UNIQUE(user_id,kind,cycle)
);
INSERT INTO platform_mail_outbox_next
 SELECT id,user_id,kind,cycle,to_email,payload_json,available_at,
 total_attempts,
 CASE WHEN state='pending' AND total_attempts>=3 THEN 'failed' ELSE state END,
 CASE WHEN state='pending' AND total_attempts>=3 THEN NULL ELSE lease_token END,
 CASE WHEN state='pending' AND total_attempts>=3 THEN NULL ELSE lease_until END,
 CASE WHEN state='pending' AND total_attempts>=3 THEN 'email_delivery_exhausted' ELSE error END
 FROM (SELECT *,attempts+CASE WHEN state='sent' OR (state='pending' AND lease_token IS NOT NULL) THEN 1 ELSE 0 END AS total_attempts FROM platform_mail_outbox);
DROP TABLE platform_mail_outbox;
ALTER TABLE platform_mail_outbox_next RENAME TO platform_mail_outbox;
CREATE INDEX platform_mail_pending ON platform_mail_outbox(state,available_at);
