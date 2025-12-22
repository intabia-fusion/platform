<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { ActivityUpdateType, Message } from '@hcengineering/communication-types'
  import { Doc, getCurrentAccount, isOtherHour, Timestamp } from '@hcengineering/core'

  import aggregateMessages, { isActivityMessage } from '../../activity'
  import DateSeparator from '../DateSeparator.svelte'
  import MessagePresenter from './MessagePresenter.svelte'
  import MessagesSeparator from './MessagesSeparator.svelte'
  import { ActivityDirection, DateFormat } from '../../types'

  export let doc: Doc
  export let date: Timestamp
  export let messages: Message[]
  export let separatorDate: Date | undefined = undefined
  export let separatorDiv: HTMLDivElement | undefined | null = undefined
  export let readonly = false
  export let showDateSeparator: boolean = true
  export let dateFormat: DateFormat | undefined = undefined
  export let customObserver: (node: HTMLDivElement) => { destroy: () => void } = () => {
    return { destroy: () => {} }
  }

  const me = getCurrentAccount()

  $: separatorIndex =
    separatorDate != null
      ? messages.findIndex(
        ({ created, creator }) => separatorDate != null && !me.socialIds.includes(creator) && created >= separatorDate
      )
      : -1

  function isCompactView (prev: Message | undefined, current: Message): boolean {
    if (prev == null) return false
    if (prev.creator !== current.creator) return false
    if (prev.type !== current.type) return false
    if (isOtherHour(prev.created.getTime(), current.created.getTime())) return false
    return true
  }
</script>

<div class="messages-group" id={date.toString()} use:customObserver>
  {#if separatorIndex === 0}
    <MessagesSeparator bind:element={separatorDiv} />
  {/if}
  {#if showDateSeparator}
    <DateSeparator {date} />
  {/if}
  <div class="messages-group__messages">
    {#each messages as message, index (message.id)}
      {@const previousMessage = messages[index - 1]}
      {@const compact = isCompactView(previousMessage, message)}
      {#if separatorIndex !== 0 && index === separatorIndex}
        <MessagesSeparator bind:element={separatorDiv} />
      {/if}
      <MessagePresenter {message} {doc} {readonly} {compact} {dateFormat} />
    {/each}
  </div>
</div>

<style lang="scss">
  .messages-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
  }

  .messages-group__messages {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex: 1 0 0;
    width: 100%;
  }
</style>
