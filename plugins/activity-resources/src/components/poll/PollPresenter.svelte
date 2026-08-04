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
  import { onDestroy } from 'svelte'
  import { getCurrentAccount, notEmpty, type AccountUuid } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { getEventPositionElement, Label, Menu, showPopup, tooltip } from '@hcengineering/ui'
  import contact from '@hcengineering/contact'
  import { CombineAvatars, employeeRefByAccountUuidStore } from '@hcengineering/contact-resources'
  import { Applet, type Poll, type PollAnswer, type PollOption } from '@hcengineering/activity'

  import activity from '../../plugin'
  import { votePoll, retractPollVote } from '../../poll'
  import PollOptionPresenter from './PollOptionPresenter.svelte'
  import PollResults from './PollResults.svelte'

  export let instance: Poll
  export let applet: Applet

  const me = getCurrentAccount()
  const privateAnswersQuery = createQuery()

  let privateAnswers: PollAnswer[] = []
  let selectedOptions: PollOption[] = []
  let voted = false
  let isVoting = false
  let currentInstanceId: string | undefined = undefined

  $: question = instance?.question ?? ''
  $: options = instance?.options ?? []
  $: totalVotes = instance?.totalVotes ?? 0

  $: isAnonymous = instance?.anonymous === true
  $: isQuiz = instance?.quiz === true
  $: isMultiple = instance?.mode === 'multiple'

  $: revealedQuizAnswer = privateAnswers[0]?.quizAnswer ?? instance?.quizAnswer
  $: revealedQuizAnswers = revealedQuizAnswer != null ? [revealedQuizAnswer] : []

  $: selectedOptionIds = new Set(selectedOptions.map((it) => it.id))

  $: typeLabel =
    isAnonymous && isQuiz
      ? activity.string.AnonymousQuiz
      : isAnonymous
        ? activity.string.AnonymousVoting
        : isQuiz
          ? activity.string.Quiz
          : activity.string.Poll

  // Reset state if instance ID changes (e.g. component reuse in virtualized lists)
  $: if (instance?._id !== currentInstanceId) {
    currentInstanceId = instance?._id
    selectedOptions = []
    privateAnswers = []
  }

  $: if (isAnonymous || isQuiz) {
    privateAnswersQuery.query(activity.class.PollAnswer, { attachedTo: instance?._id }, (res) => {
      if (instance?._id === currentInstanceId) {
        privateAnswers = res
      }
    })
  } else {
    privateAnswersQuery.unsubscribe()
  }

  onDestroy(() => {
    privateAnswersQuery.unsubscribe()
  })

  $: checkVoted(instance, privateAnswers)
  $: votedEmployees = getVotedAccounts(instance)
    .map((acc) => $employeeRefByAccountUuidStore.get(acc))
    .filter(notEmpty)

  function checkVoted (poll: Poll | undefined, answers: PollAnswer[]): void {
    if (poll?.anonymous === true || poll?.quiz === true) {
      voted = answers.length > 0
    } else {
      voted = poll?.userVotes?.some((it) => it.account === me.uuid) ?? false
    }
  }

  function getVotedAccounts (poll: Poll | undefined): AccountUuid[] {
    if (poll?.anonymous === true) return []
    const set = new Set<AccountUuid>()
    for (const vote of poll?.userVotes ?? []) {
      set.add(vote.account)
    }
    return Array.from(set)
  }

  async function toggleOption (option: PollOption): Promise<void> {
    if (isVoting || voted) return
    if (!isMultiple) {
      await vote([option])
    } else {
      if (selectedOptionIds.has(option.id)) {
        selectedOptions = selectedOptions.filter((it) => it.id !== option.id)
      } else {
        selectedOptions = [...selectedOptions, option]
      }
    }
  }

  async function vote (opts?: PollOption[]): Promise<void> {
    if (isVoting || voted) return
    const optionsToVote = opts ?? selectedOptions
    if (optionsToVote.length === 0 || instance == null) return

    isVoting = true
    try {
      await votePoll(getClient(), instance, optionsToVote)
      selectedOptions = []
    } catch (e) {
      console.error(e)
    } finally {
      isVoting = false
    }
  }

  async function retractVote (): Promise<void> {
    if (isVoting || !voted || instance == null) return

    isVoting = true
    try {
      await retractPollVote(getClient(), instance)
      selectedOptions = []
      voted = false
    } catch (e) {
      console.error(e)
    } finally {
      isVoting = false
    }
  }

  function showResults (): void {
    showPopup(PollResults, { instance })
  }

  function onContextMenu (event: MouseEvent): void {
    event.preventDefault()

    showPopup(
      Menu,
      {
        actions: [
          ...(voted && !isQuiz
            ? [
                {
                  label: activity.string.RetractVote,
                  action: retractVote
                }
              ]
            : []),
          {
            label: activity.string.ShowResults,
            action: showResults
          }
        ]
      },
      getEventPositionElement(event)
    )
  }
</script>

<div
  class="poll-container"
  role="region"
  aria-label={question ?? 'Poll'}
  on:contextmenu|stopPropagation={onContextMenu}
>
  <div class="poll-header">
    <div class="poll-question">
      {question}
    </div>
    <div class="poll-type">
      <div class="poll-badges">
        <span class="badge" class:quiz={isQuiz} class:anonymous={isAnonymous && !isQuiz}>
          <Label label={typeLabel} />
        </span>
      </div>

      {#if votedEmployees.length > 0}
        <div class="poll-avatars" use:tooltip={{ label: activity.string.VotedParticipants }}>
          <CombineAvatars _class={contact.mixin.Employee} items={votedEmployees} size="tiny" limit={8} />
        </div>
      {/if}
    </div>
  </div>

  <div class="poll-options">
    {#each options as option (option.id)}
      <PollOptionPresenter
        {option}
        {instance}
        {isVoting}
        isVoted={voted}
        answers={revealedQuizAnswers}
        {privateAnswers}
        anonymous={isAnonymous}
        selected={selectedOptionIds.has(option.id)}
        on:toggle={() => {
          void toggleOption(option)
        }}
      />
    {/each}
  </div>

  <div class="poll-footer">
    {#if !voted && selectedOptions.length > 0 && isMultiple}
      <button
        class="footer-button primary"
        disabled={isVoting}
        on:click={() => {
          void vote()
        }}
      >
        <Label label={activity.string.Vote} />
      </button>
    {:else if !voted || isAnonymous}
      <div class="votes-count">
        <Label label={activity.string.VotesCount} params={{ count: totalVotes }} />
      </div>
    {:else}
      <button class="footer-button secondary" on:click={showResults}>
        <Label label={activity.string.ShowResults} />
      </button>
    {/if}
  </div>
</div>

<style lang="scss">
  .poll-container {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    gap: 0.875rem;
    border-radius: 0.75rem;
    font-size: 0.75rem;
    border: 1px solid var(--global-ui-BorderColor);
    min-width: 0;
    max-width: 28rem;
    width: 100%;
    user-select: text;
    box-sizing: border-box;
    transition: border-color 0.2s ease;

    &:hover {
      border-color: var(--global-ui-Focus-BorderColor, var(--global-ui-BorderColor));
    }
  }

  .poll-header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .poll-question {
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--global-primary-TextColor);
    word-break: break-word;
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .poll-type {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.6875rem;
    color: var(--global-tertiary-TextColor);
    min-width: 0;
  }

  .poll-badges {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-weight: 500;
      background: var(--global-ui-highlight-BackgroundColor);
      color: var(--global-secondary-TextColor);

      &.quiz {
        color: var(--global-accent-IconColor);
        background: var(--global-ui-highlight-BackgroundColor);
      }

      &.anonymous {
        color: var(--global-tertiary-TextColor);
      }
    }
  }

  .poll-avatars {
    display: flex;
    align-items: center;
    white-space: nowrap;
    word-break: normal;
    flex-shrink: 0;
  }

  .poll-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .poll-footer {
    margin-top: 0.25rem;
    padding-top: 0.625rem;
    border-top: 1px solid var(--global-ui-BorderColor);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;

    .votes-count {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
      font-weight: 500;
    }

    .footer-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 0.375rem;
      border: none;
      background: transparent;
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;

      &.primary {
        background: var(--global-accent-IconColor);
        color: var(--global-contrast-TextColor);

        &:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      &.secondary {
        color: var(--global-secondary-TextColor);

        &:hover {
          color: var(--global-primary-TextColor);
          background: var(--global-ui-highlight-BackgroundColor);
        }
      }
    }
  }
</style>
