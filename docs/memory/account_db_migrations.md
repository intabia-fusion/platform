# Account DB migrations

Область: [Аутентификация, авторизация и онбординг](../features/auth-onboarding.md)

## Adding a column and using it must be two migrations

CockroachDB parses a multi-statement batch as a whole before executing it. A migration that does `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` followed by an `UPDATE` referencing that column in the same batch fails on cockroach with `42703 - column "..." does not exist`; PostgreSQL executes the statements sequentially and swallows it, so the bug only appears on the cockroach regions.

Symptom seen in the wild (v35 before the split): a workspace-service pod looped on the error for hours and stopped processing the queue entirely, every workspace creation hung at "Creation in progress... 0%"; nothing in the UI pointed at migrations, only the pod logs did.

Split it: `ADD COLUMN` and its backfill go into two separate migrations (same reason a freshly added column and an index build on it are split - cockroach also refuses an index build while the column is still backfilling).

Check both DB flavors when a migration touches schema - on the ws-tests stand account uses postgres (`DB_PG_URL`) while the default-region workspace pod uses cockroach (`DB_URL`), so a migration can be applied in one and missing in the other:

```bash
docker exec sanity-postgres-1 psql -U postgres -p 5433 -d postgres \
  -c "SELECT identifier, applied_at IS NOT NULL FROM global_account._account_applied_migrations ORDER BY identifier;"
docker exec sanity-cockroach-1 ./cockroach sql --insecure -d defaultdb \
  -e "SELECT identifier, applied_at IS NOT NULL FROM global_account._account_applied_migrations;"
```

## Never edit an applied migration

`postgres.ts` warns `Migration <id> was applied with different DDL than the current build defines` when the stored DDL differs from the applied one - it is only a warning, the migration never re-runs. On a stand that ran an intermediate build, delete the row so it re-applies (safe only while the DDL is idempotent):

```sql
DELETE FROM global_account._account_applied_migrations WHERE identifier = '<id>';
```

## Связанные документы

- [Аутентификация, авторизация и онбординг](../features/auth-onboarding.md)
- [Отложенное удаление пространств и аккаунтов](deferred-deletion.md)
