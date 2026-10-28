# Design source

Shared source of the interface mockups, drawn as code. The screen scripts are run by Storybook ([dev/storybook/README.md](../storybook/README.md)) and built into Tenniarb `.tenn` files by `dev/tenn` ([dev/tenn/README.md](../tenn/README.md)); the generated files are in `dev/design/tenn`.

## Layout

- `design.json` lists the files to build, their libraries and the screen scripts of every build step; script paths are relative to this folder. A file with `"storybook": "<section>"` also becomes a Storybook section.
- `kit/00-tokens.generated.js` and `kit/05-demo.generated.js` are generated, do not edit. The kit itself (`kit.*` API, the scripts' vocabulary) is `dev/tenn/kit`; Storybook has its own recording kit (`dev/storybook/src/design/generated/recorder.ts`).
- `kit/25-ui-kit.js` draws the components of `@hcengineering/ui/kit` (TextInput, SettingRow, Dialog, ...) for new designs; `Checkbox`, `Toggle`, `Radio`, `Menu` and `Tabs` of the older files follow ui/kit too. A `color-mix()` of the ui/kit styles is `TM(color, percent[, color2])` (`dev/tenn/kit/20-atoms.js`): a token of its own for both themes. `generate.mjs tokens` resolves `color-mix(in srgb, ...)` theme tokens (`button-selected-*`).
- `screens/<task>/*.js` are the screen scripts; files starting with `_` hold shared data. `screens/current` is the accepted current state of the UI.
- `demo/<locale>/` holds the demo data that the demo stand lacks (extra statuses, issues, boards), in the same file model as `tests/demo-ws`.
- `tenn/` holds the generated Tenniarb files (libraries: `ui-kit.lib.tenn`, `lib/<category>.tenn`, `apps/<app>.tenn` per application, one file per design task); `PlatformDesign.tenn` in the repository root mounts them all, application > category > screens (the taxonomy is `dev/tenn/apps.mjs`).
- `generate.mjs` generates the two files above.

## Generate

```bash
node dev/design/generate.mjs tokens           # kit/00-tokens.generated.js from packages/theme/styles (pnpm -w design:tokens)
node dev/design/generate.mjs demo [checkout]  # kit/05-demo.generated.js and the Storybook demo.generated.json from tests/demo-ws* (pnpm -w design:demo); the checkout defaults to ../foundation4-demo
```
