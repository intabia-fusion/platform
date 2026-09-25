-- Denormalized count of unread chat messages that produced a notification (backfilled in 0007,
-- indexed in 0010).

ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "notifiedMessagesCount" integer NOT NULL DEFAULT 0;
