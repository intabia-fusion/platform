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
  import { Applet, Poll, PollAnonymousAnswer, PollVotedOption } from '@hcengineering/communication'
  import { AppletAttachment } from '@hcengineering/communication-types'
  import { DAY, getEventPositionElement, Label, Menu, showPopup, ticker, TimeSince } from '@hcengineering/ui'
  import contact, { getCurrentEmployeeSpace } from '@hcengineering/contact'
  import { employeeByAccountStore, CombineAvatars } from '@hcengineering/contact-resources'
  import { notEmpty, getCurrentAccount, isOtherDay, Timestamp, getDay, AccountUuid } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { openDoc } from '@hcengineering/view-resources'
  import { IntlString } from '@hcengineering/platform'

  import communication from '../../plugin'
  import { isVotedByMe, PollConfig, PollOption } from '../../poll'
  import PollOptionPresenter from './PollOptionPresenter.svelte'
  import PollResults from './PollResults.svelte'

  export let applet: Applet
  export let attachment: AppletAttachment<PollConfig>

  const query = createQuery()
  const anonymousAnswersQuery = createQuery()

  let result: Poll | undefined = undefined
  let anonymousAnswers: PollAnonymousAnswer[] = []

  let isLoadingPoll = true
  let isLoadingPrivateAnswers = true

  $: isLoading = isLoadingPoll || isLoadingPrivateAnswers

  $: query.query(
    communication.class.Poll,
    { _id: attachment.params.id },
    (res) => {
      result = res[0] as Poll
      isLoadingPoll = false
    },
    { limit: 1 }
  )

  $: if (params.anonymous === true) {
    anonymousAnswersQuery.query(
      communication.class.PollAnonymousAnswer,
      {
        attachedTo: attachment.params.id
      },
      (res) => {
        anonymousAnswers = res
        isLoadingPrivateAnswers = false
      }
    )
  } else {
    isLoadingPrivateAnswers = false
  }

  $: params = attachment.params
  $: votedEmployees =
    Object.keys(result ?? {})
      .map((it) => $employeeByAccountStore.get(it as AccountUuid))
      .filter(notEmpty) ?? []

  $: voted = isVotedByMe(result, params.anonymous, anonymousAnswers)

  function showResults (): void {
    showPopup(PollResults, { params, result }, 'center')
  }

  let selectedOptions: PollOption[] = []

  function toggleOption (option: PollOption): void {
    const index = selectedOptions.findIndex((it) => it.id === option.id)
    if (index === -1) {
      selectedOptions = [...selectedOptions, option]
    } else {
      selectedOptions = selectedOptions.filter((it) => it.id !== option.id)
    }
  }

  $: if (!voted && result !== null && selectedOptions.length > 0 && params.mode !== 'multiple') {
    void vote()
  }

  async function vote (): Promise<void> {
    if (result == null || selectedOptions.length === 0 || voted) return

    const client = getClient()
    const me = getCurrentAccount()

    try {
      voted = true
      const op = client.apply()

      await op.update(result, { $inc: { totalVotes: 1 } })

      for (const opt of selectedOptions) {
        await op.update(result, { $inc: { [opt.id]: 1 } })
      }

      const date = new Date()
      const votedOptions: PollVotedOption[] = selectedOptions.map((it) => ({
        id: it.id,
        votedAt: date,
        label: it.label
      }))

      if (params.anonymous === true) {
        const space = getCurrentEmployeeSpace()
        await op.createDoc(communication.class.PollAnonymousAnswer, space, {
          attachedTo: result._id,
          attachedToClass: result._class,
          options: votedOptions,
          collection: 'anonymousAnswers'
        })
      } else {
        const myVote: Record<AccountUuid, PollVotedOption[]> = {
          [me.uuid]: votedOptions
        }

        await op.update(result, myVote)
      }

      await op.commit()
      selectedOptions = []
    } catch (e) {
      voted = false
      console.log(e)
    }
  }

  $: started = params.startAt == null || !isFuture($ticker, params.startAt)
  $: ended = params.endAt != null && !isFuture($ticker, params.endAt)

  function isFuture (now: number, time: number): boolean {
    return time > now
  }

  function isTomorrow (time: Timestamp): boolean {
    const todayDay = getDay(Date.now())
    const targetDay = getDay(time)
    return targetDay === todayDay + DAY
  }

  function getFormattedDate (date: number, type: 'start' | 'end'): { label: IntlString, date: string } {
    if (!isOtherDay(date, Date.now())) {
      return {
        label: type === 'start' ? communication.string.StartsAt : communication.string.EndsAt,
        date: new Date(date).toLocaleString('default', {
          minute: '2-digit',
          hour: 'numeric'
        })
      }
    }

    if (isTomorrow(date)) {
      return {
        label: type === 'start' ? communication.string.StartsTomorrow : communication.string.EndsTomorrow,
        date: new Date(date).toLocaleString('default', {
          minute: '2-digit',
          hour: 'numeric'
        })
      }
    }

    return {
      label: type === 'start' ? communication.string.StartsAt : communication.string.EndsAt,
      date: new Date(date).toLocaleString('default', {
        minute: '2-digit',
        hour: 'numeric',
        day: '2-digit',
        month: 'short'
      })
    }
  }

  async function retractVote (): Promise<void> {
    if (result == null || !voted || params.quiz === true) return
    const client = getClient()
    const me = getCurrentAccount()
    const mySpace = getCurrentEmployeeSpace()
    const op = client.apply()

    await op.update(result, {
      $inc: {
        totalVotes: -1
      }
    })

    if (params.anonymous === true) {
      if (anonymousAnswers.length === 0) return
      for (const answer of anonymousAnswers) {
        if (answer.space === mySpace) {
          await op.remove(answer)
          for (const option of answer.options) {
            await op.update(result, {
              $inc: {
                [option.id]: -1
              }
            })
          }
        }
      }
    } else {
      const myVotes: PollVotedOption[] = result[me.uuid] ?? []
      if (myVotes.length === 0) return

      for (const option of myVotes) {
        await op.update(result, {
          $inc: {
            [option.id]: -1
          }
        })
      }

      const myVote: Record<AccountUuid, PollVotedOption[]> = {
        [me.uuid]: []
      }
      await op.update(result, myVote)
    }

    await op.commit()
    selectedOptions = []
    voted = false
  }

  function openPoll (): void {
    if (result == null) return
    void openDoc(getClient().getHierarchy(), result)
  }

  function onContextMenu (event: MouseEvent): void {
    event.preventDefault()

    showPopup(
      Menu,
      {
        actions: [
          {
            label: communication.string.OpenPoll,
            action: openPoll
          },
          ...(params.quiz === true || ended || !voted
            ? []
            : [
                {
                  label: communication.string.RetractVote,
                  action: retractVote
                }
              ])
        ]
      },
      getEventPositionElement(event)
    )
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="poll-container" on:contextmenu|stopPropagation={onContextMenu}>
  <div class="poll-question">
    {params.question}
  </div>
  <div class="poll-type">
    {#if params.anonymous && params.quiz}
      <Label label={communication.string.AnonymousQuiz} />
    {:else if params.anonymous}
      <Label label={communication.string.AnonymousVoting} />
    {:else if params.quiz}
      <Label label={communication.string.Quiz} />
    {:else}
      <Label label={communication.string.Poll} />
    {/if}
    {#if votedEmployees.length > 0}
      <div class="ml-1" />
      <CombineAvatars
        _class={contact.mixin.Employee}
        items={votedEmployees.map((it) => it._id)}
        size="tiny"
        limit={8}
      />
    {/if}
  </div>
  <div class="poll-options">
    {#each params.options as option}
      <PollOptionPresenter
        {option}
        bind:result
        {isLoading}
        isVoted={voted}
        answer={params.quizAnswer}
        {started}
        {ended}
        {anonymousAnswers}
        anonymous={params.anonymous ?? false}
        on:toggle={() => {
          toggleOption(option)
        }}
      />
    {/each}
  </div>
  {#if params.startAt != null || params.endAt != null}
    <div class="poll-dates">
      {#if params.startAt != null && !started}
        {@const { label, date } = getFormattedDate(params.startAt, 'start')}
        <span>
          <Label {label} params={{ date }} />
        </span>
      {:else if params.endAt != null && !ended}
        {@const { label, date } = getFormattedDate(params.endAt, 'end')}
        <span>
          <Label {label} params={{ date }} />
        </span>
      {:else if params.endAt != null && ended}
        <span>
          <Label label={communication.string.Ended} />
          <TimeSince value={params.endAt} />
        </span>
      {/if}
    </div>
  {/if}
  <div class="poll-footer">
    <div class="mt-1" />
    {#if !ended && !voted && selectedOptions.length > 0 && params.mode === 'multiple'}
      <div class="footer-button" on:click={vote}>
        <Label label={communication.string.Vote} />
      </div>
    {:else if !ended && (!voted || params.anonymous === true)}
      <div class="votes-count">
        <Label label={communication.string.VotesCount} params={{ count: result?.totalVotes ?? 0 }} />
      </div>
    {:else}
      <div class="footer-button" on:click={showResults}>
        <Label label={communication.string.ShowResults} />
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .poll-container {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0.5rem;
    gap: 1rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--global-ui-BorderColor);
    min-width: 25rem;
    max-width: 25rem;
    width: 25rem;
    user-select: text;
  }

  .poll-type {
    display: flex;
    align-items: center;
    font-size: 0.675rem;
    color: var(--global-tertiary-TextColor);
    margin-top: -0.75rem;
  }

  .poll-question {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--global-primary-TextColor);
  }

  .poll-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .poll-dates {
    display: flex;
    flex-direction: column;
    font-size: 0.675rem;
    color: var(--global-tertiary-TextColor);
    margin-bottom: -0.75rem;
    white-space: nowrap;
  }

  .poll-footer {
    margin-top: 0.5rem;
    border-top: 1px solid var(--theme-divider-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 500;
    min-height: 34px;

    .votes-count {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
      font-weight: 500;
      gap: 0.25rem;
    }

    .footer-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
      font-weight: 500;
      gap: 0.25rem;
      cursor: pointer;

      &:hover {
        color: var(--global-primary-TextColor);
      }
    }
  }
</style>
