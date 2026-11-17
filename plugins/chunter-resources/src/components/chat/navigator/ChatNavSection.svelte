<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { deepEqual } from 'fast-equals'
  import contact from '@hcengineering/contact'
  import type { Class, Doc, DocPreview, Ref, WithLookup } from '@hcengineering/core'
  import core, { reduceCalls } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import type { Action } from '@hcengineering/ui'
  import ui, { Icon, languageStore, Menu, NavGroup, showPopup } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { getPreviewIcon, getPreviewTitle, previewMembers } from '@hcengineering/view-resources'
  import { employeeByAccountStore } from '@hcengineering/contact-resources'
  import { NotificationClientImpl, NotifyMarker } from '@hcengineering/notification-resources'
  import type { Chat, ChatNavSort } from '@hcengineering/chunter'
  import { getUnreadMessageCount } from '@hcengineering/notification'
  import { createEventDispatcher } from 'svelte'

  import chunter from '../../../plugin'
  import { getChatNavItemKey } from '../utils'
  import type { ChatNavEntry, ChatNavItemModel } from '../types'
  import { moveChat } from '../navigatorSort'
  import { getMovableChat, isSamePlace } from '../navigatorRank'
  import ChatNavItem from './ChatNavItem.svelte'

  export let id: string
  export let _class: Ref<Class<Doc>> = core.class.Doc
  export let header: IntlString
  export let entries: ChatNavEntry[]
  export let itemsCount: number
  export let showEmpty: boolean = false
  export let actions: Action[] = []
  export let createAction: Action | undefined
  export let objectId: Ref<Doc> | undefined
  export let sortByScore: boolean = false
  export let sort: ChatNavSort | undefined = undefined
  export let reorderable: boolean = false

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const dispatcher = createEventDispatcher()
  const unreadByDoc = NotificationClientImpl.getClient().unreadByDoc

  let sortedItems: ChatNavItemModel[] = []
  let items: ChatNavItemModel[] = []
  let canShowMore = false
  let count: number = 0
  let isOpen = true

  // A collapsed section shows the unread total of the documents it lists, from the shared unread
  // store. Not by class: a starred channel lives in another section, hidden and archived ones in none.
  $: sectionIds = new Set(entries.map(({ preview }) => preview.objectId))
  $: count = isOpen
    ? 0
    : getUnreadMessageCount(Array.from($unreadByDoc.values()).filter((it) => sectionIds.has(it.objectId)))

  $: void getChatNavItems(
    entries,
    (res) => {
      items = res
    },
    $languageStore,
    $employeeByAccountStore
  )

  function getScore (i: ChatNavItemModel): number {
    const score = (i.chat as WithLookup<Chat>)?.$source?.$score
    if (score != null) return score

    return (i.preview as WithLookup<DocPreview>)?.$source?.$score ?? 0
  }

  // The query keeps its order; by name it is sorted again, as a direct's name is known only here
  function sortItems (items: ChatNavItemModel[], sort: ChatNavSort | undefined): ChatNavItemModel[] {
    if (sortByScore) {
      return items.sort((a, b) => {
        const scoreDiff = getScore(b) - getScore(a)
        if (scoreDiff !== 0) return scoreDiff
        return (a.title ?? a.identifier).localeCompare(b.title ?? b.identifier)
      })
    }
    if (sort === 'name') return [...items].sort((a, b) => a.title.localeCompare(b.title))
    return items
  }

  $: (() => {
    const newSortedItems = sortItems(items, sort)

    // Check if the underlying identifiers (ids) changed order to skip Svelte updates if unnecessary
    const oldIds = sortedItems.map((i) => i.id).join()
    const newIds = newSortedItems.map((i) => i.id).join()

    if (oldIds !== newIds || !deepEqual(sortedItems, newSortedItems)) {
      sortedItems = newSortedItems
    }
  })()
  $: canShowMore = itemsCount > items.length

  // Rebuilt only on a change of its preview, chat or language (a direct's names also when people load)
  interface Built {
    entry: ChatNavEntry
    lang: string
    people: unknown
    item: ChatNavItemModel
  }
  let built = new Map<Ref<Doc>, Built>()

  const getChatNavItems = reduceCalls(
    async (
      entries: ChatNavEntry[],
      handler: (items: ChatNavItemModel[]) => void,
      lang: string,
      people: unknown
    ): Promise<void> => {
      const archived = `(${await translate(core.string.Archived, {}, lang)})`
      const next = new Map<Ref<Doc>, Built>()
      const items: ChatNavItemModel[] = await Promise.all(
        entries.map(async (entry) => {
          const { preview, chat } = entry
          const prev = built.get(preview.objectId)
          const peopleOf = previewMembers(preview) != null ? people : undefined
          if (
            prev?.entry.preview === preview &&
            prev.entry.chat === chat &&
            prev.lang === lang &&
            prev.people === peopleOf
          ) {
            next.set(preview.objectId, prev)
            return prev.item
          }
          const item = await buildItem(preview, chat, lang, archived)
          next.set(preview.objectId, { entry, lang, people: peopleOf, item })
          return item
        })
      )
      built = next
      handler(items)
    }
  )

  async function buildItem (
    preview: DocPreview,
    chat: Chat | undefined,
    lang: string,
    archived: string
  ): Promise<ChatNavItemModel> {
    const _class = preview.objectClass
    const isPerson = hierarchy.isDerived(_class, contact.class.Person)
    const isDocChat = !hierarchy.isDerived(_class, chunter.class.ChunterSpace)
    const isDirect = hierarchy.isDerived(_class, chunter.class.DirectMessage)
    const [title, icon] = await Promise.all([
      getPreviewTitle(client, preview, lang),
      getPreviewIcon(client, preview, isDirect || isPerson ? { showStatus: true } : {})
    ])
    return {
      id: preview.objectId,
      preview,
      chat,
      identifier: isDocChat && !isPerson ? preview.identifier : undefined,
      title,
      subTitle: preview.archived ? archived : undefined,
      ...icon,
      iconSize: isDirect || isPerson ? 'x-small' : 'small',
      withIconBackground: !isDirect && !isPerson
    }
  }

  function onShowMore (): void {
    dispatcher('show-more')
  }

  $: visibleItem = sortedItems.find(({ id }) => id === objectId)

  const chatNavDragType = 'application/x-chat-nav-item'
  let dragged: Chat | undefined
  let dropTarget: Ref<Doc> | undefined
  let dropAfter = false
  let leaveTimer: ReturnType<typeof setTimeout> | undefined

  $: movable = sortedItems.flatMap((it) => getMovableChat(it) ?? [])

  function cancelLeave (): void {
    clearTimeout(leaveTimer)
    leaveTimer = undefined
  }

  function resetDrag (): void {
    cancelLeave()
    dragged = undefined
    dropTarget = undefined
  }

  // A row that leaves the section mid-drag gets no dragend
  $: if (dragged != null && !movable.some((it) => it._id === dragged?._id)) resetDrag()

  function onDragStart (event: DragEvent, item: ChatNavItemModel): void {
    const chat = getMovableChat(item)
    if (!reorderable || chat == null || event.dataTransfer == null) return
    event.dataTransfer.effectAllowed = 'move'
    // Not text: a row dropped on an editor would paste its id
    event.dataTransfer.setData(chatNavDragType, item.id)
    dragged = chat
  }

  function onDragOver (event: DragEvent, item: ChatNavItemModel): void {
    const target = getMovableChat(item)
    if (dragged == null || target == null || event.dataTransfer == null) return
    cancelLeave()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const after = event.clientY > rect.top + rect.height / 2
    if (isSamePlace(movable, dragged, target, after)) {
      dropTarget = undefined
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    dropAfter = after
    dropTarget = item.id
  }

  // Leaving for a child of the row is not leaving the row
  function onDragLeave (event: DragEvent, item: ChatNavItemModel): void {
    if (dropTarget !== item.id) return
    const to = event.relatedTarget as Node | null
    if (to != null) {
      if (!(event.currentTarget as HTMLElement).contains(to)) dropTarget = undefined
      return
    }
    // Safari gives no relatedTarget: a dragover over the row or its child may come a frame later and cancels this
    cancelLeave()
    leaveTimer = setTimeout(() => {
      if (dropTarget === item.id) dropTarget = undefined
    }, 100)
  }

  function onDrop (event: DragEvent, item: ChatNavItemModel): void {
    event.preventDefault()
    const moving = dragged
    const target = getMovableChat(item)
    const after = dropAfter
    resetDrag()
    if (moving == null || target == null || isSamePlace(movable, moving, target, after)) return
    void moveChat(movable, moving, target, after)
  }

  let menuOpened = false

  function handleMenuClicked (ev: MouseEvent): void {
    menuOpened = true
    showPopup(Menu, { actions, ctx: { _id: id } }, ev.target as HTMLElement, () => {
      menuOpened = false
    })
  }
</script>

{#if sortedItems.length > 0 || showEmpty}
  <NavGroup
    _id={id}
    label={header}
    categoryName={id}
    {actions}
    highlighted={items.some((it) => it.id === objectId)}
    isFold
    empty={sortedItems.length === 0}
    visible={visibleItem !== undefined}
    noDivider
    noPadding
    headerClickType="toggle"
    contextClickType="menu"
    showMenu={menuOpened}
    testid={`section-${id}`}
    bind:isOpen
  >
    {#each sortedItems as item (getChatNavItemKey(item))}
      <div
        class="row"
        class:dropBefore={dropTarget === item.id && !dropAfter}
        class:dropAfter={dropTarget === item.id && dropAfter}
        on:dragstart={(e) => {
          onDragStart(e, item)
        }}
        on:dragover={(e) => {
          onDragOver(e, item)
        }}
        on:dragleave={(e) => {
          onDragLeave(e, item)
        }}
        on:drop={(e) => {
          onDrop(e, item)
        }}
        on:dragend={resetDrag}
      >
        <ChatNavItem
          unread={$unreadByDoc.get(item.id)}
          isSelected={objectId === item.id}
          {item}
          type="type-object"
          draggable={reorderable && getMovableChat(item) != null}
          on:select
        />
      </div>
    {/each}
    {#if canShowMore}
      <div class="showMore">
        <Button label={ui.string.ShowMore} kind="tertiary" inheritFont size="extra-small" on:click={onShowMore} />
      </div>
    {:else}
      <span class="freeSpace" />
    {/if}
    <svelte:fragment slot="visible" let:isOpen={isOpenItem}>
      {#if visibleItem !== undefined && !isOpenItem}
        <ChatNavItem
          unread={$unreadByDoc.get(visibleItem.id)}
          isSelected
          item={visibleItem}
          type="type-object"
          on:select
        />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="actions">
      {#if createAction}
        <button
          class="action"
          on:click|preventDefault|stopPropagation={(e) => createAction.action({}, e)}
          data-testid={`action-create-${id}`}
        >
          <Icon icon={ui.icon.Plus} size="small" />
        </button>
      {/if}
      {#if actions.length > 0}
        <button
          class="action"
          class:pressed={menuOpened}
          on:click|preventDefault|stopPropagation={handleMenuClicked}
          data-testid={`action-menu-${id}`}
        >
          <Icon icon={ui.icon.DotsHorizontal} size="small" />
        </button>
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="after" let:isOpen={isOpenItem}>
      {#if !isOpenItem}
        {#if count > 0}
          <div class="antiHSpacer" />
          <div class="notify">
            <NotifyMarker {count} />
          </div>
          <div class="antiHSpacer" />
        {/if}
      {/if}
    </svelte:fragment>
  </NavGroup>
{/if}

<style lang="scss">
  .showMore {
    margin: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .freeSpace {
    height: 0.25rem;
  }

  .row {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;

    &.dropBefore::before,
    &.dropAfter::after {
      content: '';
      position: absolute;
      left: 0.75rem;
      right: 0.75rem;
      height: 0.125rem;
      pointer-events: none;
      background-color: var(--global-focus-BorderColor);
    }

    &.dropBefore::before {
      top: 0;
    }

    &.dropAfter::after {
      bottom: 0;
    }
  }

  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: var(--spacing-0_5);
    color: var(--global-tertiary-TextColor);
    border: none;
    border-radius: var(--extra-small-BorderRadius);
    outline: none;

    &:hover,
    &.pressed {
      color: var(--global-primary-TextColor);
      background-color: var(--global-ui-highlight-BackgroundColor);
    }
  }
</style>
