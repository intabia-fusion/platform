# @intabia-fusion/api

Node.js client for the **Intabia Fusion** platform, published as a single
npm package. It bundles the `@hcengineering/*` source packages you need to
talk to a workspace (core, api-client, account-client, query, tracker,
chunter, contact, card, chat, task, document, rank, tags, text, text-core,
client, client-resources, collaborator-client, and more) behind flat subpath
exports.

Sources and build pipeline live in the
[foundation](https://github.com/intabia-fusion/foundation) monorepo under
`dev/api`. Runnable examples live in
[platform-examples/platform-api](https://github.com/intabia-fusion/platform-examples/tree/main/platform-api).

## About the platform

Intabia Fusion is an evolution of the [hcengineering](https://github.com/hcengineering/platform)
Platform - extended and improved on top of its architecture, and kept as a
framework for building business applications (project management, CRM,
HRM, chat, documents). A running deployment hosts one or more
**workspaces**, each an isolated tenant with its own users, data, and
applications. Workspaces are served by:

- **front** - HTTP entry point, serves web UI and proxies API calls. This
  is the URL you pass to `connect()`.
- **transactor** - owns the document model, applies transactions, streams
  live updates over WebSocket.
- **account** - workspace selection and authentication.
- **collaborator** - rich-text (markup) storage. Upload and fetch markdown,
  HTML, or the internal markup JSON.

The client connects to `front`, negotiates a transactor WebSocket, and
discovers the collaborator endpoint automatically.

## Document model

Everything in a workspace is a `Doc`. Each document has:

- `_id: Ref<T>` - stable identifier, allocate with `generateId()`.
- `_class: Ref<Class<T>>` - the class registry entry (e.g. `tracker.class.Issue`).
- `space: Ref<Space>` - the space (scoping container) the doc belongs to.

Classes are declared by plugins. A plugin exposes its classes and
well-known ids on a default export, conventionally named after the plugin:

```ts
import tracker from '@intabia-fusion/api/tracker'
// tracker.class.Issue, tracker.class.Project, tracker.ids.NoParent, ...

import contact from '@intabia-fusion/api/contact'
// contact.class.Person, contact.space.Contacts, contact.channelProvider.Email, ...
```

Key concepts you will hit quickly:

- **Space** - security/scoping container (project, teamspace, channel).
  `core.space.Space` is the meta-space holding Space documents themselves.
- **AttachedDoc** - docs that belong to a parent via a named collection
  (comments on an issue, channels on a person, sub-issues on an issue).
  Use `addCollection` / `updateCollection` / `removeCollection`.
- **Mixin** - extra attributes layered onto an existing doc without
  rewriting the base class. Use `createMixin` / `updateMixin`.
- **Markup** - rich-text fields. Stored as a `MarkupRef` on the doc; body
  lives in the collaborator service. Use `uploadMarkup` / `fetchMarkup`.
- **Rank** - ordered-list key (`makeRank(prev, next)` from
  `@intabia-fusion/api/rank`) for manual sort order (issue lists, etc.).

## Transport: REST vs WebSocket

`connect()` gives you a single `PlatformClient` that is both REST and
WebSocket:

- CRUD (`findOne`, `findAll`, `createDoc`, `updateDoc`, `addCollection`,
  `removeDoc`, markup) translates to REST calls under the hood.
- `createLiveQuery()` reuses the open WebSocket to stream reactive
  updates.

No model is loaded on the client - reads return plain data. Queries are
MongoDB-style: `$in`, `$nin`, `$inc`, `$lt`, sort, limit.

## Install

```bash
npm install @intabia-fusion/api ws
```

`ws` is required for WebSocket from Node.

## Connect

```ts
import { ConnectOptions, NodeWebSocketFactory, connect } from '@intabia-fusion/api/api-client'

const options: ConnectOptions = {
  email: 'user1',
  password: '1234',
  workspace: 'ws1',
  socketFactory: NodeWebSocketFactory,
  connectionTimeout: 30000
}

const client = await connect('http://localhost:8087', options)
try {
  // use client...
} finally {
  await client.close()
}
```

`connect()` authenticates, selects the workspace, opens the transactor
WebSocket, and returns a `PlatformClient`.

## Import paths

Every source package is a subpath export. Import from the package you
need, not from the root.

```ts
import { connect } from '@intabia-fusion/api/api-client'
import core, { type Ref, SortingOrder, generateId } from '@intabia-fusion/api/core'
import tracker, { type Issue, IssuePriority } from '@intabia-fusion/api/tracker'
import contact, { Person } from '@intabia-fusion/api/contact'
import chunter from '@intabia-fusion/api/chunter'
import { LiveQuery } from '@intabia-fusion/api/query'
import { markupToText } from '@intabia-fusion/api/text-core'
import { makeRank } from '@intabia-fusion/api/rank'
```

Nested subpaths also resolve, e.g. `@intabia-fusion/api/ui/types`.

## Reading documents

```ts
const project = await client.findOne(tracker.class.Project, { identifier: 'TSK' })
if (project === undefined) throw new Error('Project not found')

const issues = await client.findAll(
  tracker.class.Issue,
  { space: project._id, status: { $nin: [tracker.status.Done, tracker.status.Canceled] } },
  { sort: { modifiedOn: SortingOrder.Descending }, limit: 50 }
)
```

## Creating documents

Use `createDoc` for top-level docs, `addCollection` for attached docs.
Allocate ids up front with `generateId<T>()` so you can reference the doc
(e.g. in markup) before the create call returns.

```ts
const personId = generateId<Person>()
await client.createDoc(
  contact.class.Person,
  contact.space.Contacts,
  { name: 'Doe,John', city: 'New York', avatarType: AvatarType.COLOR },
  personId
)

await client.addCollection(
  contact.class.Channel,
  contact.space.Contacts,
  personId,
  contact.class.Person,
  'channels',
  { provider: contact.channelProvider.Email, value: 'john.doe@example.com' }
)
```

## Updating and removing

```ts
await client.updateDoc(
  tracker.class.Issue, project._id, issueId,
  { priority: IssuePriority.High }
)

await client.updateCollection(
  tracker.class.Issue, project._id, subIssueId,
  parentIssueId, tracker.class.Issue, 'subIssues',
  { title: 'Renamed' }
)

await client.removeDoc(tracker.class.Issue, project._id, issueId)
```

Operator updates work on `updateDoc`. Pass `retrieve = true` to get the
post-update document back (needed for atomic counters such as project
`sequence`):

```ts
const inc = await client.updateDoc(
  tracker.class.Project, core.space.Space, project._id,
  { $inc: { sequence: 1 } },
  true
)
const sequence = (inc as any).object.sequence
```

## Markup (rich text)

Rich-text fields hold a `MarkupRef`. Upload from markdown or HTML, then
store the returned ref on the document. Fetch back in any supported
format.

```ts
const description = await client.uploadMarkup(
  tracker.class.Issue, issueId, 'description',
  '# Title\n\nBody in **markdown**.',
  'markdown'
)

await client.addCollection(
  tracker.class.Issue, project._id, tracker.ids.NoParent,
  tracker.class.Issue, 'subIssues',
  { title: 'Make coffee', description, /* ... */ },
  issueId
)

const markdown = await client.fetchMarkup(
  issue._class, issue._id, 'description', issue.description, 'markdown'
)
```

The collaborator endpoint is discovered during `connect()`. If the
workspace does not expose one, markup calls will reject.

## Live queries (WebSocket)

`createLiveQuery()` returns a `LiveQuery` bound to the active WebSocket.
Each query is reactive: the callback fires on the initial result and on
every transaction that affects it.

```ts
const lq = client.createLiveQuery()

const unsubscribe = lq.query(
  tracker.class.Issue,
  { space: project._id },
  (result) => {
    console.log('issues updated, total:', result.length)
  },
  { sort: { modifiedOn: SortingOrder.Descending }, limit: 10 }
)

// later
unsubscribe()
```

Multiple `createLiveQuery()` calls return independent instances; garbage
collection reclaims unused ones.

## Environment variables (for examples)

Examples in `platform-examples/platform-api` read:

| Variable | Purpose |
| --- | --- |
| `PLATFORM_URL` | Front URL, e.g. `http://localhost:8087` |
| `PLATFORM_EMAIL` | Account email |
| `PLATFORM_PASSWORD` | Account password |
| `PLATFORM_WORKSPACE` | Workspace identifier |
| `PLATFORM_PROJECT` | Tracker project identifier (e.g. `TSK`) |

## Runnable examples

Full working examples:
[intabia-fusion/platform-examples](https://github.com/intabia-fusion/platform-examples/tree/main/platform-api)

- `tracker/issue-list.ts` - list issues in a project
- `tracker/issue-create.ts` - create an issue with a markup description
- `tracker/issue-sub-create.ts` - create sub-issues
- `tracker/issue-update.ts` - milestones and bulk issue updates
- `tracker/issue-edit.ts` - edit individual fields
- `tracker/issue-labels.ts` - manage labels
- `contact/` - person creation and querying
- `chunter/` - channels and messages
- `documents/` - teamspaces and documents
- `ws/live-query.ts` - reactive subscription

Run any example with:

```bash
npx ts-node examples/tracker/issue-list.ts
```

## Version compatibility

- Client negotiates protocol with the `transactor` service on connect.
  Use a bundle version close to the deployed platform. A bundle from
  foundation `develop` works against a `develop`/latest deployment.
- Subpath export names are stable across minor versions.

## License

EPL-2.0
