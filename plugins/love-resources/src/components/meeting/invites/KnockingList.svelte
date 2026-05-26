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
  import { type Person, formatName } from '@hcengineering/contact'
  import { Avatar, getPersonByPersonRefCb } from '@hcengineering/contact-resources'
  import { Label, ModernButton } from '@hcengineering/ui'
  import { type Ref } from '@hcengineering/core'
  import { type MeetingMinutes, type UserMeetingInvite } from '@hcengineering/love'

  import love from '../../../plugin'
  import { knockingInvitesStore, responseToInviteRequest } from '../../../invites'
  import { currentMeetingMinutes } from '../../../stores'

  export let compact: boolean = false
  // Optional: when provided, show only knocks targeting this meeting. If
  // omitted, falls back to $currentMeetingMinutes; if neither is set, shows
  // all pending knocks (so a UI can render them in a global location).
  export let meetingId: Ref<MeetingMinutes> | undefined = undefined

  let persons = new Map<Ref<Person>, Person>()

  $: targetMeeting = meetingId ?? $currentMeetingMinutes?._id
  $: pendingForCurrent =
    targetMeeting !== undefined
      ? $knockingInvitesStore.filter((it) => it.meeting === targetMeeting)
      : $knockingInvitesStore

  $: {
    for (const invite of pendingForCurrent) {
      if (!persons.has(invite.from)) {
        getPersonByPersonRefCb(invite.from, (p) => {
          if (p != null) {
            persons.set(invite.from, p)
            persons = persons
          }
        })
      }
    }
  }

  async function handleAccept (invite: UserMeetingInvite): Promise<void> {
    await responseToInviteRequest(invite, true)
  }

  async function handleReject (invite: UserMeetingInvite): Promise<void> {
    await responseToInviteRequest(invite, false)
  }
</script>

{#if pendingForCurrent.length > 0}
  <div class="knocking-list" data-id="knocking-list" class:compact>
    <div class="knocking-list__header">
      <Label label={love.string.KnockingLabel} />
      <span class="counter">{pendingForCurrent.length}</span>
    </div>
    <div class="knocking-list__items">
      {#each pendingForCurrent as invite (invite._id)}
        {@const person = persons.get(invite.from)}
        <div class="knocking-list__item" data-id="knocking-item">
          <div class="knocking-list__person">
            {#if person}
              <Avatar {person} size="small" name={person.name} />
              <span class="knocking-list__name">{formatName(person.name)}</span>
            {:else}
              <Label label={love.string.IsKnocking} params={{ name: '' }} />
            {/if}
          </div>
          <div class="knocking-list__actions">
            <ModernButton
              label={love.string.AdmitKnock}
              kind={'primary'}
              size={compact ? 'small' : 'medium'}
              dataId="knock-accept"
              on:click={() => {
                void handleAccept(invite)
              }}
            />
            <ModernButton
              label={love.string.DeclineKnock}
              kind={'secondary'}
              size={compact ? 'small' : 'medium'}
              dataId="knock-reject"
              on:click={() => {
                void handleReject(invite)
              }}
            />
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style lang="scss">
  .knocking-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    padding: var(--spacing-1_5);
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--medium-BorderRadius);
    background: var(--theme-popup-color);

    &.compact {
      padding: var(--spacing-1);
      gap: var(--spacing-0_5);
    }

    &__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      color: var(--theme-caption-color);
    }

    .counter {
      font-size: 0.75rem;
      padding: 0 var(--spacing-0_5);
      border-radius: var(--small-BorderRadius);
      background: var(--theme-button-default);
      color: var(--theme-content-color);
    }

    &__items {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }

    &__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-1);
    }

    &__person {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      min-width: 0;
    }

    &__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.875rem;
      color: var(--theme-caption-color);
    }

    &__actions {
      display: flex;
      gap: var(--spacing-0_5);
    }
  }
</style>
