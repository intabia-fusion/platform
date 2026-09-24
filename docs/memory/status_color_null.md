# Status color = null -> red list header

`ProjectStatus.color` / `Status.color` can arrive as `null`, not only `undefined`. `getPlatformColorDef(null)` gives `Math.abs(null) = 0` -> `palette[0]` (Firework, red) instead of throwing or falling back.

`StatePresenter` computed the accent color with `color !== undefined && typeof color !== 'string'`, so `null` passed the check and the group header in list views (`ListHeader` via `on:accent-color`) turned red, while the icon (`fill = projectState?.color ?? value?.color ?? category?.color`) stayed with the category color. Fixed with `!= null`.

Shared helpers in `packages/ui/src/colors.ts`: `resolvePaletteColor(...colors)` (first non-null, non-string color in priority order) and `getPaletteColorDef(color, dark)` (undefined for null/strings). Status presenters (`StatePresenter`, `StateIconPresenter`, `StatesBar`, `TypeStatesPopup`, `WorkflowDiagram`) resolve `projectState.color, status.color, category.color` through it, then fall back to `getColorNumberByText(name)`; project/teamspace/document icons use `getPaletteColorDef(x)?.icon ?? fallback`. Tests: `packages/ui/src/__test__/colors.test.ts`.

Do not write `color !== undefined && typeof color !== 'string'` for stored colors - use the helpers.
