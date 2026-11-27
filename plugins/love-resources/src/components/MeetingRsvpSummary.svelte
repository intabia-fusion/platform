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
<!--
  Who answered the invitation, as one line of counts that unfolds into the names. The answers come
  from `rsvpMembers`, which the server mirrors into every copy of the event: a copy cannot read its
  siblings, so this is the only way an invitee learns who else is coming.
-->
<script lang="ts">
  import calendar, { type Event, type RsvpMembers } from '@hcengineering/calendar'
  import contact, { getName, type Person } from '@hcengineering/contact'
  import { type PersonId, type Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import ui, { Icon, type IconComponent } from '@hcengineering/ui'
  import { Chip, type ChipTone } from '@hcengineering/ui/kit'
  import { openDoc } from '@hcengineering/view-resources'
  import love from '../plugin'

  // The event the answers belong to: the copy of the series the caller opened.
  export let event: Event
  // The people the event is for; the event's own list unless the card keeps its own.
  export let participants: Array<Ref<Person>> | undefined = undefined
  // Organisers own the meeting and answer nothing, so counting them leaves one pending forever.
  // Person uuids, the way the meeting document keeps its owners.
  export let owners: string[] = []
  // Guests answer nothing either: they have no account to answer with.
  export let guests: string[] = []
  // Folded by default: the line of counts is the summary, the names are the detail.
  export let expanded: boolean = false
  // A card that already lists everyone (the settings window) keeps the counts only, no unfolding.
  export let expandable: boolean = true

  const client = getClient()

  let answers: RsvpMembers | undefined = event.rsvpMembers
  const answerQuery = createQuery()
  // The card is a snapshot: an answer that arrives while it is open would leave the line stale.
  $: answerQuery.query(event._class, { _id: event._id }, (res) => {
    const found = res[0] as Event | undefined
    if (found?.rsvpMembers !== undefined) answers = found.rsvpMembers
  })

  let people: Person[] = []
  const peopleQuery = createQuery()
  peopleQuery.query(contact.class.Person, {}, (res) => {
    people = res
  })

  interface Member {
    person: Ref<Person>
    label: string
  }

  function members (ids: Ref<Person>[]): Member[] {
    const res: Member[] = []
    for (const ref of ids) {
      const person = people.find((it) => it._id === ref)
      if (person === undefined) continue
      res.push({ person: ref, label: getName(client.getHierarchy(), person) })
    }
    return res
  }

  // The invitees who said nothing yet: everyone the event is for, minus the organisers, minus the
  // people whose answer is already in the lists above.
  $: answered = new Set<Ref<Person>>([
    ...(answers?.accepted ?? []),
    ...(answers?.tentative ?? []),
    ...(answers?.declined ?? [])
  ])
  // Organisers are named by person uuid in the meeting document, which is what `personUuid` is.
  $: ownerIds = new Set<string>(owners)
  $: invitees = ((participants ?? (event.participants as Array<Ref<Person>>) ?? []) as Array<Ref<Person>>)
  $: invited = invitees.filter((ref) => {
    const person = people.find((it) => it._id === ref)
    const uuid = person?.personUuid
    return uuid === undefined || !ownerIds.has(uuid)
  })
  $: pendingIds = invited.filter((ref) => !answered.has(ref))

  interface Group {
    key: string
    label: IntlString
    count: IntlString
    icon: IconComponent
    tone: ChipTone
    members: Member[]
    // The number the line shows: the names when they are known, the tally from the document when
    // the answers were given before the names were kept, so an old event reads its real counts.
    total: number
  }

  $: groups = buildGroups(answers, event.rsvpSummary, pendingIds, invited.length)

  function buildGroups (
    known: RsvpMembers | undefined,
    tally: Event['rsvpSummary'],
    pending: Ref<Person>[],
    invitedCount: number
  ): Group[] {
    // Without the names only the counts are trustworthy; the people behind them stay unnamed.
    const count = (key: keyof RsvpMembers, list: Member[]): number => {
      return known !== undefined ? list.length : (tally?.[key] ?? 0)
    }
    const accepted = members(known?.accepted ?? [])
    const tentative = members(known?.tentative ?? [])
    const declined = members(known?.declined ?? [])
    const silent = members(pending)
    const answeredCount =
      count('accepted', accepted) + count('tentative', tentative) + count('declined', declined)

    return [
      {
        key: 'accepted',
        label: calendar.string.RsvpAccepted,
        count: calendar.string.RsvpAcceptedCount,
        icon: ui.icon.CheckCircle,
        tone: 'positive',
        members: accepted,
        total: count('accepted', accepted)
      },
      {
        key: 'tentative',
        label: calendar.string.RsvpTentative,
        count: calendar.string.RsvpTentativeCount,
        icon: ui.icon.Clock,
        tone: 'regular',
        members: tentative,
        total: count('tentative', tentative)
      },
      {
        key: 'declined',
        label: calendar.string.RsvpDeclined,
        count: calendar.string.RsvpDeclinedCount,
        icon: ui.icon.CrossCircle,
        tone: 'negative',
        members: declined,
        total: count('declined', declined)
      },
      {
        key: 'pending',
        label: calendar.string.RsvpPending,
        count: calendar.string.RsvpPendingCount,
        icon: ui.icon.Clock,
        tone: 'ghost',
        members: silent,
        total: known !== undefined ? silent.length : Math.max(0, invitedCount - answeredCount)
      }
    ]
  }

  // The line carries only the states somebody is in: four zeroes would read as a broken row.
  $: summary = groups.filter((it) => it.total > 0)
  // Nothing to count: a meeting whose only participant is its organiser has no answers to show,
  // and an empty line would look like a broken row.
  $: nothing = summary.length === 0 || ((participants ?? event.participants ?? []).length === 0 && guests.length === 0)

  // Guests carry an address, sometimes wrapped as "Name <mail>": the name is what a reader wants.
  function guestLabel (value: string): string {
    const parsed = value.match(/^(.*) <(.+)>$/)
    return parsed?.[1] !== undefined && parsed[1] !== '' ? parsed[1] : value
  }

  function openPerson (id: Ref<Person>): void {
    const person = people.find((it) => it._id === id)
    if (person === undefined) return
    void openDoc(client.getHierarchy(), person)
  }
</script>

{#if !nothing}
  <div class="rsvp">
    <button
      class="rsvp__line"
      type="button"
      aria-expanded={expanded}
      disabled={!expandable}
      on:click={() => {
        expanded = !expanded
      }}
    >
      <span class="rsvp__counts">
        {#each summary as group (group.key)}
          <Chip
            label={group.count}
            labelParams={{ count: group.total }}
            icon={group.icon}
            tone={group.tone}
            size="small"
          />
        {/each}
      </span>
      {#if expandable}
        <Icon icon={expanded ? ui.icon.ArrowDown : ui.icon.ArrowRight} size="small" />
      {/if}
    </button>

    {#if expanded && expandable}
      <div class="rsvp__groups">
        {#each groups as group (group.key)}
          {#if group.total > 0}
            <div class="rsvp__group">
              <Chip label={group.label} kind="outline" tone={group.tone} size="extra-small" />
              {#each group.members as member (member.person)}
                <button
                  class="rsvp__person"
                  type="button"
                  on:click={() => {
                    openPerson(member.person)
                  }}
                >
                  <Chip label={getEmbeddedLabel(member.label)} kind="neutral" size="small" />
                </button>
              {/each}
            </div>
          {/if}
        {/each}
        {#if guests.length > 0}
          <div class="rsvp__group">
            <Chip label={love.string.Guests} kind="outline" size="extra-small" />
            {#each guests as guest (guest)}
              <Chip label={getEmbeddedLabel(guestLabel(guest))} icon={ui.icon.At} kind="outline" size="small" />
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .rsvp {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    min-width: 0;
    // The settings window renders this inside the wrapping row of participant chips: a full line
    // keeps the counts above them, where a summary belongs, and not beside them.
    flex: 1 1 100%;
    width: 100%;
  }
  // The whole line is the toggle: the counts are the summary, and the chevron says it unfolds.
  .rsvp__line {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--spacing-1_5);
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    color: var(--global-secondary-TextColor);
    text-align: start;
    cursor: pointer;

    &:hover .rsvp__counts {
      filter: brightness(0.96);
    }

    &:disabled {
      cursor: default;
    }
  }
  .rsvp__counts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
  }
  .rsvp__groups {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1_5);
    padding: var(--spacing-2);
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-bg-accent-color);
  }
  // A group reads as its label and the people behind it, in one wrapped line: a fixed label column
  // leaves a gap the eye reads as a missing name.
  .rsvp__group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
  }
  .rsvp__person {
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
</style>
