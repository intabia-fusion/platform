-- The join key to a document's preview (`DocPreview`, table `doc_preview`, created by the adapter
-- from its schema), as a column: the chat navigator joins a chat to it, the inbox joins a context
-- to the preview of the document it shows. Filled by the triggers and the notification service
-- for new rows; the backfill of the existing ones is a later model migration. The indexes over
-- `preview` are in 0019: Cockroach does not see a column added in the same file. Idempotent.

ALTER TABLE chunter_doc
    ADD COLUMN IF NOT EXISTS "preview" text;

ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "preview" text;
