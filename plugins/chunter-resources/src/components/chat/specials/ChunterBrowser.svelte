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
  import attachment from '@hcengineering/attachment'
  import { FileBrowser } from '@hcengineering/attachment-resources'
  import { Scroller, Switcher } from '@hcengineering/ui'

  import { SearchType } from '../../../utils'
  import { takePendingSearch } from '../../../search/store'
  import { openSearchResult } from '../../../navigation'
  import chunter from '../../../plugin'
  import Header from '../../Header.svelte'
  import SearchPanel from '../search/SearchPanel.svelte'
  import SearchInputBox from '../search/SearchInputBox.svelte'

  const localStorageKey = 'chunter-browser-st__v2'

  let searchType: SearchType = initSearchType()
  $: localStorage.setItem(localStorageKey, searchType.toString())

  const pending = takePendingSearch()

  let query: string = pending?.search ?? ''
  const COMPACT_TABS_WIDTH = 640
  let headerWidth: number = 0
  $: compactTabs = headerWidth > 0 && headerWidth < COMPACT_TABS_WIDTH

  const tabs = [
    {
      id: SearchType.Messages,
      icon: chunter.icon.Messages,
      labelIntl: chunter.string.Messages,
      tooltip: chunter.string.Messages
    },
    {
      id: SearchType.Files,
      icon: attachment.icon.FileBrowser,
      labelIntl: attachment.string.Files,
      tooltip: attachment.string.Files
    }
  ]

  function initSearchType (): SearchType {
    const saved = localStorage.getItem(localStorageKey)
    const parsed = Number(saved)

    if (Object.values(SearchType).includes(parsed)) {
      return parsed
    }

    return SearchType.Messages
  }
</script>

<Header adaptive={'disabled'} withSearch={false} hideTitle bind:realWidth={headerWidth}>
  <svelte:fragment slot="search">
    <div class="header-search page-search">
      <SearchInputBox
        bind:value={query}
        label={chunter.string.SearchPlaceholder}
        autoFocus
        kind="default"
      />
    </div>
  </svelte:fragment>
  <svelte:fragment slot="actions">
    <Switcher
      name={'browser_group'}
      kind={'subtle'}
      onlyIcons={compactTabs}
      selected={searchType}
      items={tabs}
      on:select={(result) => {
        if (result?.detail.id !== undefined) searchType = result.detail.id
      }}
    />
  </svelte:fragment>
</Header>

{#if searchType === SearchType.Messages}
  <SearchPanel
    bind:value={query}
    initialFilters={pending?.filters}
    initialSort={pending?.sort}
    on:select={(e) => {
      void openSearchResult(e.detail.raw.doc)
    }}
  />
{:else}
  <Scroller>
    <FileBrowser requestedSpaceClasses={[chunter.class.Channel, chunter.class.DirectMessage]} withHeader={false} />
  </Scroller>
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
