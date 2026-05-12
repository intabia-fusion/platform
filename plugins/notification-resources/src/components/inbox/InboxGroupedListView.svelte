<!--
// Copyright © 2024 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
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
  import notification, { ActivityNotificationViewlet, DocNotifyContext } from '@hcengineering/notification'
  import { Ref } from '@hcengineering/core'
  import { createEventDispatcher } from 'svelte'
  import { ListView } from '@hcengineering/ui'
  import { getClient } from '@hcengineering/presentation'

  import { InboxNotificationsClientImpl } from '../../inboxNotificationsClient'
  import DocNotifyContextCard from '../DocNotifyContextCard.svelte'
  import { removeContextNotifications, notificationsComparator } from '../../utils'
  import { InboxData } from '../../types'

  export let data: InboxData
  export let selectedContext: Ref<DocNotifyContext> | undefined

  const client = getClient()
  const dispatch = createEventDispatcher()
  const inboxClient = InboxNotificationsClientImpl.getClient()
  const contextByIdStore = inboxClient.contextById

  let list: ListView
  let listSelection = 0
  let element: HTMLDivElement | undefined

  let clearingContexts = new Set<Ref<DocNotifyContext>>()
  let viewlets: ActivityNotificationViewlet[] = []

  void client.findAll(notification.class.ActivityNotificationViewlet, {}).then((res) => {
    viewlets = res
  })

  let displayData: [Ref<DocNotifyContext>, any[]][] = []

  $: displayData = Array.from(data.entries()).sort(([, a], [, b]) => notificationsComparator(a[0], b[0]))

  let stableIndex = 0
  $: {
    const idx = displayData.findIndex(([c]) => c === selectedContext)
    if (idx !== -1) {
      stableIndex = idx
    } else if (selectedContext && !data.has(selectedContext)) {
      // Selection move logic when current item is deleted
      const validIndex = Math.max(0, Math.min(stableIndex, displayData.length - 1))
      const nextContextId = displayData[validIndex]?.[0]
      dispatch('click', { context: nextContextId ? $contextByIdStore.get(nextContextId) : undefined })
    }
  }

  async function clearContext (context: DocNotifyContext): Promise<void> {
    clearingContexts = clearingContexts.add(context._id)

    try {
      await removeContextNotifications(context)
    } finally {
      clearingContexts.delete(context._id)
      clearingContexts = clearingContexts
    }
  }

  function handleActionClear (index: number): void {
    const contextId = displayData[index]?.[0]
    const context = $contextByIdStore.get(contextId)
    if (context != null) void clearContext(context)
  }

  async function onKeydown (key: KeyboardEvent): Promise<void> {
    const actions: Record<string, () => void> = {
      ArrowUp: () => {
        selectIndex(listSelection - 1)
      },
      ArrowDown: () => {
        selectIndex(listSelection + 1)
      },
      Home: () => {
        selectIndex(0)
      },
      End: () => {
        selectIndex(displayData.length - 1)
      },
      Enter: () => dispatch('click', { context: $contextByIdStore.get(displayData[listSelection]?.[0]) }),
      Backspace: () => {
        handleActionClear(listSelection)
      },
      Delete: () => {
        handleActionClear(listSelection)
      }
    }

    if (actions[key.code] != null) {
      key.preventDefault()
      key.stopPropagation()
      actions[key.code]()
    }
  }

  $: if (element != null) element.focus()

  const getContextKey = (index: number): string => displayData[index]?.[0] ?? index.toString()

  function selectIndex (index: number): void {
    if (displayData.length > 0) {
      list.select(Math.max(0, Math.min(index, displayData.length - 1)))
    }
  }
</script>

<div
  class="root"
  bind:this={element}
  tabindex="0"
  role="listbox"
  aria-label="Inbox notifications"
  on:keydown={onKeydown}
>
  <ListView
    bind:this={list}
    bind:selection={listSelection}
    count={displayData.length}
    items={displayData}
    highlightIndex={Math.max(0, Math.min(stableIndex, displayData.length - 1))}
    noScroll
    kind="full-size"
    colorsSchema="lumia"
    getKey={getContextKey}
  >
    <svelte:fragment slot="item" let:item={itemIndex} let:value={item}>
      {#if item}
        {@const [contextId, contextNotifications] = item}
        {@const context = $contextByIdStore.get(contextId)}
        {#if context}
          <DocNotifyContextCard
            value={context}
            notifications={contextNotifications}
            {viewlets}
            isClearing={clearingContexts.has(contextId)}
            on:clear={() => clearContext(context)}
            on:click={(event) => {
              dispatch('click', event.detail)
              listSelection = itemIndex
            }}
          />
        {/if}
      {/if}
    </svelte:fragment>
  </ListView>
</div>

<style lang="scss">
  .root {
    &:focus {
      outline: 0;
    }
    :global(.list-item) {
      border-radius: 0;
    }
  }
</style>
