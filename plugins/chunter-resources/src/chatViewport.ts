//
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
//

import { createQuery, getClient } from '@hcengineering/presentation'
import {
  type Client,
  type Doc,
  getCurrentAccount,
  type Lookup,
  type Ref,
  SortingOrder,
  type Timestamp
} from '@hcengineering/core'
import { derived, get, type Readable, writable } from 'svelte/store'
import activity, { type ActivityMessage } from '@hcengineering/activity'
import attachment from '@hcengineering/attachment'
import { type ReadPosition, type ReadState } from '@hcengineering/notification'
import chunter from '@hcengineering/chunter'

export type LoadMode = 'forward' | 'backward'

/**
 * Interface defining the minimal API required for chat viewports.
 */
interface IChatViewport {
  readonly limit: number

  readonly isLoading: Readable<boolean>
  readonly isLoadingMore: Readable<boolean>
  readonly messages: Readable<ActivityMessage[]>
  readonly newTimestamp: Readable<Timestamp | undefined>

  canLoadMore: (mode: LoadMode, loadAfter: Timestamp) => boolean
  jumpToDate: (date: Timestamp) => Promise<Ref<ActivityMessage> | undefined>
}

class StaleVersionError extends Error {
  constructor () {
    super('Viewport version changed')
    this.name = 'StaleVersionError'
  }
}

/**
 * Viewport manager for chat channels and message threads.
 * Manages reactive messages tail and handles cursor-based backward/forward pagination.
 *
 * DESIGN FEATURES:
 * 1. 100% Metadata-Free: Does not load full channel metadata to calculate scroll position or dates,
 *    eliminating websocket and memory overhead in large chats.
 * 2. On-Demand Anchor Navigation: Lazily queries the database to position viewports around targets
 *    (e.g., specific message links or first unread markers).
 * 3. Space-Agnostic Resolution: Resolves messages and external cross-space references in a single query
 *    by omitting the space filter, removing the need for manual reference loading.
 */
export class ChatViewport implements IChatViewport {
  // Private State & Queries (Must be declared first as derived stores depend on them)
  private readonly loadedHistory = writable<ActivityMessage[]>([])
  private readonly liveTail = writable<ActivityMessage[]>([])
  private readonly tailQuery = createQuery(true)
  private tailStartTs: Timestamp | undefined = undefined

  /**
   * Tracks the active viewport session version.
   * Incremented on each viewport reset (e.g., during jumps or route changes).
   * Checked after all asynchronous boundaries to discard stale database query results
   * that resolve after the user has navigated away from the original location.
   */
  private viewportVersion = 0

  public readonly isTailLoaded = writable(false)
  public readonly isLoading = writable(true)
  public readonly isLoadingMore = writable(false)
  public readonly newTimestamp = writable<Timestamp | undefined>(undefined)

  public readonly hasMoreBackward = writable(true)
  public readonly hasMoreForward = writable(false)

  /**
   * Complete chronologically sorted list of currently loaded messages.
   */
  public readonly messages = derived([this.loadedHistory, this.liveTail], ([history, tail]) => {
    const seen = new Set<string>()
    const result: ActivityMessage[] = []

    for (const msg of history) {
      if (!seen.has(msg._id)) {
        seen.add(msg._id)
        result.push(msg)
      }
    }

    for (const msg of tail) {
      if (!seen.has(msg._id)) {
        seen.add(msg._id)
        result.push(msg)
      }
    }

    return result
  })

  /**
   * Derived flag helper for scrolling/pagination triggers.
   */
  public readonly canLoadNextForward = derived(this.messages, (messages) => {
    return this.canLoadMore('forward', messages[messages.length - 1]?.createdOn)
  })

  constructor (
    private readState: ReadState | undefined,
    public chatId: Ref<Doc>,
    public selectedMessageId: Ref<ActivityMessage> | undefined,
    public readonly limit = 50
  ) {
    void this.initializeViewport(undefined)
  }

  // ==========================================
  // Public API Methods
  // ==========================================

  /**
   * Checks if more messages can be loaded in a specific direction.
   */
  public canLoadMore (mode: LoadMode, timestamp?: Timestamp): boolean {
    if (timestamp === undefined) {
      return false
    }

    if (mode === 'forward') {
      const isTailLoading = get(this.isLoading) && !get(this.isTailLoaded)
      const tail = get(this.liveTail)
      const hasMoreNewer = get(this.hasMoreForward)
      return hasMoreNewer && !isTailLoading && tail.length === 0
    } else {
      return get(this.hasMoreBackward)
    }
  }

  /**
   * Synchronous load action for pagination triggers.
   */
  public async loadMore (mode: LoadMode, loadAfter?: Timestamp, limit?: number): Promise<void> {
    await this.loadMoreInternal(undefined, mode, loadAfter, limit)
  }

  /**
   * Jumps to a specific day in the message history, finding the closest available message.
   */
  public async jumpToDate (date: Timestamp): Promise<Ref<ActivityMessage> | undefined> {
    const version = this.viewportVersion
    const client = this.getVersionedClient(version)

    try {
      let res = await client.findAll(
        activity.class.ActivityMessage,
        {
          attachedTo: this.chatId,
          createdOn: { $gte: date }
        },
        {
          limit: 1,
          sort: { createdOn: SortingOrder.Ascending },
          projection: { _id: 1 }
        }
      )

      let msg = res[0]
      if (msg === undefined) {
        res = await client.findAll(
          activity.class.ActivityMessage,
          {
            attachedTo: this.chatId,
            createdOn: { $lt: date }
          },
          {
            limit: 1,
            sort: { createdOn: SortingOrder.Descending },
            projection: { _id: 1 }
          }
        )
        msg = res[0]
      }

      if (msg === undefined) {
        return undefined
      }

      this.resetViewport()
      await this.initializeViewport(msg._id)
      return msg._id
    } catch (err) {
      if (err instanceof StaleVersionError) return undefined
      console.error('Failed to jump to date:', err)
      return undefined
    }
  }

  /**
   * Focuses and loads chat viewport surrounding a specific message ID.
   */
  public async jumpToMessageId (messageId: Ref<ActivityMessage>): Promise<boolean> {
    const isAlreadyLoaded = get(this.messages).some(({ _id }) => _id === messageId)

    if (isAlreadyLoaded) {
      return false
    }

    this.resetViewport()
    await this.initializeViewport(messageId)

    return true
  }

  /**
   * Resets viewport and scrolls to the latest end of history.
   *
   * @param ignoreUnread - If true, bypasses unread messages and directly jumps to the latest tail.
   */
  public jumpToEnd (ignoreUnread = false): boolean {
    this.selectedMessageId = undefined
    this.resetViewport()
    void this.initializeViewport(this.selectedMessageId, ignoreUnread)

    return true
  }

  /**
   * Refreshes the unread markers.
   */
  public async syncUnreadMarker (readState?: ReadState): Promise<void> {
    if (readState === undefined) return
    this.readState = readState

    const version = this.viewportVersion
    const client = this.getVersionedClient(version)

    try {
      const me = getCurrentAccount()
      const readPosition: ReadPosition | undefined = readState[me.uuid]
      const lastView = readPosition?.timestamp ?? 0

      if (lastView === 0) {
        this.newTimestamp.set(undefined)
        return
      }

      const res = await client.findAll(
        activity.class.ActivityMessage,
        {
          attachedTo: this.chatId,
          createdOn: { $gt: lastView },
          createdBy: { $nin: me.socialIds }
        },
        {
          limit: 1,
          projection: { _id: 1, createdOn: 1, createdBy: 1 },
          sort: { createdOn: SortingOrder.Ascending }
        }
      )

      this.newTimestamp.set(res[0]?.createdOn)
    } catch (err) {
      if (err instanceof StaleVersionError) return
      console.error('Failed to sync unread marker:', err)
    }
  }

  /**
   * Unsubscribes active queries and resets internal stores.
   */
  public destroy (): void {
    this.resetViewport()
    this.tailQuery.unsubscribe()
  }

  // ==========================================
  // Private Helper Methods
  // ==========================================

  /**
   * Performs the initial load. Decides whether to target a specific selected message,
   * the first unread message, or simply fetch the latest tail of history.
   */
  private async initializeViewport (selectedMessageId?: Ref<ActivityMessage>, ignoreUnread = false): Promise<void> {
    this.isLoading.set(true)
    const version = this.viewportVersion
    const client = this.getVersionedClient(version)

    try {
      const targetAnchor = await this.resolveAnchor(client, selectedMessageId, ignoreUnread)

      // Always query the latest tail of history first to optimize loading
      const latestRes = await client.findAll(
        activity.class.ActivityMessage,
        {
          attachedTo: this.chatId
        },
        {
          limit: this.limit + 1,
          sort: { createdOn: SortingOrder.Descending },
          lookup: this.getLookup()
        }
      )

      if (targetAnchor === undefined) {
        this.applyLatestTail(latestRes)
      } else {
        const hasMoreOlder = latestRes.length > this.limit
        const messages = hasMoreOlder ? latestRes.slice(0, this.limit) : latestRes
        const oldestMsg = messages[messages.length - 1]

        if (
          oldestMsg === undefined ||
          targetAnchor.createdOn === undefined ||
          oldestMsg.createdOn === undefined ||
          targetAnchor.createdOn >= oldestMsg.createdOn
        ) {
          this.applyLatestTail(latestRes)
        } else {
          await this.loadAnchoredStart(client, targetAnchor)
        }
      }
    } catch (err) {
      if (err instanceof StaleVersionError) {
        return
      }
      console.error('Failed to initialize viewport:', err)
    } finally {
      if (version === this.viewportVersion) {
        this.isLoading.set(false)
      }
    }
  }

  private async resolveAnchor (
    client: ReturnType<typeof this.getVersionedClient>,
    _selectedMessageId?: Ref<ActivityMessage>,
    ignoreUnread = false
  ): Promise<ActivityMessage | undefined> {
    // 1. Resolve selected message as a prioritized anchor
    const selectedMessageId = _selectedMessageId ?? this.selectedMessageId
    let selectedMessage: ActivityMessage | undefined
    if (selectedMessageId !== undefined) {
      selectedMessage = await client.findOne(
        activity.class.ActivityMessage,
        { _id: selectedMessageId },
        { projection: { _id: 1, createdOn: 1 } }
      )
      if (selectedMessage !== undefined) return selectedMessage
    }

    // 2. Resolve first unread message as a prospective anchor
    const me = getCurrentAccount()
    const readPosition: ReadPosition | undefined = this.readState?.[me.uuid]
    const lastViewTs = readPosition?.timestamp ?? 0
    const latestMessageTs = this.readState?.latestMessageTimestamp ?? 0

    // Only query if user has unread messages
    const hasUnread = latestMessageTs === 0 || latestMessageTs > lastViewTs

    let firstUnreadMessage: ActivityMessage | undefined
    if (!ignoreUnread && hasUnread) {
      firstUnreadMessage = await client.findOne(
        activity.class.ActivityMessage,
        {
          attachedTo: this.chatId,
          createdOn: { $gt: lastViewTs },
          createdBy: { $nin: me.socialIds }
        },
        {
          sort: { createdOn: SortingOrder.Ascending },
          projection: { _id: 1, createdOn: 1 }
        }
      )
    }

    if (firstUnreadMessage !== undefined) {
      this.newTimestamp.set(firstUnreadMessage.createdOn)
    } else if (ignoreUnread) {
      this.newTimestamp.set(undefined)
    }

    return firstUnreadMessage
  }

  private applyLatestTail (latestRes: ActivityMessage[]): void {
    const hasMoreOlder = latestRes.length > this.limit
    const messages = hasMoreOlder ? latestRes.slice(0, this.limit) : latestRes

    this.loadedHistory.set([...messages].reverse())
    this.hasMoreBackward.set(hasMoreOlder)
    this.hasMoreForward.set(false)

    const newestMsg = messages[0]
    if (newestMsg !== undefined) {
      this.subscribeToLiveTail(newestMsg.createdOn, [newestMsg._id])
    } else {
      this.subscribeToLiveTail(undefined)
    }
  }

  private async loadAnchoredStart (
    client: ReturnType<typeof this.getVersionedClient>,
    targetAnchor: ActivityMessage
  ): Promise<void> {
    const midLimit = Math.floor(this.limit / 2)
    // Mid-history positioning: load split-window chunk centered around the anchor
    const beforeRes: Array<Pick<ActivityMessage, '_id' | 'createdOn'>> = await client.findAll(
      activity.class.ActivityMessage,
      {
        attachedTo: this.chatId,
        createdOn: { $lt: targetAnchor.createdOn }
      },
      {
        limit: midLimit + 1,
        projection: { _id: 1, createdOn: 1 },
        sort: { createdOn: SortingOrder.Descending }
      }
    )

    const hasMoreOlder = beforeRes.length > midLimit
    const backwardMessages = hasMoreOlder ? beforeRes.slice(0, midLimit) : beforeRes
    const oldestBefore = backwardMessages[backwardMessages.length - 1]
    const chunkStart = oldestBefore?.createdOn ?? targetAnchor.createdOn

    this.hasMoreBackward.set(hasMoreOlder)
    this.hasMoreForward.set(true)

    await this.loadMoreInternal(client, 'forward', chunkStart, this.limit)
  }

  /**
   * Sets up a LiveQuery subscription to listen to real-time chat messages arriving in the channel.
   */
  private subscribeToLiveTail (start?: Timestamp, skipIds?: Array<Ref<ActivityMessage>>): void {
    if (this.tailStartTs === undefined) this.tailStartTs = start

    const version = this.viewportVersion

    this.tailQuery.query(
      activity.class.ActivityMessage,
      {
        attachedTo: this.chatId,
        ...(this.tailStartTs !== undefined ? { createdOn: { $gte: this.tailStartTs } } : {})
      },
      async (res) => {
        if (version !== this.viewportVersion) return
        const filtered = skipIds !== undefined ? res.filter(({ _id }) => !skipIds.includes(_id)) : res
         this.liveTail.set(filtered.reverse())
        this.isTailLoaded.set(true)
      },
      {
        sort: { createdOn: SortingOrder.Descending },
        lookup: this.getLookup()
      }
    )
  }

  private async loadMoreInternal (
    externalClient: ReturnType<typeof this.getVersionedClient> | undefined,
    mode: LoadMode,
    loadAfterTs?: Timestamp,
    limit?: number
  ): Promise<void> {
    if (get(this.isLoadingMore) || loadAfterTs === undefined) return

    this.isLoadingMore.set(true)
    const version = this.viewportVersion
    const client = externalClient ?? this.getVersionedClient(version)

    try {
      const isBackward = mode === 'backward'
      const history = get(this.loadedHistory)

      if (!isBackward) {
        const hasMoreNewer = get(this.hasMoreForward)
        if (!hasMoreNewer) {
          const skipIds = history.filter(({ createdOn }) => createdOn === loadAfterTs).map(({ _id }) => _id)
          this.subscribeToLiveTail(loadAfterTs, skipIds)
          return
        }
      }

      const messages = await this.queryHistoryChunk(client, isBackward, loadAfterTs, limit)

      if (messages.length > 0) {
        this.loadedHistory.set(isBackward ? [...messages, ...history] : [...history, ...messages])
      }
    } catch (err) {
      if (err instanceof StaleVersionError) {
        return
      }
      console.error(`Failed to load more messages (${mode}):`, err)
    } finally {
      if (version === this.viewportVersion) {
        this.isLoadingMore.set(false)
      }
    }
  }

  /**
   * Fetches historical chat pages via cursor parameters.
   */
  private async queryHistoryChunk (
    client: ReturnType<typeof this.getVersionedClient>,
    isBackward: boolean,
    loadAfter: Timestamp,
    limit?: number,
    equal = true
  ): Promise<ActivityMessage[]> {
    const skipIds = this.getBoundaryOverlapIds(loadAfter)
    const actualLimit = limit ?? this.limit

    let messages: ActivityMessage[] = await client.findAll(
      activity.class.ActivityMessage,
      {
        attachedTo: this.chatId,
        createdOn: equal
          ? isBackward
            ? { $lte: loadAfter }
            : { $gte: loadAfter }
          : isBackward
            ? { $lt: loadAfter }
            : { $gt: loadAfter }
      },
      {
        limit: actualLimit + 1,
        sort: { createdOn: isBackward ? SortingOrder.Descending : SortingOrder.Ascending },
        lookup: this.getLookup()
      }
    )

    const hasMore = messages.length > actualLimit

    // Deduplicate against overlap boundaries
    messages = messages.filter(({ _id }) => !skipIds.includes(_id))

    if (messages.length === 0) {
      if (hasMore && equal) {
        return await this.queryHistoryChunk(client, isBackward, loadAfter, limit, false)
      }
      if (isBackward) {
        this.hasMoreBackward.set(false)
      } else {
        this.hasMoreForward.set(false)
      }
      return []
    }

    if (messages.length > actualLimit) {
      messages = messages.slice(0, actualLimit)
    }

    if (isBackward) {
      this.hasMoreBackward.set(hasMore)
    } else {
      this.hasMoreForward.set(hasMore)
    }

    return isBackward ? messages.reverse() : messages
  }

  private getBoundaryOverlapIds (after: Timestamp, loadTail = false): Array<Ref<ActivityMessage>> {
    const history = get(this.loadedHistory)
    const tail = get(this.liveTail)
    const loaded = [...history, ...(loadTail ? [] : tail)]

    return loaded.filter(({ createdOn }) => createdOn === after).map(({ _id }) => _id)
  }

  private getLookup (): Lookup<ActivityMessage> {
    return {
      _id: {
        attachments: attachment.class.Attachment,
        reactions: activity.class.Reaction
      },
      forwardedMessage: chunter.class.ChatMessage
    }
  }

  private resetViewport (): void {
    this.viewportVersion++
    this.liveTail.set([])
    this.loadedHistory.set([])
    this.tailQuery.unsubscribe()
    this.tailStartTs = undefined
    this.isTailLoaded.set(false)
  }

  private getVersionedClient (version: number): Pick<Client, 'findOne' | 'findAll'> {
    const client = getClient()
    return {
      findOne: async (...args) => {
        const res = await client.findOne(...args)
        if (version !== this.viewportVersion) throw new StaleVersionError()
        return res
      },
      findAll: async (...args) => {
        const res = await client.findAll(...args)
        if (version !== this.viewportVersion) throw new StaleVersionError()
        return res
      }
    }
  }
}
