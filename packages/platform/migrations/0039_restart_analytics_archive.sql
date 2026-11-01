-- Restart unfinished snapshots: their page offsets used the previous global cap.
UPDATE platform_analytics_archive_state SET phase=0,page_offset=0,lease_token=NULL,lease_until=0;
DELETE FROM platform_analytics_archive_rows WHERE EXISTS (
  SELECT 1 FROM platform_analytics_archive_state s
  WHERE s.dataset=platform_analytics_archive_rows.dataset
    AND s.snapshot=platform_analytics_archive_rows.snapshot
) AND NOT EXISTS (
  SELECT 1 FROM platform_analytics_archive_days d
  WHERE d.dataset=platform_analytics_archive_rows.dataset
    AND d.snapshot=platform_analytics_archive_rows.snapshot
);
