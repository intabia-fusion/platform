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
  import { Checkbox, Radio, Spinner } from '@hcengineering/ui/kit'
  import { generateId, getCurrentAccount } from '@hcengineering/core'
  import type { Poll, PollAnswer, PollOption, OptionID } from '@hcengineering/activity'
  import { createEventDispatcher } from 'svelte'

  import { getOptionPercent } from '../../poll'

  export let option: PollOption
  export let instance: Poll
  export let isVoting: boolean = false
  // This option is in the vote being sent.
  export let sending: boolean = false
  export let privateAnswers: PollAnswer[] = []
  export let answers: OptionID[] = []
  export let isVoted: boolean = false
  export let canVote: boolean = true
  export let ended: boolean = false
  export let selected: boolean = false

  const me = getCurrentAccount()
  const dispatch = createEventDispatcher()
  // Per instance: the same poll may be on screen twice, as a message and as its forwarded copy.
  const checkboxId = `poll-option-${generateId()}`

  $: percentage = getOptionPercent(instance, option.id)
  $: votes = instance.votes?.[option.id] ?? 0
  $: isVotedByMe = isOptionVotedByMe(option.id, instance, privateAnswers)
  $: voteKind = getVoteKind(option.id, answers)
  $: isMultiple = instance.mode === 'multiple'

  function isOptionVotedByMe (optionId: OptionID, poll: Poll, answersList: PollAnswer[]): boolean {
    if (poll.anonymous === true) {
      return answersList.some((it) => it.options.includes(optionId))
    }
    return poll.userVotes?.find((it) => it.account === me.uuid)?.options.includes(optionId) ?? false
  }

  function getVoteKind (optionId: OptionID, answers: OptionID[]): 'primary' | 'positive' | 'negative' {
    if (answers.length === 0) return 'primary'
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
      <span class="poll-option__votes">{votes}</span>
    </div>
    <div class="poll-option__result">
      <span class="option_checkbox">
        {#if isVotedByMe}
          <Checkbox
            decorative
            checked
            indeterminate={voteKind === 'negative'}
            kind={voteKind}
            size="medium"
            shape="round"
          />
        {/if}
      </span>

      <div class="progress-track {voteKind}">
        {#if percentage > 0}
          <div class="progress-bar" style="width: {percentage}%" />
        {:else}
          <div class="progress-bar zero" />
        {/if}
      </div>
    </div>
  </div>
{:else}
  <div class="poll-option">
    <div class="poll-option__answer">
      <span class="option_checkbox">
        <!-- Only on the chosen options, so the other controls keep the keyboard focus. -->
        {#if isVoting && sending}
          <Spinner size="small" inheritColor />
        {:else if isMultiple}
          <Checkbox
            id={checkboxId}
            checked={selected}
            size="medium"
            disabled={!canVote || isVoting}
            aria-label={option.label}
            on:change={() => {
              dispatch('toggle')
            }}
          />
        {:else}
          <Radio
            id={checkboxId}
            value={option.id}
            group={selected ? option.id : null}
            size="medium"
            disabled={!canVote || isVoting}
            aria-label={option.label}
            on:change={() => {
              dispatch('toggle')
            }}
          />
        {/if}
      </span>
      <!-- The click stays off the message, as the checkbox's does. -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <label class="option_label" class:enabled={canVote && !isVoting} for={checkboxId} on:click|stopPropagation>
        {option.label}
      </label>
    </div>
  </div>
{/if}

<style lang="scss">
  // Both states take one height, so the poll does not jump in the chat when the own vote arrives.
  .poll-option {
    --_line: 1rem;
    --_bar-line: 1.5rem;
    --_votes: 1.5rem;

    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
    min-width: 0;
    line-height: var(--_line);

    &__answer {
      display: flex;
      align-items: center;
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

    &__votes {
      flex-shrink: 0;
      min-width: var(--_votes);
      text-align: right;
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      color: var(--global-secondary-TextColor);
      white-space: nowrap;
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
      height: var(--_bar-line);
      min-width: 0;
    }
  }

  // The full scale in a light tone of the bar, so a share reads against the whole.
  .progress-track {
    --_bar: var(--kit-button-primary-BackgroundColor);

    flex: 1;
    min-width: 0;
    height: 0.5rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--_bar) 12%, transparent);

    &.positive {
      --_bar: var(--bg-positive-default);
    }

    &.negative {
      --_bar: var(--bg-negative-default);
    }
  }

  .progress-bar {
    background: var(--_bar);
    width: 0;
    height: 100%;
    border-radius: 1rem;
    transition: width 0.4s ease;

    &.zero {
      width: 0.5rem;
    }
  }

  .option_checkbox {
    // The vote spinner takes the color of the checked control it replaces.
    color: var(--kit-button-primary-BackgroundColor);
    display: flex;
    justify-content: flex-end;
    align-items: center;
    min-width: 2rem;
    width: 2rem;
    height: 1.5rem;
    flex-shrink: 0;
  }

  // Before the vote the control lines up with the question, not with the percent column.
  .poll-option__answer .option_checkbox {
    justify-content: center;
    width: var(--spacing-2);
    min-width: 0;
    height: var(--spacing-2);
  }

  // Padded to the width of the label with results, so a long one wraps the same after the vote.
  .option_label {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    padding: calc((var(--_bar-line) + 0.25rem) / 2) calc(2.25rem + 0.5rem + var(--_votes) - var(--spacing-2)) calc((var(--_bar-line) + 0.25rem) / 2) 0;
    font-size: 0.75rem;
    word-break: break-word;
    overflow-wrap: anywhere;
    min-width: 0;
    flex: 1;

    &.enabled {
      cursor: pointer;
    }
  }
</style>
