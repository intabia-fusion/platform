-- A members change and a move find the contexts that keep a preview snapshot for users who lost access.

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_objectSpace__index ON notification_dnc ("workspaceId", "objectSpace");

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_preview__index ON notification_dnc ("workspaceId", "preview");
