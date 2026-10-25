# pen.dev design as code

Builds `.pen` files with the pen.dev CLI (headless `pen interactive`) from the same screen scripts as `dev/design`:
the scripts that `dev/design/design.json` lists for a file, in its order.
Tokens and demo data are read from `dev/design/kit/*.generated.js`; icons come from the repository sources: `kit/<Key>` is a
`ui.icon` key (the symbol of `packages/ui/assets/icons.svg`, as in Storybook), `<ns>/<id>` a plugin sprite symbol or Svelte icon.

- Install: `cd dev/pen && npm install` (outside the pnpm workspace). Sign in once with `node_modules/.bin/pen login`, check with `pen status`.
- Build: `node dev/pen/build.mjs` (about 11 s). `lib` or `screens` as an argument builds one file; `--file <part of the name in design.json>` picks the screen file (default: the first one; `--file screens` builds "Intabia Screens" into `current.pen`). The library always gets the tokens and icons of all screen files; use the full build after a new color token or icon appears.
- Result: `../foundation-tasks/design` next to this repository (`--out <dir>` changes it): `ui-kit.lib.pen` (theme variables `light`/`dark`, the component library), `fusio-1613.pen` and `current.pen` (one canvas, pages stacked under their titles). PNG files are written only with `--png <dir>` (one PNG per screen in `<dir>/<screens>/`, `ui-kit.png`). `--theme dark` (needs `--out`, for checks) sets the dark theme on the top-level screen frames; in the importing file the theme axis is `<alias>:mode`.
- The files are committed in the tasks repository, so the build is deterministic: node ids, the import alias and `fileToken` are renumbered after `pen` saves (`canonicalize` in `build.mjs`); a rebuild without design changes gives the same bytes.
- Open `current.pen` or `fusio-1613.pen` in the pen.dev desktop app with `ui-kit.lib.pen` next to it, the library is imported by relative path.

## Theme colors

Every theme-dependent color is a variable with `light`/`dark` values: theme tokens (`T()`, e.g. `theme-panel-color`) and palette colors (`P()` -> `pal-<Name>`, `PB()` -> `palbg-<Name>`, `PT()` -> `palt-<Name>`). A palette background (column and group headers) is written as a left-to-right gradient `palbg-<Name>` -> `palbge-<Name>`: flat in light, fading into the panel color in dark, as in the product (`dev/design/generate.mjs tokens` fills `paletteBackgroundEnd`). A hex baked into a kit script does not follow the theme.

## Library

`ui-kit.lib.pen` has a top-level frame per category (`Actions`, `Forms`, `People`, `Status`, `TagsAndFilters`, `Tracker`, `Settings`, `Chat`, `Login`, `Workbench`, `Icon`), side by side; inside it a section per group (`Actions/Button`), each component in a cell under its name. A section header carries a badge: `ui/kit: <Component>` when the group already has a product component in `@hcengineering/ui/kit` (map `host.uikit` in `library/ui-kit.js`), `только макет` otherwise. Moving a component between frames keeps its id: ids follow the names.
Names are those of the Storybook kit (`dev/storybook/src/design/kit/<Category>/<Name>.svelte`): `Workbench/Navigator`, `Tracker/IssueCard`, `Actions/Button/primary/medium`. A catch-all variant (`$root` slot) gets `penalty` in `def` so that it loses to any variant that fits. A variant adds a path part (`Forms/Toggle/off`, `Actions/Button/ghost/small/icon`).
Screens are built from instances (`ref`) of these components; whatever a component cannot express stays drawn in place (the build prints `instances/drawn` per component).

| Penpot kit | Library / Storybook |
|---|---|
| `kit.Button`, `kit.IconButton` | `Actions/Button/<kind>/<size>` and `.../icon` |
| `kit.Label` | `TagsAndFilters/Tag` |
| `kit.AvatarEmpty` | `People/Avatar/empty` |
| `kit.NavGroupHeader`, `kit.NavSpaceHeader` | `Workbench/NavGroup`, `Workbench/NavSpace` |
| `kit.ClassicButton` | `Actions/ClassicButton/<kind>/<size>` (`.../icon`; `.../content` takes its children, used only when no other variant fits: `penalty`) |
| other `kit.<Name>` | `<Category>/<Name>` (`kit.Modal` returns `{ modal, body }`: the component is `modal`, `body` is its slot) |
| `kit.TextInput`, `kit.TextArea`, `kit.SelectButton`, `kit.SettingRow`, `kit.Section`, `kit.Callout`, `kit.Steps`, `kit.EmptyState`, `kit.Dialog`, `kit.Tabs`, `kit.SegmentedControl`, `kit.ButtonGroup`, `kit.Breadcrumbs` | components of `@hcengineering/ui/kit` (`dev/design/kit/25-ui-kit.js`): `Forms/TextInput/<kind>/<size>`, `Forms/SelectButton/<kind>/<size>` (`.../full` with `w`), `Settings/SettingRow` (slots `control`, `details`), `Actions/Dialog` (slot `body`) ... |
| `kit.KitStatusIcon`, `kit.KitChip`, `kit.KitNavItem`, `kit.KitNavGroup`, `kit.KitWizardDialog` | the same, `Kit` in front because the plain name belongs to an older kit component: `Status/KitStatusIcon/<tone>[/outline]`, `TagsAndFilters/KitChip/<kind>/<size>` |
| `kit.Dropdown`, `kit.SearchInput` | instances of `Forms/SelectButton` and `Forms/TextInput` (the same look), read back as those |

How an instance is made (`kit/95-library.js`): a tagged kit function still draws its shape in place with the real arguments. When the screen is serialized, the shape is compared with every library variant of that function (same child order, optional parts matched by key); the variant with the fewest differences wins and the differences become overrides:
- changed text, color, size, position: property overrides of the node (`descendants`, keyed by the child index path, which `session.js` turns into ids);
- a part the shape lacks: `enabled: false`; a part that is off in the library look (`hide`): `enabled: true`;
- another icon, status icon, avatar or a nested instance with its own overrides: the node is replaced;
- a shell with a dim or a dialog (`kit.at(frame, ...)` on a `kit.Workbench` frame) fits `Workbench/Workbench/with overlay`: what is added to the frame goes into its `overlay` slot, which exists only when something is added (pen outlines an empty slot);
- a container with variable content (a `slots` entry: card chips, navigator entries, table rows, the content of the main panel): the instance supplies its children. A slot marked `wrap` is cut into rows after the insert, because flex layout has no wrapping.

If no variant fits, the shape stays drawn in place. Nothing in the screen scripts changes: they feed Penpot and Storybook too.

## Add a component

1. Storybook first: the visual component in `dev/storybook/src/design/kit/<Category>/<Name>.svelte` (props from `kit/types.ts`) and a state in the category catalog story.
2. Penpot kit: `kit.<Name>` in `dev/design/kit/*.js` (the recorder `dev/storybook/src/design/generated/recorder.ts` maps it to the Svelte component).
3. If a part of the shape has variable content, give that container its own frame in `kit/90-pen.js` (see `kit.Navigator`, `kit.Table`) so it can be a slot.
4. Pen: add the function name to the tagged list in `kit/95-library.js` and a definition in `library/ui-kit.js`: `def('<Category>/<Name>', kit.<Name>(sample arguments), { hide: [...], slots: [...] })`, one definition per variant that differs in structure or look. Build, open `ui-kit.png` (`--png`) and check that the library look is right.

## From a design to Storybook

Seed, then hand-edited: a screen file such as `fusio-1613.pen` is built from scripts once (the seed). After that the file is edited by hand in pen.dev (or through MCP) and the scripts are no longer the source: changes go back into scripts only through `import.mjs` when the design is approved.
- `build.mjs` writes `dev/pen/.state.json` (git-ignored): per `.pen` the hash of the written bytes and of its inputs. Before writing it compares the file on disk with the stored hash; if they differ the build prints the file and exits with 1 without touching anything. `--force` overwrites anyway (do this only to seed or to drop hand edits). Files in the temp folder (test builds) are not tracked, files without a record are written.
- The guard covers `ui-kit.lib.pen` and `current.pen` too. The library content depends on the screen file passed with `--file` (components come from the screens used), so builds with different `--file` values rebuild it in turn.
- A build whose inputs have not changed is skipped: `library: unchanged`, `<file>.pen: unchanged`. Inputs: library = component JSONs, variables, categories, order, pen version; screen file = its drawing commands plus the library inputs (scripts, kit, demo data). `--png` and `--force` always rebuild. A no-change full build takes about 1 s instead of 12 s.

A new feature is drawn by hand in pen.dev, then moved into the shared screen scripts:
1. Draw it in a separate `.pen` next to `ui-kit.lib.pen` (library imported, screens made of its instances plus layout frames and texts). The generated `ui-kit.lib.pen` and `current.pen` are never edited by hand.
2. `node dev/pen/import.mjs <file.pen> [--out <script.js>] [--page <name>]` writes a screen script in the `kit.*` style of `dev/design/screens/current/*.js`, prints the `TODO(import)` list to stderr. `Page: <name>` frames become `kit.page`, `--page` keeps one page.
3. Put the script into `dev/design/screens/current/` and list it in `dev/design/design.json` (a build entry of "Intabia Screens").
4. `pnpm generate-screens` in `dev/storybook` records it into Storybook; `node dev/pen/build.mjs --file screens` builds it back into pen.

What maps:

| .pen | script |
|---|---|
| top-level frame / Workbench instance | `kit.Frame(...)` / `kit.Workbench(...)` with `main`, `panel` |
| instance of a library component | `kit.<Function>(...)`, arguments from the variant and the overrides (text, icon, color, optional parts) |
| space header, settings layout in a panel | `kit.SpaceHeader(main, ...)`, `kit.SettingsLayout(main, ...)`, their content added to the returned board |
| auto layout frame | `kit.row` / `kit.col` / `kit.box` (gap, padding, align, wrap), children with `kit.add` |
| frame without layout, rectangle | `kit.box`, children and positions with `kit.at` |
| text, circle | `kit.text`, `kit.ellipse` |

The inverse is derived from the library samples in `library/ui-kit.js` (`inverse.mjs`): the sample arguments of a variant are found again in its template (text, nested instance, optional part), so a component added there needs nothing else. Components whose slots carry data (navigator entries, cards, table rows, menu items, space header and settings parts) are read back in `lifts.mjs`; a new component of that kind needs a lift there.
A draft component of the file named `Proposed/<Name>` (for example `Proposed/IssueCard`) is read as the library component (`PROPOSED` in `penfile.mjs`), so the library one must keep the draft's child order.
Not mapped, reported as `// TODO(import): ...` in the script and in the console: free paths and other shapes, local components of the file, a component without a kit function, effects other than shadows, opacity, rotation, per-corner radii, fonts other than IBM Plex Sans, a Workbench inside a frame. A new component drawn in pen first is added to the Storybook kit and to `kit/95-library.js` / `library/ui-kit.js` by hand; until then its instances are reported.
Known losses: the case of uppercase texts comes from the layer name of the instance (or is uppercase), kit options the library samples do not show (for example `accent` of a card besides its border color) are not recovered, the pen file keeps no computed size, so a top-level frame with fit content gets 400x300 and a TODO.

Round trip: `node dev/pen/test/import.test.mjs` builds `current.pen` and `fusio-1613.pen` from the current screens, imports them, builds the scripts back and compares the files (ids aside) and the PNG of every screen. `PEN_TEST_DESIGN=<design.json>` and `PENPOT_KIT_DIR=<kit copy>` pin the screens and the kit while they are being edited.

## How it works

The screens run in Node against a pen backend of the kit. `kit/10-core.js` replaces `dev/design/kit/10-core.js` (shapes are plain objects that serialize to .pen nodes);
`20-atoms` ... `50-settings` are the Penpot files, read unchanged; `kit/90-pen.js` redraws the atoms with pen primitives and reshapes parts for slots; `kit/95-library.js` makes instances.
`session.js` runs inside pen: it resolves library references, descendant paths and cuts `wrap` containers into rows.
`library/ui-kit.js` defines the library components. `build.mjs` orders them so that a component comes after the ones it contains; `env.mjs` is the part `build.mjs` and `import.mjs` share (tokens, icons, kit source).

Pen has no dashed strokes (`strokeStyle: 'dashed'` becomes solid), no pages (`kit.page` stacks screens), and the layout engine measures text itself (`kit.settle` does nothing).
`pen --prompt` (AI agent) is not used by the build; the files may be uploaded to pen.dev, keep only demo data in them.
