# Component tests in packages/ui (vitest)

Область: [Testing](../testing.md)

`packages/ui` runs **vitest**, not jest (`vitest.config.mts`, `pnpm test` -> `vitest run --silent`). The rig's test phase sees a non-jest `test` script and runs the package isolated via `pnpm run test`, so no rig change was needed.

Non-obvious pieces, all of them required to make a `.svelte` component mount in jsdom:

- `resolve.conditions: ['browser']` - without it svelte resolves to its SSR runtime and **`onMount` never fires**. The component still renders DOM, so the failure looks like "the component is mounted but half its state is missing" (`parentElement` stays undefined, drags do nothing).
- `workspaceSources()` plugin in the config - workspace packages point `main` at raw `.ts`, which vite refuses as a package entry ("Failed to resolve entry for package @hcengineering/theme").
- `src/__test__/setup.ts` - jsdom ships neither `window.matchMedia` (pulled in by plyr via the ui index) nor `PointerEvent` nor `ResizeObserver` (`use:resizeObserver` is on most self-sizing components; a no-op class is enough, jsdom lays nothing out so it would never fire). It also calls `initThemeStore()`: nothing mounts `Theme.svelte` here, so `themeStore` stays an empty writable and every component that renders a `Label` throws on `$themeStore.language`.
- jsdom does no layout: every `getBoundingClientRect` is zero. `Separator.test.ts` installs a fake layout (`src/__test__/fakeLayout.ts`) that derives widths from the inline styles the component writes and hands the remainder to the auto panels.
- `deviceOptionsStore.fontSize` defaults to 0, so rem-to-px maths collapses unless the test sets it.

Separator's own layout maths lives in `src/separatorLayout.ts` (`buildLayout` / `distribute` / `toSeparators`) - pure functions over plain data, covered by 112 generated combinations in `separatorLayout.test.ts`. The component keeps only DOM reading and style writing.

## Coverage today

`Separator.test.ts` covers horizontal drag, vertical drag, the layout switch regression, a hidden (float-configured but absent) panel, float mode and the window-resize crop. `separatorLayout.test.ts` covers the pure maths over the 112 generated combinations plus a coarse O(n^2) guard.

Two things surfaced while writing them:

- `direction` used to be a `const` inside the component, so the vertical branches were dead code. It is now `export let direction` (default `'horizontal'`), which makes them reachable and testable.
- Float mode can only ever **shrink** a panel: `floatMouseMove` clamps the pointer to the panel being resized (`parentCoord` is capped at `parentSize.size - separatorSize`), so a floating panel never grows past its current width. `Separator.test.ts` pins that as current behaviour with a comment, not as a desired one.

## Benchmarks

`pnpm bench` (`vitest bench --run`) in `packages/ui`:
- `separatorLayout.bench.ts` - buildLayout / distribute / full drag step at 3, 10 and 50 panels.
- `Separator.bench.ts` - 60 pointermove events through the mounted component in jsdom. Benchmarks are excluded from `pnpm test` (`test.include` only matches `*.test.ts`).

## Separator: panel swap without a config change

The planner keeps `separatorName = 'time'` for both Schedule and Team (`showToDos` is true in both), so switching between them replaces only the **panel node** next to the separator - no prop of the separator changes. `afterUpdate` called `checkSibling()` without `start`, which refreshed `prevElement`/`nextElement` only when they were `null`; they pointed at detached nodes instead, so the replacement panel never got `data-size`/`data-auto` and collapsed to min-content (2px in the wild).

`checkSibling` now compares against the separator's actual siblings and returns whether they changed; `afterUpdate` then calls `sizeNewSiblings()`, which sizes only the panels that carry no `data-size`/`data-auto` yet, so it never fights a panel another code path already sized. Covered by "sizes a panel swapped in without a config change" in `Separator.test.ts`.

## Separator: in-memory config went stale after a drag

`finalSeparation` wrote the new sizes to `localStorage` but left the component's own `separators` / `prevElSize` / `nextElSize` untouched - they still held the sizes from the last `fetchSeparators` (which only runs when `name` or `float` changes). Nothing read them right after a drag, so it stayed invisible until `afterUpdate` started re-running sizing on a panel swap: the swapped-in panel was then sized from the pre-drag config (the planner's calendar snapped back to the default 41.25rem after the user had dragged it to 53.75rem).

`finalSeparation` now assigns the freshly computed config back to `separators`. Covered by "applies the dragged size to a panel swapped in afterwards".

## Review follow-ups (same session)

- `separatorsRevision` (in `resize.ts`) is bumped by `saveSeparator`. Several `Separator` components share one config - the planner has one per gap - and each kept its own copy from mount time, so a drag on one left the other stale. Each separator now re-reads the config when the revision for its name moves.
- `direction` reacts to a change: both axes are cleared (`clearContainer` now wipes width **and** height) and sizes re-applied, otherwise the panels keep min/max from the previous axis.
- `installFakeLayout` (`src/__test__/fakeLayout.ts`) stores the native `getBoundingClientRect` unbound (a `.bind(Element.prototype)` would restore a function whose `this` is the prototype) and refuses a second install, so the fake can never become the restore target.
- `distribute` behaviour pinned by two tests: the auto panel next to the separator takes the whole growth; with a sized panel in between, the growth skips it and is split between the auto panels further out.


## Component suites added 2026-09-14

`Button.test.ts` (13), `EditBox.test.ts` (16), `CodeForm.test.ts` (11), `popups.test.ts` (15).
Package coverage went 7.9% -> 12.0% statements; the three components sit at ~90% each.

Mount idiom is the raw svelte client API, as in `Separator.test.ts` - no testing-library. Each
`mount()` appends its **own** wrapper div: with a shared target `querySelector('button')` returns the
first mount's element, and a test that mounts twice silently asserts against the wrong one.

`Icon.svelte` needs a string `Asset` (it renders `<use href>`); an `{} as any` placeholder falls
through to `<svelte:component this={icon}>` and throws.

Two source bugs the suites turned up:

- `utils.ts` imports the package index, and the index re-exports `resize.ts`/`lazy.ts`, which imported
  `DelayedCaller` from `utils.ts`. In that cycle `DelayedCaller` is still undefined when those modules
  evaluate, so importing `EditBox.svelte` first died with `DelayedCaller is not a constructor`. Webpack
  happened to order it the other way, which is why the app never saw it. The class now lives in
  `src/callers.ts`, a leaf with no imports; `utils.ts` re-exports it so the public API is unchanged.
- `closePopup(category)` filtered with `p.type === 'popup' && p.options.category !== category`, which
  dropped every **non**-popup entry of `modalStore` as well - tooltips share that store. Now
  `p.type !== 'popup' || p.options.category !== category`.

`pin()` takes a popup **id** and stores that popup's `options.refId` under `dock-popup`, not the refId
it is handed - easy to get backwards when writing a test.

## Small components: Section, Status, Loading, Fold, ModeSelector, Like (2026-09-14)

`Section.test.ts` (5), `Status.test.ts` (5), `Loading.test.ts` (5), `Fold.test.ts` (5),
`ModeSelector.test.ts` (5), `Like.test.ts` (5) - all pass, no source bugs found.

- `Loading.svelte` dispatches `progress` from a 50ms `setTimeout` in `onMount` - use
  `vi.useFakeTimers()` / `vi.advanceTimersByTime(50)` rather than a real wait.
- `Status.svelte` takes a real `@hcengineering/platform` `Status` object (`severity`, `code`,
  `params`, `notLocalizedParams`), not a plain object - construct with `new Status(...)`.
- `ModeSelector.svelte` wraps `Switcher`/`SwitcherBase`: selection is a radio (`input.switcher`),
  so drive it with a `change` event on the input, not a click.
- `Like.svelte`'s `vote()` flips `voted` unconditionally and always increments `value` - a second
  click un-votes but still increments. Pinned as current behaviour, not obviously desired.
