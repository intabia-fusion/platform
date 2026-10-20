-- The join key from a chat to the read state of its document: the navigator sorts chats through it.
-- New rows get it from `OnCollaboratorAdded`, existing ones from `chat-read-state-refs-v1`. Idempotent.

ALTER TABLE chunter_doc
    ADD COLUMN IF NOT EXISTS "readState" text;
