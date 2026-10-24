<!--
// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import type { AttachmentFormat } from '@hcengineering/attachment'
  import type { SearchSortOrder } from '@hcengineering/core'
  import { getCurrentLocation, navigate, popupstore, Switcher } from '@hcengineering/ui'

  import { openSearchResult } from '../../../navigation'
  import { BrowserTab, isAttachmentTab, type AttachmentTab } from '../../../search/attachments'
  import { peekSearchSnapshot, takePendingSearch } from '../../../search/store'
  import type { ChatSearchFilters } from '../../../search/types'
  import {
    defaultSort,
    filtersFromQuery,
    formatsFromQuery,
    namesSearch,
    replaceSearch,
    searchToQuery,
    sortFromQuery,
    tabFromQuery
  } from '../../../search/url'
  import Header from '../../Header.svelte'
  import FilesPanel from '../search/browser/FilesPanel.svelte'
  import LinksPanel from '../search/browser/LinksPanel.svelte'
  import { tabConfig } from '../search/browser/tabs'
  import SearchInputBox from '../search/SearchInputBox.svelte'
  import SearchPanel from '../search/SearchPanel.svelte'

  const TAB_STORAGE_KEY = 'chunter-browser-tab'
  // Narrower than this, the tabs show only their icons.
  const COMPACT_TABS_WIDTH = 760

  const tabItems = Object.values(BrowserTab).map((id) => ({
    id,
    icon: tabConfig[id].icon,
    labelIntl: tabConfig[id].label,
    tooltip: tabConfig[id].label
  }))

  // Where the browser starts: a search handed over from elsewhere, then a link naming one, then the last one kept.
  const pending = takePendingSearch()
  const url = getCurrentLocation().query
  const last = namesSearch(url) ? undefined : peekSearchSnapshot()

  let tab: BrowserTab = startTab()
  // The kept search is a message search: a file tab opens with its own box empty.
  let query: string = pending?.search ?? (tab === BrowserTab.Messages ? last?.search : undefined) ?? url?.q ?? ''
  let filters: ChatSearchFilters = pending?.filters ?? last?.filters ?? {}
  // The messages and the file tabs keep a sort each; the URL holds the one of the tab it was written for.
  const urlSort = sortFromQuery(url)
  let sort: SearchSortOrder =
    pending?.sort ??
    last?.sort ??
    (tab === BrowserTab.Messages ? urlSort : undefined) ??
    defaultSort(BrowserTab.Messages)
  let fileSort: SearchSortOrder = (tab !== BrowserTab.Messages ? urlSort : undefined) ?? defaultSort(BrowserTab.Files)
  const formats: Record<AttachmentTab, AttachmentFormat[]> = {
    [BrowserTab.Media]: [],
    [BrowserTab.Files]: [],
    [BrowserTab.Audio]: []
  }
  if (isAttachmentTab(tab)) formats[tab] = formatsFromQuery(url)
  // Off by default: searching the text inside files pulls in every document.
  let searchContent = url?.content === '1'

  // Filters from a link name people and objects, which load first.
  let ready = pending != null || last != null
  if (!ready) {
    void filtersFromQuery(url).then((restored) => {
      filters = restored
      ready = true
    })
  }

  let written = ''
  let headerWidth = 0

  $: saveTab(tab)
  $: compactTabs = headerWidth > 0 && headerWidth < COMPACT_TABS_WIDTH

  // Navigating closes every popup, so a URL write would shut a multiselect filter after each click.
  // The write waits until the popups close; the filters themselves apply right away.
  $: popupOpen = $popupstore.some((p) => p.dock !== true)
  $: if (ready && !popupOpen) {
    writeUrl(
      searchToQuery({
        tab,
        query,
        filters,
        sort: tab === BrowserTab.Messages ? sort : fileSort,
        formats: isAttachmentTab(tab) ? formats[tab] : [],
        content: tab === BrowserTab.Files && searchContent
      })
    )
  }

  function writeUrl (search: Record<string, string>): void {
    const serialized = JSON.stringify(search)
    if (serialized === written) return
    written = serialized
    const loc = getCurrentLocation()
    loc.query = replaceSearch(loc.query, search)
    navigate(loc, true)
  }

  // A handed-over search and a link with a query are message searches, whatever tab was last.
  function startTab (): BrowserTab {
    if (pending != null) return BrowserTab.Messages
    return tabFromQuery(url) ?? (url?.q != null ? BrowserTab.Messages : savedTab())
  }

  function savedTab (): BrowserTab {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY)
      if (Object.values(BrowserTab).includes(saved as BrowserTab)) return saved as BrowserTab
    } catch {}
    return BrowserTab.Messages
  }

  function saveTab (tab: BrowserTab): void {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab)
    } catch {}
  }
</script>

<Header adaptive="disabled" withSearch={false} hideTitle bind:realWidth={headerWidth}>
  <svelte:fragment slot="search">
    <div class="header-search page-search">
      {#key tab}
        <SearchInputBox bind:value={query} label={tabConfig[tab].placeholder} autoFocus kind="default" />
      {/key}
    </div>
  </svelte:fragment>
  <svelte:fragment slot="actions">
    <Switcher
      name="browser_group"
      kind="subtle"
      onlyIcons={compactTabs}
      selected={tab}
      items={tabItems}
      on:select={(result) => {
        if (result?.detail.id != null) tab = result.detail.id
      }}
    />
  </svelte:fragment>
</Header>

{#if ready}
  {#if tab === BrowserTab.Messages}
    <SearchPanel
      bind:value={query}
      bind:filters
      bind:sort
      on:select={(e) => {
        void openSearchResult(e.detail.raw.doc)
      }}
    />
  {:else}
    {#key tab}
      {#if isAttachmentTab(tab)}
        <FilesPanel
          {tab}
          bind:value={query}
          bind:filters
          bind:formats={formats[tab]}
          bind:searchContent
          bind:sort={fileSort}
        />
      {:else}
        <LinksPanel bind:value={query} bind:filters bind:sort={fileSort} />
      {/if}
    {/key}
  {/if}
{/if}

<style lang="scss">
  .header-search {
    display: flex;
    align-items: center;
    flex-grow: 1;
    width: 100%;
    min-width: 0;
  }

  :global(.hulyHeader-container:has(.page-search) .hulyHeader-buttonsGroup.search) {
    flex: 1 1 auto;
    min-width: 0;
    margin-left: 0;
  }

  :global(.hulyHeader-container:has(.page-search) > .hulyHeader-buttonsGroup.actions) {
    flex-shrink: 0;
  }

  :global(.hulyHeader-container:has(.page-search) > .hulyHeader-titleGroup) {
    display: none;
  }

  :global(.hulyHeader-container:has(.page-search) > .hulyHeader-buttonsGroup.before:empty),
  :global(.hulyHeader-container:has(.page-search) > .hulyHeader-buttonsGroup.presence:empty) {
    display: none;
  }
</style>
