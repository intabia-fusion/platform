<!-- Copyright © 2025 Hardcore Engineering Inc. -->
<!-- -->
<!-- Licensed under the Eclipse Public License, Version 2.0 (the "License"); -->
<!-- you may not use this file except in compliance with the License. You may -->
<!-- obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0 -->
<!-- -->
<!-- Unless required by applicable law or agreed to in writing, software -->
<!-- distributed under the License is distributed on an "AS IS" BASIS, -->
<!-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. -->
<!-- -->
<!-- See the License for the specific language governing permissions and -->
<!-- limitations under the License. -->

<script lang="ts">
  import {
    type Message,
    MessageType,
    Notification,
    type NotificationContext,
    Window
  } from '@hcengineering/communication-types'
  import { createMessagesQuery, getCommunicationClient, type MessageQueryParams } from '@hcengineering/presentation'
  import { Doc, getCurrentAccount, SortingOrder } from '@hcengineering/core'
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte'
  import { deviceOptionsStore as deviceInfo, isAppFocusedStore } from '@hcengineering/ui'
  import { translationStore } from '@hcengineering/contact-resources'

  import { createMessagesObserver, getGroupDay, groupMessagesByDay, MessagesGroup } from '../../messages'
  import MessagesGroupPresenter from '../message/MessagesGroupPresenter.svelte'
  import MessagesLoading from '../message/MessagesLoading.svelte'
  import { messageEditingStore } from '../../stores'
  import { ActivityDirection, ActivityFilter, DateFormat } from '../../types'
  import aggregateMessages, { filterMessages } from '../../activity'

  export let doc: Doc
  export let context: NotificationContext | undefined = undefined
  export let readonly = false
  export let scrollDiv: HTMLDivElement
  export let contentDiv: HTMLDivElement
  export let direction: ActivityDirection = ActivityDirection.Forward
  export let isAllLoaded: boolean = false
  export let filters: ActivityFilter[] = []

  const dispatch = createEventDispatcher()
  const me = getCurrentAccount()
  const communicationClient = getCommunicationClient()
  const query = createMessagesQuery()
  // const notificationsQuery = createNotificationsQuery()

  const scrollToNewThreshold = 50

  const initialLastView = context?.lastView
  const initialLastUpdate = context?.lastUpdate

  let shouldScrollToEnd = false

  let separatorDiv: HTMLDivElement | null | undefined = undefined

  let allMessages: Message[] = []
  let filteredMessages: Message[] = []
  const reactionNotifications: Notification[] = []
  const notifications: Notification[] = []
  let groups: MessagesGroup[] = []
  let window: Window<Message> | undefined = undefined
  let isLoading = true
  let messagesCount = 0

  let isScrollInitialized = false
  let isPageLoading = false
  let shouldScrollToNew = false
  let atBottom = false
  let restore: { scrollHeight: number } | undefined = undefined

  let bottomOffset: number = 0
  let topOffset: number = 0

  let prevDirection: ActivityDirection | undefined = undefined

  const limit = $deviceInfo.isMobile ? 20 : 20
  let queryDef = getBaseQuery()

  export function scrollDown (): void {
    shouldScrollToEnd = true
    shouldScrollToNew = true
    atBottom = true
    scrollToBottom('scrollDown', true)
    readAllReactions()
  }

  // $: if (
  //   (context?.lastView?.getTime() ?? 0) >= (context?.lastUpdate?.getTime() ?? 0) &&
  //   (notifications?.length ?? 0) > 0 &&
  //   atBottom &&
  //   $isAppFocusedStore
  // ) {
  //   readNotifications(new Date())
  // }

  $: translation = $translationStore

  $: reinit(direction)
  $: filteredMessages = aggregateMessages(filterMessages(allMessages, filters), queryDef.order)
  $: groups = groupMessagesByDay(filteredMessages)

  $: query.query(
    queryDef,
    (res: Window<Message>) => {
      if (shouldRestoreScrollTop) {
        restore = {
          scrollHeight: scrollDiv.scrollHeight
        }
        shouldRestoreScrollTop = false
      }
      window = res
      allMessages = res.getResult()
      filteredMessages = aggregateMessages(filterMessages(allMessages, filters), queryDef.order)

      groups = groupMessagesByDay(filteredMessages)

      if (filters.length > 0 && filteredMessages.length < limit) {
        if (window.hasNextPage()) {
          void window.loadNextPage()
        } else if (window.hasPrevPage()) {
          void window.loadPrevPage()
        }
      }
      isLoading = false
      isAllLoaded = !window?.hasNextPage() && !window?.hasPrevPage()

      void onMessagesReceive(filteredMessages)
    },
    {
      autoExpand: true,
      threads: true,
      attachments: true,
      reactions: true,
      language: translation?.enabled === true ? translation?.translateTo : undefined
    }
  )

  // $: if (context !== undefined) {
  //   void notificationsQuery.query(
  //     {
  //       contextId: context.id,
  //       read: false
  //     },
  //     (res) => {
  //       const result = res.getResult()
  //       reactionNotifications = result.filter((notification) => notification.type === NotificationType.Reaction)
  //       notifications = result.filter((notification) => notification.type !== NotificationType.Reaction)
  //       if (reactionNotifications.length > 0) {
  //         readViewport($isAppFocusedStore)
  //       }
  //     }
  //   )
  // } else {
  //   notificationsQuery.unsubscribe()
  // }

  let ro: ResizeObserver | undefined = undefined
  const prev: number = -1

  function lastGroupObserver (node: HTMLDivElement): { destroy: () => void } {
    ro =
      ro ??
      new ResizeObserver(() => {
        // if (!isScrollInitialized) return
        // const diff = node.clientHeight - prev
        // prev = node.clientHeight
        // if (diff < 0 || window?.hasNextPage()) return
        //
        // if (atBottom || bottomOffset - diff < 30) {
        //   dispatch('action', { id: 'hideScrollBar' })
        //   if (!$isAppFocusedStore) {
        //     scrollToStartOfNew()
        //   } else {
        //     // scrollToBottom('lastGroupObserver', true)
        //   }
        // }
      })
    ro.observe(node)

    return {
      destroy () {
        ro?.unobserve(node)
      }
    }
  }

  function reinit (direction: ActivityDirection, force = false): void {
    if (prevDirection === direction && !force) return
    prevDirection = direction

    window = undefined
    isPageLoading = false
    restore = undefined
    filteredMessages = []
    groups = []
    isLoading = true
    isScrollInitialized = false
    shouldScrollToNew = false
    queryDef = getBaseQuery()
  }

  function getBaseQuery (): MessageQueryParams {
    if (direction === ActivityDirection.Forward) {
      return {
        docClass: doc._class,
        docId: doc._id,
        order: SortingOrder.Ascending,
        limit
      }
    }
    return {
      docClass: doc._class,
      docId: doc._id,
      order: SortingOrder.Descending,
      limit
    }
  }

  function getBottomOffset (): number {
    return Math.max(0, Math.floor(scrollDiv.scrollHeight - scrollDiv.scrollTop - scrollDiv.clientHeight))
  }

  function getTopOffset (): number {
    return Math.floor(scrollDiv.scrollTop - contentDiv.offsetTop)
  }

  function updateShouldScrollToNew (): void {
    if (window === undefined || window.hasNextPage()) {
      shouldScrollToNew = false
      atBottom = false
      return
    }

    shouldScrollToNew = bottomOffset <= scrollToNewThreshold
    atBottom = bottomOffset < 10
  }

  function shouldLoadNextPage (): boolean {
    return bottomOffset <= 200
  }

  function loadMore (scrollDirection: 'up' | 'down'): void {
    if (window === undefined || !isScrollInitialized) return

    if (shouldLoadNextPage() && scrollDirection === 'down') {
      if (direction === ActivityDirection.Forward && window.hasNextPage()) {
        void loadNextPage()
      } else if (direction === ActivityDirection.Backward && window.hasPrevPage()) {
        void loadPrevPage()
      }
    }
  }

  let shouldRestoreScrollTop = false

  async function loadPrevPage (): Promise<void> {
    if (window === undefined || isPageLoading || scrollDiv == null) return

    try {
      isPageLoading = true
      shouldScrollToNew = false
      atBottom = false
      shouldRestoreScrollTop = true
      await window.loadPrevPage()
    } finally {
      isPageLoading = false
    }
  }

  async function loadNextPage (): Promise<void> {
    if (window === undefined || isPageLoading) return
    if ((restore?.scrollHeight ?? 0) !== 0) return

    try {
      isPageLoading = true
      shouldScrollToNew = false
      atBottom = false
      await window.loadNextPage()
    } finally {
      isPageLoading = false
    }
  }

  function scrollToBottom (reason: string, forced = false): void {
    if (!$isAppFocusedStore && !forced) return
    console.log('scroll.bottom', reason)
    scrollDiv.scroll({ top: scrollDiv.scrollHeight, behavior: 'instant' })
  }

  function restoreScroll (): void {
    if (restore == null) return
    if (direction === ActivityDirection.Backward) {
      restore = undefined
      return
    }
    const newScrollHeight = scrollDiv.scrollHeight
    scrollDiv.scrollTop = newScrollHeight - restore.scrollHeight + scrollDiv.scrollTop
    restore = undefined
  }

  let rafId: any | null = null
  let lastScrollTop: number = 0

  function handleScroll (): void {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      const top = scrollDiv.scrollTop
      const direction = top > lastScrollTop ? 'down' : 'up'

      lastScrollTop = top
      bottomOffset = getBottomOffset()
      topOffset = getTopOffset()
      updateShouldScrollToNew()
      loadMore(direction)
      void readAll()
      rafId = null
    })
  }

  $: updateSeparator($isAppFocusedStore, context)
  $: readViewport($isAppFocusedStore)

  function updateSeparator (isAppFocused: boolean, context: NotificationContext | undefined): void {
    if (isAppFocused || context == null || window == null) return
    const separatorIndex = filteredMessages.findIndex(
      ({ created, creator }) => !me.socialIds.includes(creator) && created.getTime() > context.lastView.getTime()
    )
    if (separatorIndex === -1) return
    separatorDate = filteredMessages[separatorIndex].created
  }

  function readAllReactions (): void {
    if (reactionNotifications.length === 0) return
    for (const notification of reactionNotifications) {
      void communicationClient.updateNotifications(
        notification.contextId,
        {
          id: notification.id
        },
        true
      )
    }
  }
  function readViewport (isAppFocused: boolean): void {
    if (!isAppFocused || context == null || window == null) return

    const containerRect = scrollDiv.getBoundingClientRect()
    const items = Array.from(contentDiv.getElementsByClassName('message')).reverse()

    const visible: Element[] = []

    for (const item of items) {
      const rect = item.getBoundingClientRect()

      const isVisible = rect.top < containerRect.bottom && rect.bottom > containerRect.top

      if (isVisible) {
        visible.push(item)
      }

      if (!isVisible && visible.length > 0) {
        break
      }
    }
    if (visible.length === 0) return

    const message = filteredMessages.find((it) => it.id === visible[0].id)
    if (message == null) return

    readNotifications(message.created)

    for (const item of visible) {
      const reaction = reactionNotifications.find((it) => it.messageId === item.id)
      if (reaction != null) {
        void communicationClient.updateNotifications(
          reaction.contextId,
          {
            id: reaction.id
          },
          true
        )
      }
    }
  }

  function scrollToStartOfNew (): void {
    if (!shouldScrollToNew) return
    updateSeparator($isAppFocusedStore, context)
    if (separatorDate == null) {
      scrollToBottom('scrollToStartOfNew 1', true)
      return
    }

    const firstNewMessageIndex = filteredMessages.findIndex(
      ({ created, creator }) =>
        separatorDate && !me.socialIds.includes(creator) && created.getTime() === separatorDate.getTime()
    )

    if (firstNewMessageIndex === -1) return
    const msg = filteredMessages[firstNewMessageIndex]
    if (msg == null) return

    const messagesElement = contentDiv.querySelector(`[id="${msg.id}"]`)
    if (messagesElement == null) return
    const topOffset = messagesElement.getBoundingClientRect().top - 100
    const bottomOffset = getBottomOffset()
    if (topOffset < 0) return

    if (bottomOffset < topOffset) {
      scrollToBottom('scrollToStartOfNew 2', true)
    } else {
      scrollDiv.scrollBy({ top: topOffset, behavior: 'instant' })
    }
  }

  async function readAll (): Promise<void> {
    if (window == null || context == null || !isScrollInitialized || window.hasNextPage() || !$isAppFocusedStore) return

    if ((newLastView ?? context.lastView).getTime() >= context.lastUpdate.getTime()) {
      return
    }
    if (bottomOffset < 10) {
      readNotifications(new Date())
    }
  }

  async function onMessagesReceive (res: Message[]): Promise<void> {
    if (messagesCount === res.length) return
    const prevCount = messagesCount
    messagesCount = res.length

    if (prevCount > messagesCount) return
    await tick()

    restoreScroll()

    if (!$isAppFocusedStore) {
      scrollToStartOfNew()
    } else if (shouldScrollToNew && prevCount > 0 && isScrollInitialized && direction === ActivityDirection.Forward) {
      scrollToBottom('onNewMessageReceived')
    }
  }

  let newLastView: Date | undefined = context?.lastView
  let separatorDate: Date | undefined = undefined
  let readNotificationsTimer: any | undefined = undefined
  let unsubscribeObserver: (() => void) | undefined = undefined

  function readNotifications (date: Date): void {
    if (readNotificationsTimer != null) {
      clearTimeout(readNotificationsTimer)
      readNotificationsTimer = undefined
    }
    readNotificationsTimer = setTimeout(() => {
      if (context == null || context.lastView >= date) return
      void communicationClient.updateNotificationContext(context.id, date)
    }, 500)
  }

  $: initMessageObserver(contentDiv, isScrollInitialized, context)

  function initMessageObserver (
    contentDiv: HTMLDivElement,
    isScrollInitialized: boolean,
    context: NotificationContext | undefined
  ): void {
    if (!isScrollInitialized || context == null) return
    if (unsubscribeObserver != null) return

    unsubscribeObserver = createMessagesObserver(contentDiv, (messageDiv) => {
      if (!$isAppFocusedStore) return
      const id = messageDiv.id
      const message = filteredMessages.find((it) => it.id === id)
      if (message === undefined) return
      const shouldRead = newLastView == null || message.created > newLastView
      const reactionsToRead = reactionNotifications.filter((it) => it.messageId === message.id)

      if (shouldRead) {
        newLastView = message.created
        readNotifications(message.created)
      }

      if (reactionsToRead.length > 0) {
        for (const reaction of reactionsToRead) {
          void communicationClient.updateNotifications(
            reaction.contextId,
            {
              id: reaction.id
            },
            true
          )
        }
      }
    })
  }

  $: void initializeScroll(isLoading)

  $: if (isScrollInitialized) {
    dispatch('loaded')
  }
  async function initializeScroll (isLoading: boolean): Promise<void> {
    if (isLoading || isScrollInitialized) return
    const separatorIndex =
      initialLastView !== undefined
        ? filteredMessages.findIndex(
          ({ created, creator }) =>
            initialLastView != null && !me.socialIds.includes(creator) && created > initialLastView
        )
        : -1
    if (separatorIndex !== -1) {
      separatorDate = filteredMessages[separatorIndex].created
    }

    isScrollInitialized = true
    shouldScrollToNew = false
    updateShouldScrollToNew()
    bottomOffset = getBottomOffset()
    topOffset = getTopOffset()
    dispatch('loaded')
  }

  onDestroy(() => {
    if (unsubscribeObserver != null) {
      unsubscribeObserver()
    }

    scrollDiv.removeEventListener('scroll', handleScroll)
  })

  onMount(() => {
    scrollDiv.addEventListener('scroll', handleScroll, { passive: true })
  })

  export function editLastMessage (): void {
    if (window == null || window.hasNextPage()) return
    if (direction === ActivityDirection.Forward && !atBottom) return

    const me = getCurrentAccount()

    let lastMessage: Message | undefined = undefined
    if (direction === ActivityDirection.Forward) {
      for (let i = filteredMessages.length - 1; i >= 0; i--) {
        const message = filteredMessages[i]
        if (message.type === MessageType.Activity) continue
        if (!me.socialIds.includes(message.creator)) continue
        lastMessage = message
        break
      }
    } else if (direction === ActivityDirection.Backward) {
      for (let i = 0; i <= filteredMessages.length - 1; i++) {
        const message = filteredMessages[i]
        if (message.type === MessageType.Activity) continue
        if (!me.socialIds.includes(message.creator)) continue
        lastMessage = message
        break
      }
    }
    if (lastMessage == null) return

    messageEditingStore.set(lastMessage.id)
    const messagesElement = contentDiv.querySelector(`[id="${lastMessage.id}"]`)
    if (messagesElement == null) return

    const containerRect = scrollDiv.getBoundingClientRect()
    const rect = messagesElement.getBoundingClientRect()

    const isVisible = rect.top < containerRect.bottom && rect.bottom > containerRect.top

    if (!isVisible) {
      messagesElement.scrollIntoView({ behavior: 'instant', block: 'end' })
    }
  }
</script>

{#each groups as group, index (group.day.toString())}
  {@const withSeparator = separatorDate != null && getGroupDay(separatorDate) === group.day}
  {@const isLastGroup = index === groups.length - 1}
  {#if withSeparator}
    <MessagesGroupPresenter
      bind:separatorDiv
      {doc}
      date={group.day}
      messages={group.messages}
      {readonly}
      {separatorDate}
      showDateSeparator={false}
      dateFormat={DateFormat.Default}
      customObserver={isLastGroup ? lastGroupObserver : undefined}
    />
  {:else}
    <MessagesGroupPresenter
      {doc}
      date={group.day}
      messages={group.messages}
      showDateSeparator={false}
      dateFormat={DateFormat.Default}
      {readonly}
      customObserver={isLastGroup ? lastGroupObserver : undefined}
    />
  {/if}
{/each}
{#if window !== undefined && window.hasPrevPage() && direction === ActivityDirection.Forward}
  <MessagesLoading />
{/if}
{#if window !== undefined && window.hasNextPage() && direction === ActivityDirection.Backward}
  <MessagesLoading />
{/if}
