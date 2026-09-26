-- Drop the legacy covering indexes on notification_dnc (see the Postgres twin for the reason:
-- they store the `data` jsonb, which now carries the embedded notifications). Cockroach names an
-- index through its table.

DROP INDEX IF EXISTS notification_dnc@notification_dnc_workspaceid_objectid__class_storing_rec_idx;

DROP INDEX IF EXISTS notification_dnc@notification_dnc_workspaceid_user__class_storing_rec_idx;
