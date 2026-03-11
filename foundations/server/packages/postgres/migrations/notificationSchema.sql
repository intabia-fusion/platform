ALTER TABLE notification
ADD "isViewed" bool,
ADD archived bool,
ADD "user" text;

ALTER TABLE notification
DROP COLUMN "attachedTo";

UPDATE notification
SET "isViewed" = (data->>'isViewed')::boolean;

UPDATE notification
SET "archived" = (data->>'archived')::boolean;

UPDATE notification
SET "user" = (data->>'user');

ALTER TABLE notification
ALTER COLUMN "isViewed" SET NOT NULL;

ALTER TABLE notification
ALTER COLUMN archived SET NOT NULL;

ALTER TABLE notification
ALTER COLUMN "user" SET NOT NULL;

ALTER TABLE notification
    ADD "lastView" bigint,
    ADD "lastUpdate" bigint,
    ADD "lastNotify" bigint,
    ADD "lastNotifiedMessage" bigint;

UPDATE notification
SET "lastView" = (data->>'lastView')::bigint;

UPDATE notification
SET "lastUpdate" = (data->>'lastUpdate')::bigint;

UPDATE notification
SET "lastNotify" = (data->>'lastNotify')::bigint;

UPDATE notification
SET "lastNotifiedMessage" = (data->>'lastNotifiedMessage')::bigint;
