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

---

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
