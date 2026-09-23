# fast-build cache ignores external dependencies

Область: [Сборка и инструменты](../getting-started.md)

`pnpm docker:build` can report "from cache" and ship an image whose `bundle.js` still has the old code after a `pnpm patch` (or any change resolved only through the lockfile/external `node_modules`)
- without a rebuild of the packages that actually changed.

`foundations/utils/packages/platform-rig/bin/libs/cache.js` (`calculatePackageHash`) keys each phase on the package's own `src/`/`tests/`/config files plus workspace dependency hashes. Nothing about the root `node_modules` or `pnpm-lock.yaml` enters the key (`collectFileSignatures` explicitly skips `node_modules`), so a change to only an external package leaves every phase looking valid:

- `pnpm patch` / `common/pnpm-patches/*.patch`
- a version bump resolved through the lockfile
- a hand edit inside `node_modules`

`transpile`/`build` is unaffected in practice (types rarely change), but `bundle` and `docker-build` inline the dependency's source into `bundle.js`, so a stale phase silently ships old third-party code into the image. Workaround: delete the `bundle`/`docker-build` entries from the affected packages' `.fast-build-cache.json` (`phases` object) to force a rebuild of just those two phases.

## Verify in the artifact, not in the build log

The build log says "from cache" either way. Check the bundle directly, e.g.:

```sh
docker run --rm --entrypoint sh intabiafusion/transactor \
  -c 'grep -n -A 10 "<known symbol from the change>" /usr/src/app/bundle.js'
```

A green build log is not evidence the change is in the image.

## Связанные документы

- [../getting-started.md](../getting-started.md) - build commands.
- [fast-build-tooling.md](fast-build-tooling.md) - platform-rig/bin internals.
