-- A private space that changes its members looks for the notify contexts of its documents, a moved
-- document for the contexts that show its preview (0018): both keep a snapshot of the preview for
-- users who can no longer read it. Idempotent.

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_objectSpace__index ON notification_dnc ("workspaceId", "objectSpace");

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_preview__index ON notification_dnc ("workspaceId", "preview");
