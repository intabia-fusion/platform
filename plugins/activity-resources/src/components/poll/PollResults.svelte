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
  import { Label } from '@hcengineering/ui'
  import { Dialog } from '@hcengineering/ui/kit'
  import contact, { type Person } from '@hcengineering/contact'
  import { UserDetails } from '@hcengineering/contact-resources'
  import type { OptionID, Poll } from '@hcengineering/activity'
  import { notEmpty, type AccountUuid } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'

  import activity from '../../plugin'
  import { getOptionPercent } from '../../poll'

  export let instance: Poll

  const query = createQuery()
  let live: Poll | undefined

  // Votes keep coming while the popup is open.
  $: query.query(activity.class.Poll, { _id: instance._id }, (res) => {
    live = res[0]
  })
  $: poll = live ?? instance
  $: total = poll.totalVotes ?? 0
  $: question = poll.question
  $: options = poll.options ?? []

  // By the person, not the employee store: a guest or a deactivated account has a person too.
  const personsQuery = createQuery()
  let personByAccount = new Map<AccountUuid, Person>()
  $: voters = [...new Set((poll.userVotes ?? []).map((it) => it.account))]
  $: personsQuery.query(contact.class.Person, { personUuid: { $in: voters } }, (res) => {
    personByAccount = new Map(res.map((it) => [it.personUuid as unknown as AccountUuid, it]))
  })

  function getVotedPersons (optionId: OptionID, poll: Poll, persons: Map<AccountUuid, Person>): Person[] {
    const userVotes = poll.userVotes ?? []
    return userVotes
      .filter((it) => it.options.includes(optionId))
      .map((it) => persons.get(it.account))
      .filter(notEmpty)
  }

  function getOptionResult (optionId: OptionID, poll: Poll): number {
    return poll.votes?.[optionId] ?? 0
  }
</script>

<Dialog label={activity.string.PollResults} footer={false} on:close>
  <div class="results">
    <div class="results__header">
      <div class="title">
        {question}
      </div>
      <span class="votes-count">
        <Label label={activity.string.VotesCount} params={{ count: total }} />
      </span>
    </div>

    {#each options as option (option.id)}
      {@const opResult = getOptionResult(option.id, poll)}
      {@const votedPersons = getVotedPersons(option.id, poll, personByAccount)}
      {#if opResult > 0}
        <div class="option">
          <div class="option__header">
            <span class="option__label overflow-label" title={option.label}>
              {option.label}
            </span>
            <span class="option__percentage">
              - {getOptionPercent(poll, option.id)}%
            </span>
            <span class="option__result">
              <Label label={activity.string.VotesCount} params={{ count: opResult }} />
            </span>
          </div>

          <div class="user-list">
            {#each votedPersons as person, index}
              <div class="user-list__item" class:withoutBorder={index === votedPersons.length - 1}>
                <div class="user-list__item__content">
                  <UserDetails {person} showStatus />
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>
</Dialog>

<style lang="scss">
  .results {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;

    &__header {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
  }

  .title {
    font-size: 1rem;
    font-weight: 500;
    color: var(--global-primary-TextColor);
  }

  .votes-count {
    font-size: 0.875rem;
    color: var(--global-secondary-TextColor);
  }

  .option {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    white-space: nowrap;

    &__header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      overflow: hidden;
      padding: 0 0.25rem;
    }

    &__label {
      font-size: 0.875rem;
      color: var(--global-secondary-TextColor);
      flex-shrink: 1;
    }

    &__percentage {
      font-size: 0.875rem;
      color: var(--global-secondary-TextColor);
      margin-left: -0.375rem;
      margin-right: 1rem;
    }

    &__result {
      font-size: 0.875rem;
      color: var(--global-secondary-TextColor);
      margin-left: auto;
    }
  }

  .user-list {
    display: flex;
    flex-direction: column;
    border-radius: 0.75rem;
    background: var(--global-ui-highlight-BackgroundColor);
    border: 1px solid var(--global-ui-BorderColor);

    &__item {
      padding: var(--spacing-0_75);
      border-bottom: 1px solid var(--global-ui-BorderColor);

      &.withoutBorder {
        border: 0;
      }

      &__content {
        display: flex;
        align-items: center;
        padding: var(--spacing-0_75);
        border-radius: var(--small-BorderRadius);
      }
    }
  }
</style>
