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
  import activity, { ActivityMessage } from '@hcengineering/activity'
  import { ActivityMessagePresenter } from '@hcengineering/activity-resources'
  import attachment from '@hcengineering/attachment'
  import core, { getCurrentAccount, Ref, SortingOrder, Tx, TxCreateDoc } from '@hcengineering/core'
  import { addTxListener, createQuery, getClient, removeTxListener } from '@hcengineering/presentation'
  import { onDestroy } from 'svelte'
  import { Lazy, Loading, Scroller } from '@hcengineering/ui'

  import { openMessageFromSpecial } from '../../navigation'
  import chunter from '../../plugin'
  import BlankView from '../BlankView.svelte'
  import Header from '../Header.svelte'
  import LoadingHistory from '../LoadingHistory.svelte'

  const client = getClient()
  const h = client.getHierarchy()

  let threads: ActivityMessage[] = []
  let isLoading = true

  let divScroll: HTMLElement | undefined | null = undefined

  let limit = 100
  let hasNextPage = true

  const messageClasses = h.getDescendants(activity.class.ActivityMessage)
  const me = getCurrentAccount().uuid

  const pageQuery = createQuery()
  const query = createQuery()
  let pageIds: Ref<ActivityMessage>[] | undefined

  $: loadPage(limit)

  function loadPage (limit: number): void {
    pageQuery.query(
      core.class.Collaborator,
      {
        collaborator: me,
        attachedToClass: { $in: messageClasses },
        '$lookup.attachedTo.replies': { $gte: 1 }
      },
      (res) => {
        hasNextPage = res.length > limit
        pageIds = res.slice(0, limit).map((it) => it.attachedTo as Ref<ActivityMessage>)
        liftedIds = liftedIds.filter((it) => pageIds?.includes(it) !== true)
      },
      {
        lookup: { attachedTo: activity.class.ActivityMessage },
        sort: { '$lookup.attachedTo.modifiedOn': SortingOrder.Descending },
        limit: limit + 1
      }
    )
  }

  // The page query watches the collaborator docs of the user, and a reply touches none of them: my
  // doc on my own message exists since the message was sent, when it had no replies and did not
  // match. So a reply to a message outside the page is checked here, and a thread of mine goes into
  // the list on its own. Asking for the page again would not help: the live query core answers an
  // identical query from its cache.
  let liftedIds: Ref<ActivityMessage>[] = []

  async function liftThread (parent: Ref<ActivityMessage>): Promise<void> {
    if (pageIds?.includes(parent) === true || liftedIds.includes(parent)) return
    const mine = await client.findOne(core.class.Collaborator, { collaborator: me, attachedTo: parent })
    if (mine === undefined || liftedIds.includes(parent)) return
    liftedIds = [...liftedIds, parent]
  }

  function handleTx (txes: Tx[]): void {
    for (const tx of txes) {
      if (tx._class !== core.class.TxCreateDoc) continue
      const createTx = tx as TxCreateDoc<ActivityMessage>
      if (!h.isDerived(createTx.objectClass, chunter.class.ThreadMessage)) continue
      void liftThread(createTx.attachedTo as Ref<ActivityMessage>)
    }
  }

  addTxListener(handleTx)

  onDestroy(() => {
    removeTxListener(handleTx)
  })

  // Sorted: a set of ids. The order comes from the messages themselves, and a thread moving up within
  // the page must not re-issue the query below.
  $: threadIds = pageIds === undefined ? undefined : [...new Set([...pageIds, ...liftedIds])].sort()

  $: loadThreads(threadIds)

  function loadThreads (pageIds: Ref<ActivityMessage>[] | undefined): void {
    if (pageIds === undefined) return
    if (pageIds.length === 0) {
      query.unsubscribe()
      threads = []
      isLoading = false
      return
    }

    query.query(
      activity.class.ActivityMessage,
      { _id: { $in: pageIds } },
      (res) => {
        threads = res
        isLoading = false
      },
      {
        lookup: {
          _id: {
            attachments: attachment.class.Attachment,
            reactions: activity.class.Reaction
          }
        },
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )
  }

  function handleScroll (): void {
    if (divScroll != null && hasNextPage && threads.length >= limit) {
      const isAtBottom = divScroll.scrollTop + divScroll.clientHeight >= divScroll.scrollHeight - 400
      if (isAtBottom) {
        limit += 100
      }
    }
  }
</script>

<Header icon={chunter.icon.Thread} intlLabel={chunter.string.Threads} titleKind={'breadcrumbs'} withSearch={false} />

<Scroller bind:divScroll padding="0.75rem 0.5rem" noStretch={threads.length > 0} onScroll={handleScroll}>
  {#if isLoading}
    <Loading />
  {:else if threads.length === 0}
    <BlankView icon={chunter.icon.Thread} header={chunter.string.NoThreadsYet} />
  {:else}
    {#each threads as thread}
      <div class="container">
        <Lazy>
          <ActivityMessagePresenter
            value={thread}
            onClick={() => openMessageFromSpecial(thread)}
            withShowMore={false}
          />
        </Lazy>
      </div>
    {/each}
    {#if hasNextPage}
      <LoadingHistory isLoading={threads.length < limit} />
    {/if}
  {/if}
</Scroller>

<style lang="scss">
  .container {
    display: flex;
    flex-direction: column;
    min-height: 3.75rem;
  }
</style>
