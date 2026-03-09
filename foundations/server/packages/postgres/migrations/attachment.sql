ALTER TABLE attachment
ADD "attachedToClass" text;

UPDATE attachment
SET "attachedToClass" = (data->>'attachedToClass');

ALTER TABLE attachment
ADD "size" bigint;

UPDATE attachment
SET "size" = (data->>'size')::bigint;

ALTER TABLE attachment
ADD "type" text;

UPDATE attachment
SET "type" = (data->>'type');

ALTER TABLE attachment
ADD "file" text;

UPDATE attachment
SET "file" = (data->>'file');
