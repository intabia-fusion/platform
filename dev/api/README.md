# @intabia-fusion/api bundle

Single publishable npm package aggregating `@hcengineering/*` foundation
packages (core, api-client, account-client, query, tracker, chunter, contact,
card, chat, task, document, rank, tags, client, client-resources).

## Build locally

```bash
cd dev/api
node scripts/build-bundle.js
cd bundle
npm install
npx tsc
npm pack
# => intabia-fusion-api-<version>.tgz
```

Configuration: `dev/api/config.yml` (roots, partials, exclude scope).

## Download from CI

Each push/PR produces a bundle artifact. To grab it:

1. Open the repo on GitHub -> **Actions** tab.
2. Pick a green `CI` run on `develop` (or your branch/PR).
3. Scroll to the **Artifacts** section at the bottom.
4. Download `intabia-fusion-api-bundle` -> unzip -> you get
   `intabia-fusion-api-<version>.tgz`.

Via `gh` CLI:
```bash
gh run list --workflow=CI --branch=develop --limit=1
gh run download <run-id> -n intabia-fusion-api-bundle -D ./tarballs
```

Or filter latest successful run:
```bash
RUN_ID=$(gh run list --workflow=CI --branch=develop --status=success \
  --limit=1 --json databaseId -q '.[0].databaseId')
gh run download "$RUN_ID" -n intabia-fusion-api-bundle -D ./tarballs
```

## Add to your project

Put the tarball somewhere in your repo (e.g. `tarballs/`), then reference it:

```json
{
  "dependencies": {
    "@intabia-fusion/api": "file:tarballs/intabia-fusion-api-1.0.0.tgz"
  }
}
```

Install:
```bash
npm install
```

### Import paths

Sub-path exports mirror package names:
```ts
import { connect } from '@intabia-fusion/api/api-client'
import core, { type Ref } from '@intabia-fusion/api/core'
import tracker, { type Issue } from '@intabia-fusion/api/tracker'
import { LiveQuery } from '@intabia-fusion/api/query'
```

### Replacing the tarball

Drop the new `.tgz` over the old one (same filename) and:
```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

npm caches tarballs by `name@version`, so either bump the version in
`dev/api/bundle/package.json` before packing, or clean the cache as above.

## Examples

See [`platform-examples/platform-api`](https://github.com/intabia-fusion/platform-examples/tree/main/platform-api)
for REST and WebSocket (LiveQuery) usage.
