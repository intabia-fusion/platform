# Sidebar widget tabs

## Model: one scratch tab per widget

`createWidgetTab(widget, tab)` (`plugins/workbench-resources/src/sidebar.ts`):

- tab with the same `id` exists -> updated in place and focused (`isPinned` preserved)
- otherwise it replaces the single unpinned tab of that widget (active one first, then any unpinned)
- no unpinned tab -> appended

Pinned tabs are never replaced or auto-closed. Widgets are independent: opening a card does not
touch the chat widget state, only which widget is active in the sidebar.

Tab ids must be deterministic per object, otherwise repeated opening produces duplicates:
`chunter_${_id}` (channel), `thread_${_id}`, `cardId`, `Ref<Blob>` (file), `'preview'` (universal
doc preview), `'video'`/`'chat'`/`'transcription'` (meeting).

## Removed: allowedPath auto-close

Before, `WidgetTab.allowedPath` + `closeWrongTabs` in `SidebarExpanded.svelte` closed unpinned
tabs whenever the URL left the allowed prefix - a chat thread died on app switch. Worse, the check
lived in a component mounted only in `EXPANDED` and only scanned the active widget's tabs, so the
behavior depended on whether the sidebar happened to be open. Both are gone; tabs live until the
user closes them or they get replaced by the scratch rule.

`openThreadInSidebar` still keeps its `force` flag: `force=false` is used by `Chat.svelte` to
restore a thread from the URL and must not steal the sidebar from another widget.

## Mobile

Not changed, but relevant:

- `Workbench.svelte`: any location change collapses the sidebar to `MINI` on `mobileAdaptive`;
  tab state survives, only the variant changes.
- `docWidth <= 1024` (`FLOAT_ASIDE`) -> `float` overlay; navigator and sidebar are mutually
  exclusive on narrow screens.
- `sidebar.ts` forces `variant = MINI` both when reading and writing localStorage on
  `isMobile && minWidth`, so the expanded state is effectively not persisted on mobile.
