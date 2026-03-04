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
  import contact from '@hcengineering/contact'
  import { statusByUserStore } from '@hcengineering/contact-resources'
  import { Doc, reduceCalls, Ref } from '@hcengineering/core'
  import { getResource, IntlString, translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import ui, {
    Action,
    AnySvelteComponent,
    Icon,
    IconAdd,
    IconMoreH,
    IconSize,
    languageStore,
    Menu,
    ModernButton,
    NavGroup,
    showPopup
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { getDocIdentifier } from '@hcengineering/view-resources'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import { Chat } from '@hcengineering/chunter'

  import { createEventDispatcher } from 'svelte'
  import chunter from '../../../plugin'
  import { getChannelName, getObjectIcon } from '../../../utils'
  import { ChatNavItemModel, SortFnOptions } from '../types'
  import ChatNavItem from './ChatNavItem.svelte'

  export let id: string
  export let header: IntlString
  export let objects: { doc: Doc, chat?: Chat }[]
  export let itemsCount: number
  export let showEmpty: boolean = false
  export let actions: Action[] = []
  export let createAction: Action | undefined
  export let objectId: Ref<Doc> | undefined
  export let sortFn: (items: ChatNavItemModel[], options: SortFnOptions) => ChatNavItemModel[]

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const inboxClient = InboxNotificationsClientImpl.getClient()

  const contextByDocStore = inboxClient.contextByDoc

  let sortedItems: ChatNavItemModel[] = []
  let items: ChatNavItemModel[] = []

  const dispatcher = createEventDispatcher()

  let canShowMore = false

  $: void getChatNavItems(
    objects,
    (res) => {
      items = res
    },
    $languageStore
  )

  $: sortedItems = sortFn(items, {
    contextByDoc: $contextByDocStore,
    userStatusByAccount: $statusByUserStore
  })
  $: canShowMore = itemsCount > items.length

  const getChatNavItems = reduceCalls(
    async (
      objects: { doc: Doc, chat?: Chat }[],
      handler: (items: ChatNavItemModel[]) => void,
      lang: string
    ): Promise<void> => {
      const items: ChatNavItemModel[] = []

      for (const { doc, chat } of objects) {
        const { _class } = doc
        const iconMixin = hierarchy.classHierarchyMixin(_class, view.mixin.ObjectIcon)
        const titleIntl = client.getHierarchy().getClass(_class).label

        const isPerson = hierarchy.isDerived(_class, contact.class.Person)
        const isDocChat = !hierarchy.isDerived(_class, chunter.class.ChunterSpace)
        const isDirect = hierarchy.isDerived(_class, chunter.class.DirectMessage)

        const iconSize: IconSize = isDirect || isPerson ? 'x-small' : 'small'

        let icon: AnySvelteComponent | undefined = undefined

        if (iconMixin?.component) {
          icon = await getResource(iconMixin.component)
        }

        const showIdentifier = isDocChat && !isPerson
        const identifier = showIdentifier ? await getDocIdentifier(client, doc._id, doc._class, doc) : undefined
        const name = (await getChannelName(doc._id, doc._class, doc, lang)) ?? (await translate(titleIntl, {}, lang))

        items.push({
          id: doc._id,
          object: doc,
          chat,
          title: identifier ?? name,
          description: identifier ? name : undefined,
          icon: icon ?? getObjectIcon(_class),
          iconProps: { showStatus: true },
          iconSize,
          withIconBackground: !isDirect && !isPerson
        })
      }

      handler(items)
    }
  )

  function onShowMore (): void {
    dispatcher('show-more')
  }

  $: visibleItem = sortedItems.find(({ id }) => id === objectId)

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
  >
    {#each sortedItems as item (item.id)}
      {@const context = $contextByDocStore.get(item.id)}
      <ChatNavItem {context} isSelected={objectId === item.id} {item} type={'type-object'} on:select />
    {/each}
    {#if canShowMore}
      <div class="showMore">
        <ModernButton label={ui.string.ShowMore} kind="tertiary" inheritFont size="extra-small" on:click={onShowMore} />
      </div>
    {:else}
      <span class="freeSpace" />
    {/if}
    <svelte:fragment slot="visible" let:isOpen>
      {#if visibleItem !== undefined && !isOpen}
        {@const context = $contextByDocStore.get(visibleItem.id)}
        <ChatNavItem {context} isSelected item={visibleItem} type={'type-object'} on:select />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="actions">
      {#if createAction}
        <button
          class="action"
          on:click|preventDefault|stopPropagation={(e) => createAction.action({}, e)}
          data-testid={`action-create-${id}`}
        >
          <Icon icon={IconAdd} size="small" />
        </button>
      {/if}
      {#if actions.length > 0}
        <button
          class="action"
          class:pressed={menuOpened}
          on:click|preventDefault|stopPropagation={handleMenuClicked}
          data-testid={`action-menu-${id}`}
        >
          <IconMoreH size={'small'} />
        </button>
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
