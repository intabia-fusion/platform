<!--
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
  import { CheckBox, Loading } from '@hcengineering/ui'
  import { getCurrentAccount } from '@hcengineering/core'
  import type { Poll, PollAnswer, PollOption, OptionID } from '@hcengineering/activity'
  import { createEventDispatcher } from 'svelte'

  export let option: PollOption
  export let instance: Poll
  export let isVoting: boolean = false
  export let privateAnswers: PollAnswer[] = []
  export let answers: OptionID[] = []
  export let anonymous: boolean = false
  export let isVoted: boolean = false
  export let started: boolean = true
  export let ended: boolean = false
  export let selected: boolean = false

  const me = getCurrentAccount()
  const dispatch = createEventDispatcher()

  $: percentage = getOptionPercentage(option.id, instance)
  $: isVotedByMe = isOptionVotedByMe(option.id, instance, privateAnswers)
  $: voteKind = getVoteKind(option.id, answers)

  function getOptionPercentage (optionId: OptionID, poll: Poll): number {
    const votes: number = poll.votes?.[optionId] ?? 0
    if (votes === 0) return 0
    const total = poll.totalVotes ?? 0
    return Math.round((votes / total) * 100)
  }

  function isOptionVotedByMe (optionId: OptionID, poll: Poll, answersList: PollAnswer[] = []): boolean {
    if (anonymous) {
      return answersList.some((it: PollAnswer) => it.options.includes(optionId))
    }
    const myVote = poll.userVotes?.find((it) => it.account === me.uuid)
    if (myVote == null) return false
    return myVote.options.some((it) => it.id === optionId)
  }

  function getVoteKind (optionId: OptionID, answers: OptionID[]): 'todo' | 'positive' | 'negative' {
    if (answers.length === 0) return 'todo'
    if (answers.includes(optionId)) return 'positive'
    return 'negative'
  }
</script>

{#if isVoted || ended}
  <div class="poll-option">
    <div class="poll-option__info">
      <span class="poll-option__percentage">
        {percentage}%
      </span>
      <span class="poll-option__label">
        {option.label}
      </span>
    </div>
    <div class="poll-option__result">
      <span class="option_checkbox">
        {#if isVotedByMe}
          <CheckBox
            checked={true}
            kind={voteKind}
            size="small"
            disabled
            circle
            symbol={voteKind === 'negative' ? 'minus' : 'check'}
          />
        {/if}
      </span>

      {#if percentage > 0}
        <div class="progress-bar {voteKind}" style="width: {percentage}%" />
      {:else}
        <div class="progress-bar zero {voteKind}" />
      {/if}
    </div>
  </div>
{:else}
  <div class="poll-option">
    <div class="poll-option__answer">
      <span class="option_checkbox">
        {#if !isVoting}
          <CheckBox
            checked={selected}
            kind="todo"
            size="small"
            disabled={!started || ended}
            on:value={() => {
              dispatch('toggle')
            }}
          />
        {:else}
          <Loading size="small" />
        {/if}
      </span>
      <span class="option_label">
        {option.label}
      </span>
    </div>
  </div>
{/if}

<style lang="scss">
  .poll-option {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
    min-width: 0;

    &__answer {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      min-width: 0;
    }

    &__percentage {
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;

      min-width: 2.25rem;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--global-primary-TextColor);
      flex-shrink: 0;
      white-space: nowrap;
      word-break: normal;
    }

    &__label {
      font-size: 0.75rem;
      word-break: break-word;
      overflow-wrap: anywhere;
      min-width: 0;
      flex: 1;
    }

    &__info {
      display: flex;
      gap: 0.5rem;
      min-width: 0;
    }

    &__result {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      height: 1.5rem;
      min-height: 1.5rem;
      min-width: 0;
    }
  }

  .progress-bar {
    background: var(--global-accent-IconColor);
    width: 0;
    border-radius: 1rem;
    height: 0.5rem;
    transition: width 0.4s ease;

    &.positive {
      background: var(--bg-positive-default);
    }

    &.negative {
      background: var(--bg-negative-default);
    }

    &.zero {
      width: 0.5rem;
    }
  }

  .option_checkbox {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    min-width: 2rem;
    width: 2rem;
    height: 1.5rem;
    flex-shrink: 0;
  }

  .option_label {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    height: 100%;
    min-height: 1.5rem;
    font-size: 0.75rem;
    word-break: break-word;
    overflow-wrap: anywhere;
    min-width: 0;
    flex: 1;
  }
</style>
