# Design source

Shared source of the interface mockups, drawn as code. The same screen scripts and kit are built by three backends: Storybook ([dev/storybook/README.md](../storybook/README.md)), pen.dev ([dev/pen/README.md](../pen/README.md)) and Penpot ([docs/penpot.md](../../docs/penpot.md)). Penpot-only tooling (stand, build, diff) stays in `dev/penpot`.

## Layout

- `design.json` lists the files to build, their libraries and the screen scripts of every build step; script paths are relative to this folder. A file with `"storybook": "<section>"` also becomes a Storybook section.
- `kit/*.js` is the kit (`kit.*` API), loaded by every backend in file name order. Penpot additionally loads `dev/penpot/kit/60-trace.js`.
- `kit/00-tokens.generated.js` and `kit/05-demo.generated.js` are generated, do not edit.
- `kit/25-ui-kit.js` draws the components of `@hcengineering/ui/kit` (TextInput, SettingRow, Dialog, ...) for new designs; `Checkbox`, `Toggle`, `Radio`, `Menu` and `Tabs` of the older files follow ui/kit too. A `color-mix()` of the ui/kit styles is `TM(color, percent[, color2])` (`kit/20-atoms.js`): a token of its own for both themes. `generate.mjs tokens` resolves `color-mix(in srgb, ...)` theme tokens (`button-selected-*`).
- `screens/<task>/*.js` are the screen scripts; files starting with `_` hold shared data. `screens/current` is the accepted current state of the UI.
- `demo/<locale>/` holds the demo data that the demo stand lacks (extra statuses, issues, boards), in the same file model as `tests/demo-ws`.
- `generate.mjs` generates the two files above.

## Generate

```bash
node dev/design/generate.mjs tokens           # kit/00-tokens.generated.js from packages/theme/styles (pnpm -w design:tokens)
node dev/design/generate.mjs demo [checkout]  # kit/05-demo.generated.js and the Storybook demo.generated.json from tests/demo-ws* (pnpm -w design:demo); the checkout defaults to ../foundation4-demo
```
