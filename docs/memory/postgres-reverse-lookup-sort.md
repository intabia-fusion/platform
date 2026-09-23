# Postgres: sort by reverse lookup field

Область: [Architecture](../architecture.md)

- Reverse lookup (`lookup._id`) is a `(SELECT jsonb_agg(...)) AS reverse_lookup_*` column; Postgres rejects an output alias inside an ORDER BY expression (42703). Bug came with upstream `bf1de1f436` (Cockroach, 2024-09-11).
- Hit by the Contacts/Employee table column "Contact info": `sortingKey: ['$lookup.channels.lastMessage', 'channels']` (models/contact, models/recruit - several viewlets use the same two-element form).
- ORDER BY now re-aggregates the field in a subquery: min for ASC, max for DESC (Mongo array semantics) - `getReverseLookupOrder` in `foundations/server/packages/postgres/src/storage.ts`. Test: `ws-tests/api-tests/src/__tests__/contact-channels-sort.test.ts`.
