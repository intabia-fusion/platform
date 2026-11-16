# Design source

Shared source of the interface mockups, drawn as code. The screen scripts are run by Storybook ([dev/storybook/README.md](../storybook/README.md)); the Tenniarb `.tenn` files built from them live in the tenniarb repository, in `examples/intabia`.

## Layout

- `design.json` lists the files and the screen scripts of every page; script paths are relative to this folder. A file with `"storybook": "<section>"` also becomes a Storybook section.
- `kit/00-tokens.generated.js` and `kit/05-demo.generated.js` are generated, do not edit. Storybook has its own recording kit (`dev/storybook/src/design/generated/recorder.ts`) that implements the `kit.*` API of the scripts.
- `screens/<task>/*.js` are the screen scripts; files starting with `_` hold shared data. `screens/current` is the accepted current state of the UI.
- `demo/<locale>/` holds the demo data that the demo stand lacks (extra statuses, issues, boards), in the same file model as `tests/demo-ws`.
- The Tenniarb files are in the tenniarb repository (`examples/intabia`): libraries, one file per application, and the design tasks. They are edited there by hand, not generated here.
- `generate.mjs` generates the two files above.

## Generate

```bash
node dev/design/generate.mjs tokens           # kit/00-tokens.generated.js from packages/theme/styles (pnpm -w design:tokens)
node dev/design/generate.mjs demo [checkout]  # kit/05-demo.generated.js and the Storybook demo.generated.json from tests/demo-ws* (pnpm -w design:demo); the checkout defaults to ../foundation4-demo
```
