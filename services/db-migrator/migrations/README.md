# Database Migrations Naming Conventions

This directory contains database migration scripts.

The `db-migrator` service applies migrations in sequential order and automatically handles differences between database engines (**PostgreSQL** and **CockroachDB**).

---

## File Naming Format

All migration scripts must follow this format:

```text
<sequence_number>_<description>[.<db_flavor>].sql
```

### Components:
1. **`<sequence_number>`**: A zero-padded 4-digit sequence identifier (e.g., `0001`, `0011`, `0105`).
2. **`_<description>`**: A brief camelCase descriptive label (e.g., `_allSchema`, `_addWorkspaceIndex`).
3. **`[.<db_flavor>]`** (Optional): A database engine suffix. Supported values:
   - `.pg` — applied only when running on PostgreSQL.
   - `.crdb` — applied only when running on CockroachDB.
   - *If omitted*, the file serves as the generic fallback applied to both engines.

---

### Examples:

- **Scenario A: Syntax is identical on Postgres and CockroachDB**
  Create a single generic file:
  - `0012_addAttachmentSize.sql`

- **Scenario B: Syntax differs on Postgres vs CockroachDB**
  Create two flavor-specific files for the same sequence number:
  - `0013_alterIndexes.pg.sql`
  - `0013_alterIndexes.crdb.sql`

- **Scenario C: a column is added and then used**
  Cockroach parses a file as one batch and does not see a column added earlier in the same batch
  (`42703 column does not exist`, see `docs/memory/account_db_migrations.md`), so on Cockroach the
  `ADD COLUMN`, its backfill, the constraints over it and the indexes go into separate files with
  their own sequence numbers. Postgres runs the statements one after another and keeps them in one
  file. A sequence number that exists for one flavor only is simply skipped by the other:
  `0006`-`0009` of the notification rework are `.crdb.sql` files without a Postgres twin.

The migrator refuses to run when it cannot tell the engine (`unknown` flavor): with per-flavor
files it would apply the few generic ones, bump the version and leave the rest missing.

---


## Adding a migration

Bump `EXPECTED_SCHEMA_VERSION` in `foundations/server/packages/postgres/src/version.ts` together with
the new file. The migrator compares the stored version with it first and does not even list the
files when the database is already at that version, so a file added without the bump is never
applied to an existing database. The version is a plain counter, not the number of files: one bump
per change set is enough however many files it holds. A file renamed into a flavor (`0001_x.sql` ->
`0001_x.pg.sql`) is not re-applied: the `_migrations` row of any twin of the same number and
description counts as applied. Every file still has to be idempotent, it is the manual repair path.

## Failure handling

Each file runs in one transaction together with its `system._migrations` row. A failing statement
rolls the whole file back, the migrator logs the error and exits with a non-zero code, and the
schema version is not bumped, so the transactor keeps waiting for the version instead of starting
on a half-migrated schema. Fix the script or the data and restart the migrator: files without a row
are retried, files with a row are skipped.

Write every file so it can be re-run (`IF NOT EXISTS`, `COALESCE` for column fills): the same
script is also the manual repair for a database whose row exists but whose changes did not land.

The Postgres adapter reads the real columns of an existing table and stores whatever is missing
inside `data` jsonb, without indexes. It logs `table is missing declared columns` on startup when
that happens; treat that log line as a migration that has to be applied.
