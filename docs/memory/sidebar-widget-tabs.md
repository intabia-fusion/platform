# Sidebar widget tabs

Область: [Платформа: рабочее место, настройки, экспорт, бэкап, desktop](../features/platform-infra.md)

## Model: three states per tab, like VSCode editors

`WidgetTab` carries two additive flags (`plugins/workbench/src/types.ts`):

| State | Flags | Look (`ModernTab`) | Replaced? |
| --- | --- | --- | --- |
| preview | neither | `primary`, italic | yes |
| kept | `isKept` | `primary` | no |
| pinned | `isPinned` (+`isKept`) | `secondary`, no close, sorted first | no |

Flags, not a `mode` enum, because widget state is persisted in localStorage per workspace (`sidebar.ts` `getSidebarStateFromLocalStorage`) - adding a field needs no migration.

`createWidgetTab(widget, tab)` (`plugins/workbench-resources/src/sidebar.ts`):

- tab with the same `id` exists -> updated in place and focused (`isPinned`/`isKept` preserved)
- otherwise it replaces the widget's single **preview** tab (active one first, then any preview)
- no preview tab -> appended

Tabs are never auto-closed by navigation: only a widget's preview slot gets replaced (by the next object opened in that widget); kept and pinned tabs live until the user closes them.

Promotion preview -> kept is a **double click on the tab**, caught by the wrapper in `SidebarTabs.svelte` so custom `tabComponent`s (`ChatWidgetTab`, `CardWidgetTab`) get it for free. `unpinWidgetTab` drops to kept, not preview - otherwise unpinning would make the tab vanish on the next open.

Widgets are independent: opening a card does not touch the chat widget state, only which widget is active in the sidebar.

Tab ids must be deterministic per object, otherwise repeated opening produces duplicates: `chunter_${_id}` (channel), `thread_${_id}`, `cardId`, `Ref<Blob>` (file), `preview_${_id}` (universal doc preview - tracker, documents, anything with an `ObjectPanel`), `'video'`/`'chat'`/`'transcription'` (meeting).

`openThreadInSidebar`'s `force` flag defaults to `true`; `Chat.svelte` calls it with `force=false` when restoring a thread from the URL, so it does not steal the sidebar from another widget (`plugins/chunter-resources/src/navigation.ts`).

## Mobile

- `Workbench.svelte`: any location change collapses the sidebar to `MINI` on `mobileAdaptive`; tab state survives, only the variant changes.
- `docWidth <= 1024` (`FLOAT_ASIDE`) -> `float` overlay; navigator and sidebar are mutually exclusive on narrow screens.
- `sidebar.ts` forces `variant = MINI` both when reading and writing localStorage on `isMobile && minWidth`, so on mobile the expanded state is not persisted.
