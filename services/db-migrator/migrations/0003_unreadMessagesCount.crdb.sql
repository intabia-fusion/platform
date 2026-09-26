-- Denormalized count of unread chat messages per context (backfilled in 0007, indexed in 0010).

ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "unreadMessagesCount" integer NOT NULL DEFAULT 0;
