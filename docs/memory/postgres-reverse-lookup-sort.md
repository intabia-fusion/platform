# Postgres: sort by reverse lookup field

- Reverse lookup (`lookup._id`) is a `(SELECT jsonb_agg(...)) AS reverse_lookup_*` column; Postgres rejects an output alias inside an ORDER BY expression (42703). Bug came with upstream `bf1de1f436` (Cockroach, 2024-09-11).
- Hit by the Contacts/Employee table column "Contact info": `sortingKey: '$lookup.channels.lastMessage'` (models/contact, models/recruit).
- ORDER BY now re-aggregates the field in a subquery: min for ASC, max for DESC (Mongo array semantics). Test: `ws-tests/api-tests/src/__tests__/contact-channels-sort.test.ts`.
