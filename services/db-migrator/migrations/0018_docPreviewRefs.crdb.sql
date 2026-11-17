-- Join key of a chat and a notify context to the document's `DocPreview`; existing rows are filled by a model migration.
-- The indexes are in 0019: Cockroach does not see a column added in the same file.

ALTER TABLE chunter_doc
    ADD COLUMN IF NOT EXISTS "preview" text;

ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "preview" text;
