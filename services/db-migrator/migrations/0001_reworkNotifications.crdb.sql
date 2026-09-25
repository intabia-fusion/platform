-- CockroachDB chain of the notification rework: 0001-0005 add columns, 0006-0008 backfill them,
-- 0009 adds constraints and removes duplicates, 0010 builds the indexes. Cockroach parses a file as
-- one batch and does not see a column added earlier in the same batch, so a column and its first
-- use never share a file (docs/memory/account_db_migrations.md). Every file is idempotent.

ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "parentObjectId" text,
    ADD COLUMN IF NOT EXISTS "parentObjectClass" text,
    ADD COLUMN IF NOT EXISTS "objectSpace" text,
    ADD COLUMN IF NOT EXISTS "lastNotify" bigint,
    ADD COLUMN IF NOT EXISTS "unreadCount" integer;

ALTER TABLE notification_read_state
    ADD COLUMN IF NOT EXISTS "latestMessageId" text,
    ADD COLUMN IF NOT EXISTS "latestMessageTimestamp" bigint;
