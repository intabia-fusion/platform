-- The chats of a read state: a live window of the navigator asks for them by the join key (0015)
-- when a read state it does not hold changes. Idempotent.

CREATE INDEX IF NOT EXISTS chunter_doc_readState__index ON chunter_doc ("readState");
