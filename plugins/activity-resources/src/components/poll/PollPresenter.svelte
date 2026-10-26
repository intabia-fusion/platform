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
  import { getCurrentAccount, notEmpty, type AccountUuid, type Ref, type Timestamp } from '@hcengineering/core'
  import { getEmbeddedLabel, translate, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import ui, {
    addNotification,
    getCurrentLocale,
    getFormattedDate,
    Label,
    NotificationSeverity,
    showPopup,
    themeStore,
    tooltip,
    type Action
  } from '@hcengineering/ui'
  import { Spinner } from '@hcengineering/ui/kit'
  import contact, { getCurrentEmployeeSpace, type Person } from '@hcengineering/contact'
  import { CombineAvatars, employeeRefByAccountUuidStore } from '@hcengineering/contact-resources'
  import type { Poll, PollAnswer, PollOption } from '@hcengineering/activity'

  import activity from '../../plugin'
  import { canRequestQuizReveal, votePoll, retractPollVote, requestQuizReveal, QUIZ_REVEAL_RETRY_MS } from '../../poll'
  import { getTimeUnitStep, MAX_TIMER_DELAY, toTimeUnit } from '../../pollTime'
  import { addAppletContextActions } from '../../appletContextMenu'
  import PollOptionPresenter from './PollOptionPresenter.svelte'
  import PollNotCountedToast from './PollNotCountedToast.svelte'
  import PollResults from './PollResults.svelte'

  export let instance: Poll
  // E.g. a forwarded snapshot: results only, no voting.
  export let readonly: boolean = false

  // The activity service applies the vote, the spinner waits for it at most this long.
  const PENDING_TIMEOUT_MS = 10_000

  const me = getCurrentAccount()
  const privateAnswersQuery = createQuery()
  const personsQuery = createQuery()
  let otherPersons = new Map<AccountUuid, Ref<Person>>()

  let privateAnswers: PollAnswer[] = []
  let selectedOptions: PollOption[] = []
  let sendingIds = new Set<string>()
  let voted = false
  let pending: 'vote' | 'retract' | undefined = undefined
  let pendingTimer: ReturnType<typeof setTimeout> | undefined
  let currentInstanceId: string | undefined = undefined
  let now = Date.now()
  let tickTimer: ReturnType<typeof setTimeout> | undefined

  $: question = instance?.question ?? ''
  $: options = instance?.options ?? []
  $: totalVotes = instance?.totalVotes ?? 0

  $: isAnonymous = instance?.anonymous === true
  $: isQuiz = instance?.quiz === true
  $: isMultiple = instance?.mode === 'multiple'

  $: started = instance?.startAt == null || now >= instance.startAt
  $: ended = instance?.endAt != null && now > instance.endAt
  $: canVote = !readonly && started && !ended
  // Read-only shows the results at once, but not those of a running quiz: they would hint the answer.
  $: resultsShown = voted || (readonly && !isQuiz)
  // A quiz voter sees the correct option right after voting, a retract would give a second try.
  $: canRetract = voted && instance?.revote === true && !isQuiz && canVote
  $: isVoting = pending != null
  $: awaitingReveal = isQuiz && ended && !readonly && instance?.quizAnswer == null && instance?.quizAnswerHash != null
  $: scheduleTick(instance?.startAt, instance?.endAt, now, awaitingReveal)
  $: requestRevealIfNeeded(awaitingReveal, now)
  $: status = getStatus(instance?.startAt, instance?.endAt, now)

  $: revealedQuizAnswer = privateAnswers[0]?.quizAnswer ?? instance?.quizAnswer
  $: revealedQuizAnswers = revealedQuizAnswer != null ? [revealedQuizAnswer] : []

  $: selectedOptionIds = new Set(selectedOptions.map((it) => it.id))

  $: typeLabel =
    isAnonymous && isQuiz
      ? activity.string.AnonymousQuiz
      : isAnonymous
        ? activity.string.AnonymousPoll
        : isQuiz
          ? activity.string.Quiz
          : activity.string.Poll

  // A virtual list may reuse the component for another poll.
  $: if (instance?._id !== currentInstanceId) {
    currentInstanceId = instance?._id
    selectedOptions = []
    sendingIds = new Set()
    privateAnswers = []
    clearTimeout(pendingTimer)
    pending = undefined
  }

  $: if ((isAnonymous || isQuiz) && !readonly) {
    // Only the own answer is visible anyway; with the space the query is one index lookup.
    const query = { attachedTo: instance?._id, space: getCurrentEmployeeSpace() }
    privateAnswersQuery.query(activity.class.PollAnswer, query, (res) => {
      if (instance?._id === currentInstanceId) {
        privateAnswers = res
      }
    })
  } else {
    privateAnswersQuery.unsubscribe()
  }

  onDestroy(() => {
    privateAnswersQuery.unsubscribe()
    personsQuery.unsubscribe()
    clearTimeout(pendingTimer)
    clearTimeout(tickTimer)
  })

  // Direct assignments, not setters: Svelte orders reactive statements only by what they assign themselves.
  $: voted = isVotedByMe(instance, privateAnswers)
  // Kept until the vote counts: a vote the service dropped is sent again with the same choice.
  $: if (voted && selectedOptions.length > 0) selectedOptions = []
  $: if ((pending === 'vote' && voted) || (pending === 'retract' && !voted)) {
    clearTimeout(pendingTimer)
    pending = undefined
  }
  // Guests and deactivated accounts are not in the employee store, they come by their person.
  $: voterAccounts = getVotedAccounts(instance)
  $: missingKey = voterAccounts
    .filter((acc) => !$employeeRefByAccountUuidStore.has(acc))
    .sort()
    .join(',')
  $: queryMissingPersons(missingKey)
  $: votedPersons = voterAccounts
    .map((acc) => $employeeRefByAccountUuidStore.get(acc) ?? otherPersons.get(acc))
    .filter(notEmpty)

  // By a key, not the list: every update of the poll gives a new list of the same accounts.
  function queryMissingPersons (key: string): void {
    if (key === '') {
      personsQuery.unsubscribe()
      otherPersons = new Map()
      return
    }
    const accounts = key.split(',') as AccountUuid[]
    personsQuery.query(
      contact.class.Person,
      { personUuid: { $in: accounts } },
      (res) => {
        otherPersons = new Map(res.map((it) => [it.personUuid as unknown as AccountUuid, it._id]))
      },
      { projection: { _id: 1, personUuid: 1 } }
    )
  }

  function setPending (value: 'vote' | 'retract' | undefined): void {
    clearTimeout(pendingTimer)
    pending = value
    if (value != null) {
      pendingTimer = setTimeout(() => {
        pending = undefined
        void notifyNotCounted(value)
      }, PENDING_TIMEOUT_MS)
    }
  }

  // The service drops a vote it cannot take without an answer: a spinner that just stops reads as success.
  async function notifyNotCounted (kind: 'vote' | 'retract'): Promise<void> {
    const { language } = $themeStore
    addNotification(
      await translate(
        kind === 'vote' ? activity.string.VoteNotCounted : activity.string.RetractNotCounted,
        {},
        language
      ),
      await translate(activity.string.VoteNotConfirmed, {}, language),
      PollNotCountedToast,
      {},
      NotificationSeverity.Warning,
      'poll-vote-not-counted'
    )
  }

  // So the poll opens, closes and counts down without a reload.
  function scheduleTick (
    startAt: Timestamp | undefined,
    endAt: Timestamp | undefined,
    current: number,
    retryReveal: boolean
  ): void {
    clearTimeout(tickTimer)
    const bounds = [startAt, endAt].filter((it): it is Timestamp => it != null && it > current)
    const candidates = [...bounds]
    if (bounds.length > 0) candidates.push(current + getTimeUnitStep(Math.min(...bounds) - current))
    if (retryReveal && canRequestQuizReveal(instance._id)) candidates.push(current + QUIZ_REVEAL_RETRY_MS)
    if (candidates.length === 0) return
    const next = Math.min(...candidates)
    // From the real clock: `current` is the last tick, and every vote reschedules between ticks.
    tickTimer = setTimeout(
      () => {
        now = Date.now()
      },
      Math.min(next - Date.now() + 100, MAX_TIMER_DELAY)
    )
  }

  // `current` only makes the call repeat on every tick, the request itself is throttled.
  function requestRevealIfNeeded (awaiting: boolean, current: number): void {
    if (!awaiting) return
    requestQuizReveal(getClient(), instance).catch((err) => {
      console.error(err)
    })
  }

  function formatTimeLeft (ms: number): string {
    const { value, unit } = toTimeUnit(ms)
    return new Intl.RelativeTimeFormat(getCurrentLocale(), { numeric: 'always' }).format(value, unit)
  }

  // Relative, as it reads at a glance; the exact time is in the tooltip.
  function getStatus (
    startAt: Timestamp | undefined,
    endAt: Timestamp | undefined,
    current: number
  ): { label: IntlString, time?: string, exact: string } | undefined {
    const exact = (at: Timestamp): string =>
      getFormattedDate(at, { month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    if (startAt != null && current < startAt) {
      return { label: activity.string.StartsIn, time: formatTimeLeft(startAt - current), exact: exact(startAt) }
    }
    if (endAt == null) return undefined
    if (current > endAt) return { label: activity.string.Ended, exact: exact(endAt) }
    return { label: activity.string.EndsIn, time: formatTimeLeft(endAt - current), exact: exact(endAt) }
  }

  // Only an anonymous poll lacks the voter in userVotes; the own answer arrives by a separate query.
  function isVotedByMe (poll: Poll | undefined, answers: PollAnswer[]): boolean {
    if (poll?.anonymous === true) {
      return answers.length > 0
    }
    return poll?.userVotes?.some((it) => it.account === me.uuid) ?? false
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
    if (isVoting || voted || !canVote) return
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
    if (isVoting || voted || !canVote) return
    const optionsToVote = opts ?? selectedOptions
    if (optionsToVote.length === 0 || instance == null) return
    sendingIds = new Set(optionsToVote.map((it) => it.id))

    setPending('vote')
    try {
      await votePoll(getClient(), instance, optionsToVote)
    } catch (e) {
      console.error(e)
      setPending(undefined)
      void notifyNotCounted('vote')
    }
  }

  async function retractVote (): Promise<void> {
    if (isVoting || !canRetract || instance == null) return

    setPending('retract')
    try {
      await retractPollVote(getClient(), instance)
      selectedOptions = []
    } catch (e) {
      console.error(e)
      setPending(undefined)
      void notifyNotCounted('retract')
    }
  }

  function showResults (): void {
    showPopup(PollResults, { instance })
  }

  function onContextMenu (event: MouseEvent): void {
    // Hidden until the own vote: in a quiz they would hint the answer.
    const canSeeResults = (voted || ended) && !isAnonymous && !readonly
    const actions: Action[] = []
    if (canRetract) {
      actions.push({
        label: activity.string.RetractVote,
        icon: ui.icon.ArrowUturnLeft,
        group: 'create',
        action: retractVote
      })
    }
    if (canSeeResults) {
      actions.push({
        label: activity.string.ShowResults,
        icon: activity.icon.Poll,
        group: 'create',
        action: async () => {
          showResults()
        }
      })
    }
    // The message template shows only these over the poll.
    addAppletContextActions(event, actions)
  }
</script>

<div class="poll-container" role="region" aria-label={question} on:contextmenu={onContextMenu}>
  <div class="poll-header">
    <div class="poll-question">
      {question}
    </div>
    <div class="poll-type">
      <div class="poll-badges">
        <span class="badge">
          <Label label={typeLabel} />
        </span>
        {#if status != null}
          <span class="poll-status" use:tooltip={{ label: getEmbeddedLabel(status.exact) }}>
            <Label label={status.label} params={{ time: status.time }} />
          </span>
        {/if}
      </div>

      {#if votedPersons.length > 0}
        <div class="poll-avatars" use:tooltip={{ label: activity.string.VotedParticipants }}>
          <CombineAvatars _class={contact.class.Person} items={votedPersons} size="tiny" limit={8} />
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
        isVoted={resultsShown}
        answers={revealedQuizAnswers}
        {privateAnswers}
        {canVote}
        {ended}
        selected={selectedOptionIds.has(option.id)}
        sending={sendingIds.has(option.id)}
        on:toggle={() => {
          void toggleOption(option)
        }}
      />
    {/each}
  </div>

  <div class="poll-footer">
    {#if !voted && canVote && selectedOptions.length > 0 && isMultiple}
      <!-- The click stays off the message: in saved, threads and pinned it navigates. -->
      <button
        type="button"
        class="footer-action"
        disabled={isVoting}
        on:click|stopPropagation={() => {
          void vote()
        }}
      >
        {#if isVoting}<Spinner size="extra-small" inheritColor />{/if}
        <Label label={activity.string.Vote} />
      </button>
    {:else if (!voted && !ended) || isAnonymous || readonly}
      <div class="votes-count">
        <Label label={activity.string.VotesCount} params={{ count: totalVotes }} />
      </div>
    {:else}
      <!-- The click stays off the message: in saved, threads and pinned it navigates. -->
      <button type="button" class="footer-action" on:click|stopPropagation={showResults}>
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
    background: var(--global-surface-02-BackgroundColor);
    min-width: 0;
    max-width: 28rem;
    width: 100%;
    user-select: text;
    box-sizing: border-box;
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

  // Keeps room for the voters' avatars, which load after the poll.
  .poll-type {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 1.125rem;
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
      background: var(--kit-button-secondary-BackgroundColor);
      color: var(--global-secondary-TextColor);
    }
  }

  .poll-status {
    color: var(--global-tertiary-TextColor);
    white-space: nowrap;
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
    min-height: calc(0.625rem + 1px + var(--global-extra-small-Size));

    .votes-count {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
      font-weight: 500;
    }

    // The whole strip under the line down to the card edges takes the click.
    .footer-action {
      display: flex;
      align-items: center;
      justify-content: center;
      align-self: stretch;
      flex-grow: 1;
      margin: -0.625rem -1rem -1rem;
      padding: 0.625rem 1rem 1rem;
      border: none;
      border-radius: 0 0 0.75rem 0.75rem;
      background: none;
      font: inherit;
      font-size: 0.75rem;
      gap: var(--spacing-0_5);
      font-weight: 500;
      color: var(--global-secondary-TextColor);
      cursor: pointer;

      &:hover:not(:disabled) {
        color: color-mix(in srgb, var(--global-secondary-TextColor) 55%, var(--global-primary-TextColor));
      }
      &:disabled {
        cursor: default;
      }
      &:focus-visible {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: -2px;
      }
    }
  }
</style>
