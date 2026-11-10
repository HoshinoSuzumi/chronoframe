-- Workspace settings use a separate revision from billing and account setup.
ALTER TABLE platform_workspaces ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
-- Existing name writers, including account setup, must invalidate stale forms.
CREATE TRIGGER platform_workspace_name_revision AFTER UPDATE OF name ON platform_workspaces
WHEN NEW.name<>OLD.name AND NEW.revision=OLD.revision BEGIN
 UPDATE platform_workspaces SET revision=OLD.revision+1 WHERE id=NEW.id;
END;
