-- The join key to a document's preview (`DocPreview`, table `doc_preview`, created by the adapter
-- from its schema), as a column: the chat navigator joins a chat to it, the inbox joins a context
-- to the preview of the document it shows. Filled by the triggers and the notification service
-- for new rows; the backfill of the existing ones is a later model migration. Idempotent.

ALTER TABLE chunter_doc
    ADD COLUMN IF NOT EXISTS "preview" text;

ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "preview" text;

-- A private space that changes its members looks for the notify contexts of its documents, a moved
-- document for the contexts that show its preview: both keep a snapshot of the preview for users
-- who can no longer read it.

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_objectSpace__index ON notification_dnc ("workspaceId", "objectSpace");

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_preview__index ON notification_dnc ("workspaceId", "preview");
