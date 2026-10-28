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
  import type { Doc, DocPreview, Ref, Class } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { AnyComponent, Location } from '@hcengineering/ui'
  import {
    Component,
    defineSeparators,
    getCurrentLocation,
    location,
    navigate,
    Separator,
    restoreLocation,
    deviceOptionsStore as deviceInfo,
    languageStore
  } from '@hcengineering/ui'
  import type { NavigatorModel, SpecialNavModel } from '@hcengineering/workbench'
  import { onMount, onDestroy } from 'svelte'
  import type { Chat } from '@hcengineering/chunter'
  import { chunterId } from '@hcengineering/chunter'
  import view from '@hcengineering/view'
  import { parseLinkId, getPreviewTitle } from '@hcengineering/view-resources'
  import type { ActivityMessage } from '@hcengineering/activity'
  import { loadSavedAttachments } from '@hcengineering/attachment-resources'

  import ChatNavigator from './navigator/ChatNavigator.svelte'
  import ChannelView from '../ChannelView.svelte'
  import { chatSpecials, createRealDirectFromFake, isFakeDirect } from './utils'
  import type { SelectChannelEvent } from './types'
  import { decodeChatURI, openChannel, openThreadInSidebar } from '../../navigation'
  import { toChunterSpaceLinkId } from '../../linkId'
  import chunter from '../../plugin'

  const objectQuery = createQuery()
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const navigatorModel: NavigatorModel = {
    spaces: [],
    specials: chatSpecials
  }

  const linkProviders = client.getModel().findAllSync(view.mixin.LinkIdProvider, {})

  let selectedData: { id: string, _class: Ref<Class<Doc>> } | undefined = undefined

  let currentSpecial: SpecialNavModel | undefined

  let object: Doc | undefined = undefined
  let chat: Chat | undefined
  let opened: { _id: Ref<Doc>, _class: Ref<Class<Doc>>, preview?: DocPreview } | undefined
  // The click highlights at once; the open document catches up with the location
  let selectedId: Ref<Doc> | undefined
  $: selectedId = opened?._id

  // A slower earlier click must not navigate after a later one, nor after a move by the address
  let selectAsk = 0

  function cancelSelect (): void {
    ++selectAsk
  }

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
      opened = undefined
      object = undefined
      chat = undefined
      objectQuery.unsubscribe()
      return
    }

    const _id: Ref<Doc> | undefined = await parseLinkId(linkProviders, id, _class)

    if (_id === undefined) {
      opened = undefined
      object = undefined
      chat = undefined
      objectQuery.unsubscribe()
      return
    }

    if (opened?._id !== _id) opened = { _id, _class }
    if (object?._id !== _id) {
      object = undefined
      chat = undefined
    }
    objectQuery.query(
      _class,
      { _id },
      (res) => {
        object = res[0]
        chat = (res[0] as any)?.$lookup?.chats?.[0]
        // A link to nothing (a removed or unreadable document) shows no chat
        if (res[0] == null && opened?._id === _id) opened = undefined
        // A link names a chat space by its id only: the input and the panels go by the concrete class
        if (res[0] != null && opened?._id === _id && opened._class !== res[0]._class) {
          opened = { ...opened, _class: res[0]._class }
        }
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
    cancelSelect()

    const id = loc.path[3]

    if (id == null || id === '') {
      currentSpecial = undefined
      selectedData = undefined
      opened = undefined
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
      opened = undefined
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

  function isDocPanel (_class: Ref<Class<Doc>>): boolean {
    return hierarchy.hasClass(_class) && !hierarchy.isDerived(_class, chunter.class.ChunterSpace)
  }

  function getDocPanel (_class: Ref<Class<Doc>>): AnyComponent {
    return hierarchy.classHierarchyMixin(_class, view.mixin.ObjectPanel)?.component ?? view.component.EditDoc
  }

  function closeDocPanel (): void {
    const loc = getCurrentLocation()
    loc.path.length = 3
    loc.fragment = undefined
    loc.query = undefined
    navigate(loc)
  }

  async function handleChannelSelected (event: CustomEvent): Promise<void> {
    cancelSelect()
    if (event.detail === null) {
      selectedData = undefined
      return
    }

    const { preview, chat: selectedChat } = (event.detail ?? {}) as SelectChannelEvent
    const ask = selectAsk
    selectedId = preview.objectId

    // The navigator knows the preview only; the document comes with the location (`loadObject`).
    let _id = preview.objectId
    const _class = preview.objectClass

    if (isFakeDirect(preview)) {
      const direct = await createRealDirectFromFake(preview)
      if (ask !== selectAsk) return
      if (direct == null) {
        selectedId = opened?._id
        selectedData = undefined
        return
      }
      _id = direct._id
      // A direct just created shows at once; anything else waits for `loadObject`
      if (_id !== object?._id) {
        object = direct
        chat = selectedChat
      }
    }

    // The chat or the document panel shows at once by the preview: no request for the link or the header
    opened = { _id, _class, preview: { ...preview, objectId: _id } }
    if (!isDocPanel(_class)) {
      const name = await getPreviewTitle(client, opened.preview as DocPreview, $languageStore)
      if (ask !== selectAsk) return
      selectedData = { id: toChunterSpaceLinkId(_id, name), _class }
      openChannel(selectedData.id, selectedData._class, undefined, true)
      return
    }
    // A document opens in its panel inside the chat, the address stays here
    selectedData = { id: _id, _class }
    openChannel(_id, _class, undefined, true)
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
        <ChatNavigator {object} {chat} {selectedId} {currentSpecial} on:select={handleChannelSelected} />
      </div>
      {#if !($deviceInfo.isMobile && $deviceInfo.isPortrait && $deviceInfo.minWidth)}
        <Separator name="chat" float={$deviceInfo.navigator.float ? 'navigator' : true} index={0} />
      {/if}
    </div>
    <Separator name="chat" float={$deviceInfo.navigator.float} index={0} color="transparent" separatorSize={0} short />
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
    {:else if opened != null && isDocPanel(opened._class)}
      <Component
        is={getDocPanel(opened._class)}
        props={{ _id: opened._id, _class: opened._class, embedded: true }}
        on:close={closeDocPanel}
      />
    {:else if opened != null}
      <ChannelView
        _id={opened._id}
        _class={opened._class}
        object={object?._id === opened._id ? object : undefined}
        preview={opened.preview}
      />
    {/if}
  </div>
</div>
