ALTER TABLE chunter_doc
    ADD COLUMN IF NOT EXISTS "attachedToClass" text,
    ADD COLUMN IF NOT EXISTS "account" text,
    ADD COLUMN IF NOT EXISTS "pinned" boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false;
