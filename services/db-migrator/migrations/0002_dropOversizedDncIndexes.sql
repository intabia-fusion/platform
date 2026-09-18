-- Drop legacy covering indexes on notification_dnc.
--
-- Both indexes INCLUDE the `data` JSONB column. Since notifications became
-- embedded (latestNotifications and the unread* arrays live in `data`), a row
-- can exceed the btree limit and every write fails with:
--   index row size N exceeds btree version 4 maximum 2704
--
-- Their key columns are already covered by the indexes created in
-- 0001_reworkNotifications.sql, so dropping them only gives up index-only
-- scans, not the lookups themselves.

DROP INDEX IF EXISTS notification_dnc_workspaceid_objectid__class_storing_rec_idx;

DROP INDEX IF EXISTS notification_dnc_workspaceid_user__class_storing_rec_idx;
