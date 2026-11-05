-- Filename equality cannot distinguish an upload default from an explicit edit.
ALTER TABLE cloud_photos ADD COLUMN title_is_custom INTEGER NOT NULL DEFAULT 0
CHECK (title_is_custom IN (0, 1));
