# Account DB: undefined in a query

- `PostgresDbCollection.buildWhereClause` (server/account/src/collections/postgres/postgres.ts) drops keys whose value is `undefined`. `{ uuid: undefined }` becomes no WHERE at all.
- `find`/`findOne` with such a query return an arbitrary row (`LIMIT 1`), so a "does the account exist" check passes.
- `update`/`deleteMany` now throw on an empty WHERE; before, an RPC called without `accountUuid` (`adminSetAccountBlocked`, `adminUpdateAccountWorkspaceLimit`) updated every account.
- RPC params reach the methods unvalidated (`wrap` in server/account/src/utils.ts spreads `request.params`), so ids from params need a `typeof` check before they go into a query.
