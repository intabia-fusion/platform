<!--
// Copyright © 2023 Hardcore Engineering Inc.
//
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
  import core, { Doc, getCurrentAccount, Ref, Space } from '@hcengineering/core'
  import {
    Button,
    defineSeparators,
    getCurrentLocation,
    IconSearch,
    Label,
    location as locationStore,
    deviceOptionsStore as deviceInfo,
    ModernButton,
    navigate,
    panelSeparators,
    Separator
  } from '@hcengineering/ui'
  import { DocNotifyContext } from '@hcengineering/notification'
  import { ActivityMessage } from '@hcengineering/activity'
  import { getClient } from '@hcengineering/presentation'
  import { Channel, ObjectChatPanel } from '@hcengineering/chunter'
  import view from '@hcengineering/view'
  import { messageInFocus } from '@hcengineering/activity-resources'
  import { Presence } from '@hcengineering/presence-resources'
  import { tick } from 'svelte'

  import ChannelComponent from './Channel.svelte'
  import ChannelHeader from './ChannelHeader.svelte'
  import DocAside from './chat/DocAside.svelte'
  import chunter from '../plugin'
  import ChannelAside from './chat/ChannelAside.svelte'
  import ThreadView from './threads/ThreadView.svelte'
  import SearchPanel from './chat/search/SearchPanel.svelte'
  import SearchInputBox from './chat/search/SearchInputBox.svelte'
  import SearchFilterBar from './chat/search/SearchFilterBar.svelte'
  import { isThreadMessage } from '../utils'
  import { openSearchResult } from '../navigation'
  import type { ChatSearchFilters, SearchResultRow } from '../search/types'

  export let object: Doc
  export let context: DocNotifyContext | undefined
  export let autofocus = true
  export let embedded: boolean = false
  export let readonly: boolean = false

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const acc = getCurrentAccount()

  let isThreadOpened = false
  let isAsideShown = false
  let threadId: Ref<ActivityMessage> | undefined = undefined

  locationStore.subscribe((newLocation) => {
    threadId = newLocation.path[4] as Ref<ActivityMessage> | undefined
    isThreadOpened = threadId != null
  })

  // A phone has no sidebar to put the thread in, so it takes over this panel instead.
  $: mobileThread = $deviceInfo.isMobile ? threadId : undefined

  function closeThread (): void {
    const loc = getCurrentLocation()
    loc.path.length = 4
    loc.query = { ...loc.query, message: null }
    navigate(loc)
  }

  $: _readonly = hierarchy.isDerived(object._class, core.class.Space)
    ? readonly || (object as Space).archived
    : readonly
  $: showJoinOverlay = shouldShowJoinOverlay(object)
  $: isDocChat = !hierarchy.isDerived(object._class, chunter.class.ChunterSpace)
  $: withAside =
    !embedded && !isThreadOpened && !hierarchy.isDerived(object._class, chunter.class.DirectMessage) && !showJoinOverlay

  function toChannel (object: Doc): Channel {
    return object as Channel
  }

  function shouldShowJoinOverlay (object: Doc): boolean {
    if (hierarchy.isDerived(object._class, core.class.Space)) {
      const space = object as Space

      return !space.members.includes(acc.uuid)
    }

    return false
  }

  async function join (): Promise<void> {
    await client.update(object as Space, { $push: { members: acc.uuid } })
  }

  defineSeparators('aside', panelSeparators)

  async function handleMessageSelect (event: CustomEvent<ActivityMessage>): Promise<void> {
    const message = event.detail

    if (isThreadMessage(message)) {
      const location = getCurrentLocation()
      location.path[4] = message.attachedTo
      navigate(location)
    }

    messageInFocus.set(message._id)
  }

  let searchInput: SearchInputBox | undefined
  let searchOpened = false
  let searchQuery: string = ''
  let searchFilters: ChatSearchFilters = {}
  let searchDismissed = false
  let lastQuery: string = ''

  $: searchAvailable = !$deviceInfo.isMobile
  $: if (!searchAvailable && searchOpened) closeSearch()

  $: if (searchQuery !== lastQuery) {
    lastQuery = searchQuery
    searchDismissed = false
  }
  $: searchSpace = isDocChat ? undefined : (object._id as Ref<Space>)
  $: searchAttachedTo = isDocChat ? object._id : undefined
  $: searchMembersOf = isDocChat ? object.space : (object._id as Ref<Space>)

  function openSearch (initial: string = ''): void {
    searchQuery = initial
    searchDismissed = false
    searchOpened = true
  }

  function closeSearch (): void {
    searchQuery = ''
    searchFilters = {}
    searchDismissed = false
    searchOpened = false
  }

  function toggleSearch (): void {
    if (searchOpened) {
      closeSearch()
    } else {
      openSearch()
      // After the field has mounted: the message composer focuses on mount too and wins the
      // race, which left typing landing in the message box instead of the search.
      void tick().then(() => {
        searchInput?.focus()
      })
    }
  }

  function handleSearchResult (row: SearchResultRow): void {
    searchDismissed = true
    if (hierarchy.isDerived(row._class, chunter.class.ThreadMessage)) {
      void openSearchResult(row.raw.doc)
      return
    }
    messageInFocus.set(row._id as Ref<ActivityMessage>)
  }

  function handleKeydown (e: KeyboardEvent): void {
    if (searchAvailable && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      const target = e.target as HTMLElement | null
      // Leave the browser's own find alone while the user is writing a message.
      if (target?.isContentEditable === true || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return
      }
      e.preventDefault()
      openSearch()
    }
  }

  let objectChatPanel: ObjectChatPanel | undefined
  let prevObjectId: Ref<Doc> | undefined = undefined

  $: if (prevObjectId !== object._id) {
    prevObjectId = object._id
    objectChatPanel = hierarchy.classHierarchyMixin(object._class, chunter.mixin.ObjectChatPanel)
    isAsideShown = isAsideShown ?? objectChatPanel?.openByDefault === true
    closeSearch()
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<Presence {object} />

{#if mobileThread !== undefined}
  <ThreadView _id={mobileThread} withBackButton on:close={closeThread} />
{:else}
  <div class="popupPanel">
    <ChannelHeader
      _id={object._id}
      _class={object._class}
      {object}
      {withAside}
      canOpen={isDocChat}
      allowClose={embedded}
      {isAsideShown}
      canOpenInSidebar={true}
      on:close
      on:select={handleMessageSelect}
      withSearch={false}
      on:aside-toggled={() => {
        isAsideShown = !isAsideShown
      }}
    >
      <svelte:fragment slot="search">
        {#if searchOpened}
          <div class="header-search">
            <SearchInputBox
              bind:this={searchInput}
              bind:value={searchQuery}
              label={chunter.string.SearchInChannelPlaceholder}
              kind="default"
              autoFocus
              on:clear={closeSearch}
              on:focus={() => {
                searchDismissed = false
              }}
            >
              <svelte:fragment slot="filter">
                <SearchFilterBar
                  compact
                  space={searchMembersOf}
                  filters={searchFilters}
                  on:change={(e) => {
                    searchFilters = e.detail
                  }}
                />
              </svelte:fragment>
            </SearchInputBox>
          </div>
        {/if}
      </svelte:fragment>
      <svelte:fragment slot="actions">
        {#if searchAvailable}
          <Button
            icon={IconSearch}
            iconProps={{ size: 'small' }}
            kind={'icon'}
            dataId="channel-search"
            selected={searchOpened}
            showTooltip={{ label: searchOpened ? chunter.string.SearchClose : chunter.string.SearchInChannel }}
            on:click={toggleSearch}
          />
        {/if}
      </svelte:fragment>
    </ChannelHeader>

    <div class="popupPanel-body" class:asideShown={withAside && isAsideShown}>
      <div class="popupPanel-body__main searchHost">
        {#key object._id}
          {#if !_readonly && shouldShowJoinOverlay(object)}
            <div class="body h-full w-full clear-mins flex-center">
              <div class="joinOverlay">
                <div class="an-element__label header">
                  <Label label={chunter.string.JoinChannelHeader} />
                </div>
                <span class="an-element__label">
                  <Label label={chunter.string.JoinChannelText} />
                </span>
                <span class="mt-4"> </span>
                <ModernButton label={view.string.Join} kind={'primary'} dataId={'btnJoin'} on:click={join} />
              </div>
            </div>
          {:else}
            <ChannelComponent readonly={_readonly} {context} {object} autofocus={autofocus && !searchOpened} />
          {/if}
        {/key}
        {#if searchOpened}
          <div class="searchOverlay" class:hidden={searchDismissed}>
          <SearchPanel
            space={searchSpace}
            attachedTo={searchAttachedTo}
            showEscalate={false}
            filters={searchFilters}
            bind:value={searchQuery}
            on:select={(e) => {
              handleSearchResult(e.detail)
            }}
            on:close={closeSearch}
          />
          </div>
        {/if}
      </div>

      {#if withAside && isAsideShown}
        <Separator name="aside" float={false} index={0} />
        <div class="popupPanel-body__aside" class:float={false} class:shown={withAside && isAsideShown}>
          <Separator name="aside" float index={0} />
          <div class="antiPanel-wrap__content">
            {#if hierarchy.isDerived(object._class, chunter.class.Channel)}
              <ChannelAside object={toChannel(object)} {objectChatPanel} />
            {:else}
              <DocAside {object} {objectChatPanel} />
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .joinOverlay {
    display: flex;
    align-self: center;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    height: inherit;
    width: 35rem;
  }

  .header {
    font-weight: 600;
    margin: 1rem;
  }

  .searchHost {
    position: relative;
  }

  .searchOverlay {
    display: contents;
  }

  .searchOverlay.hidden {
    display: none;
  }

  .header-search {
    display: flex;
    align-items: center;
    flex-grow: 1;
    width: 100%;
    min-width: 0;
  }

  .header-search :global(input) {
    min-width: 0;
    flex: 1 1 auto;
  }

  :global(.hulyHeader-container:has(.header-search) > .hulyHeader-buttonsGroup.search) {
    flex-grow: 1;
    min-width: 0;
  }

  :global(.hulyHeader-container:has(.header-search) > .hulyHeader-titleGroup) {
    flex: 0 0 auto;
  }
</style>
