<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import type { Doc, Ref, Class, Space } from '@hcengineering/core'
  import { getCurrentAccount } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { EmptyStateAction, Location } from '@hcengineering/ui'
  import {
    Component,
    defineSeparators,
    EmptyState,
    getCurrentLocation,
    location,
    navigate,
    Separator,
    restoreLocation,
    showPopup,
    deviceOptionsStore as deviceInfo
  } from '@hcengineering/ui'
  import type { NavigatorModel, SpecialNavModel } from '@hcengineering/workbench'
  import { onMount, onDestroy } from 'svelte'
  import type { Chat, DirectMessage } from '@hcengineering/chunter'
  import { chunterId } from '@hcengineering/chunter'
  import view from '@hcengineering/view'
  import { NotificationClientImpl } from '@hcengineering/notification-resources'
  import { onboardingHints, parseLinkId, getObjectLinkId } from '@hcengineering/view-resources'
  import type { ActivityMessage } from '@hcengineering/activity'
  import { loadSavedAttachments } from '@hcengineering/attachment-resources'

  import ChatNavigator from './navigator/ChatNavigator.svelte'
  import ChannelView from '../ChannelView.svelte'
  import { chatSpecials, createRealDirectFromFake, isFakeDirect } from './utils'
  import type { SelectChannelEvent } from './types'
  import { decodeChatURI, openChannel, openThreadInSidebar } from '../../navigation'
  import { getDmName } from '../../utils'
  import chunter from '../../plugin'

  const objectQuery = createQuery()
  const client = getClient()

  const navigatorModel: NavigatorModel = {
    spaces: [],
    specials: chatSpecials
  }

  const linkProviders = client.getModel().findAllSync(view.mixin.LinkIdProvider, {})

  // Top-3 active chats for the "select a channel" empty state - mirrors chatNavGroupModels' query.
  const me = getCurrentAccount()
  const unreadByDoc = NotificationClientImpl.getClient().unreadByDoc
  const activeChatQuery = {
    account: me.uuid,
    hidden: false,
    '$lookup.attachedTo.archived': false,
    '$lookup.attachedTo._id': { $exists: true }
  }

  let channelChats: Doc[] = []
  let directChats: Doc[] = []

  createQuery().query(
    chunter.class.Chat,
    { ...activeChatQuery, attachedToClass: chunter.class.Channel },
    (res) => {
      channelChats = res.map((it) => it.$lookup?.attachedTo).filter((it): it is Doc => it !== undefined)
    },
    { lookup: { attachedTo: chunter.class.Channel }, limit: 10 }
  )

  createQuery().query(
    chunter.class.Chat,
    { ...activeChatQuery, attachedToClass: chunter.class.DirectMessage },
    (res) => {
      directChats = res.map((it) => it.$lookup?.attachedTo).filter((it): it is Doc => it !== undefined)
    },
    { lookup: { attachedTo: chunter.class.DirectMessage }, limit: 10 }
  )

  $: topChats = [...channelChats, ...directChats]
    .sort((a, b) => {
      const unreadA = ($unreadByDoc.get(a._id)?.unreadMessagesCount ?? 0) > 0
      const unreadB = ($unreadByDoc.get(b._id)?.unreadMessagesCount ?? 0) > 0
      if (unreadA !== unreadB) return unreadA ? -1 : 1
      return b.modifiedOn - a.modifiedOn
    })
    .slice(0, 3)

  async function openTopChat (doc: Doc): Promise<void> {
    const id = await getObjectLinkId(linkProviders, doc._id, doc._class, doc)
    openChannel(id, doc._class, undefined, true)
  }

  async function getChatTitle (doc: Doc): Promise<string> {
    return client.getHierarchy().isDerived(doc._class, chunter.class.DirectMessage)
      ? await getDmName(client, doc as DirectMessage)
      : (doc as Space).name
  }

  // Resolved once topChats settles (mount + rare updates), so the actions line never renders a
  // blank link while a name is still loading.
  let topChatTitles = new Map<Ref<Doc>, string>()
  $: void Promise.all(topChats.map(async (doc) => [doc._id, await getChatTitle(doc)] as const)).then((entries) => {
    topChatTitles = new Map(entries)
  })

  function getEmptyChoices (topChats: Doc[], titles: Map<Ref<Doc>, string>): EmptyStateAction[] {
    return topChats
      .filter((doc) => titles.has(doc._id))
      .map((doc) => ({
        title: titles.get(doc._id) as string,
        onClick: () => {
          void openTopChat(doc)
        }
      }))
  }

  function getEmptyActions (hints: boolean): EmptyStateAction[] {
    if (!hints) return []
    return [
      {
        label: chunter.string.CreateChannel,
        onClick: () => {
          showPopup(chunter.component.CreateChannel, {}, 'top')
        }
      }
    ]
  }
  $: emptyChoices = getEmptyChoices(topChats, topChatTitles)
  $: emptyActions = getEmptyActions($onboardingHints)

  let selectedData: { id: string, _class: Ref<Class<Doc>> } | undefined = undefined

  let currentSpecial: SpecialNavModel | undefined

  let object: Doc | undefined = undefined
  let chat: Chat | undefined

  let replacedPanel: HTMLElement
  let needRestoreLoc = true

  const unsubcribe = location.subscribe((loc) => {
    syncLocation(loc)
  })
  onDestroy(() => {
    unsubcribe()
  })

  $: void loadObject(selectedData?.id, selectedData?._class)

  async function loadObject (id?: string, _class?: Ref<Class<Doc>>): Promise<void> {
    if (id == null || _class == null || _class === '') {
      object = undefined
      chat = undefined
      objectQuery.unsubscribe()
      return
    }

    const _id: Ref<Doc> | undefined = await parseLinkId(linkProviders, id, _class)

    if (_id === undefined) {
      object = undefined
      chat = undefined
      objectQuery.unsubscribe()
      return
    }

    objectQuery.query(
      _class,
      { _id },
      (res) => {
        object = res[0]
        chat = (res[0] as any)?.$lookup?.chats?.[0]
      },
      {
        limit: 1,
        lookup: { _id: { chats: chunter.class.Chat } }
      }
    )
  }

  function syncLocation (loc: Location): void {
    if (loc.path[2] !== chunterId) {
      return
    }

    const id = loc.path[3]

    if (id == null || id === '') {
      currentSpecial = undefined
      selectedData = undefined
      object = undefined
      chat = undefined
      if (needRestoreLoc) {
        needRestoreLoc = false
        restoreLocation(loc, chunterId)
      }
      return
    }

    needRestoreLoc = false
    currentSpecial = navigatorModel?.specials?.find((special) => special.id === id)

    if (currentSpecial !== undefined) {
      selectedData = undefined
      object = undefined
      chat = undefined
    } else {
      const [id, _class] = decodeChatURI(loc.path[3])
      selectedData = { id, _class }
    }

    const thread = loc.path[4] as Ref<ActivityMessage> | undefined

    if (thread !== undefined) {
      void openThreadInSidebar(thread, undefined, undefined, undefined, undefined, false)
    }
  }

  async function handleChannelSelected (event: CustomEvent): Promise<void> {
    if (event.detail === null) {
      selectedData = undefined
      return
    }

    const detail = (event.detail ?? {}) as SelectChannelEvent

    let selectedObject = detail.object
    const selectedChat = detail.chat

    if (isFakeDirect(selectedObject)) {
      const direct = await createRealDirectFromFake(selectedObject)
      if (direct != null) {
        selectedObject = direct
      } else {
        selectedData = undefined
        return
      }
    }

    const _class = selectedObject._class
    const _id = selectedObject._id

    if (_id !== object?._id) {
      object = selectedObject
      chat = selectedChat
    }

    const id = await getObjectLinkId(linkProviders, _id, _class, selectedObject)

    selectedData = { id, _class }

    openChannel(selectedData.id, selectedData._class, undefined, true)
  }

  defineSeparators('chat', [
    { minSize: 12.5, maxSize: 40, size: 17.5, float: 'navigator' },
    { size: 'auto', minSize: 20, maxSize: 'auto' },
    { size: 20, minSize: 20, maxSize: 50, float: 'aside' }
  ])

  onMount(() => {
    loadSavedAttachments()
  })
  $: $deviceInfo.replacedPanel = replacedPanel
  onDestroy(() => ($deviceInfo.replacedPanel = undefined))
</script>

<div class="hulyPanels-container">
  {#if $deviceInfo.navigator.visible}
    <div
      class="antiPanel-navigator {$deviceInfo.navigator.direction === 'horizontal'
        ? 'portrait'
        : 'landscape'} border-left"
      class:fly={$deviceInfo.navigator.float}
    >
      <div class="antiPanel-wrap__content hulyNavPanel-container">
        <ChatNavigator {object} {chat} {currentSpecial} on:select={handleChannelSelected} />
      </div>
      {#if !($deviceInfo.isMobile && $deviceInfo.isPortrait && $deviceInfo.minWidth)}
        <Separator name="chat" float={$deviceInfo.navigator.float ? 'navigator' : true} index={0} />
      {/if}
    </div>
    <Separator
      name="chat"
      float={$deviceInfo.navigator.float}
      index={0}
      color={'transparent'}
      separatorSize={0}
      short
    />
  {/if}
  <div bind:this={replacedPanel} class="hulyComponent">
    {#if currentSpecial}
      <Component
        is={currentSpecial.component}
        props={{
          model: navigatorModel,
          ...currentSpecial.componentProps
        }}
        on:action={(e) => {
          if (e?.detail != null) {
            const loc = getCurrentLocation()
            loc.query = { ...loc.query, ...e.detail }
            navigate(loc)
          }
        }}
      />
    {:else if object}
      <ChannelView {object} />
    {:else if currentSpecial === undefined && selectedData === undefined}
      <EmptyState
        icon={chunter.icon.Chunter}
        title={chunter.string.SelectChannel}
        choices={emptyChoices}
        actions={emptyActions}
      />
    {/if}
  </div>
</div>
