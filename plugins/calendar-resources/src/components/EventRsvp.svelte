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
  import {
    AccessLevel,
    type Event,
    type ReccuringInstance,
    type RsvpStatus,
    type RsvpSummary,
    rsvpPending
  } from '@hcengineering/calendar'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { setPlatformStatus, unknownError, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Button, Label } from '@hcengineering/ui'
  import calendar from '../plugin'
  import { updateReccuringInstance } from '../utils'

  export let object: Event
  // The event card aligns every row past its icon column; a card without icons (a meeting card)
  // keeps the row flush with the rest of its content.
  export let indent: boolean = false

  const client = getClient()
  const me = getCurrentEmployee()
  const objectQuery = createQuery()

  // The card is a snapshot of the event it was opened with. Answering writes the copy, and without
  // this the buttons kept their old state until the card was reopened - which reads as "the click
  // does nothing". The local value answers instantly, the query corrects it once the write lands.
  let current: RsvpStatus | undefined = object.rsvp
  let liveSummary: RsvpSummary | undefined = object.rsvpSummary
  $: objectQuery.query(object._class, { _id: object._id }, (r) => {
    const found = r.shift() as Event | undefined
    // A virtual occurrence has a generated `_id` and is never found: its own answer stands.
    if (found === undefined) return
    current = found.rsvp
    liveSummary = found.rsvpSummary
  })

  // The organiser holds the master; everyone else holds their own copy and answers in it.
  $: isOrganiser = object.access === AccessLevel.Owner
  // The organiser is a participant but never answers - counting them leaves one pending forever.
  // `getCurrentEmployee` already answers with the person ref, so it is compared as is.
  $: invited = object.participants.filter((it) => it !== me).length
  $: pending = rsvpPending(invited, liveSummary)
  // Answering only makes sense for a person the event is actually for.
  $: isInvited = object.participants.includes(me)

  async function answer (rsvp: RsvpStatus): Promise<void> {
    const previous = current
    current = rsvp
    try {
      // A virtual occurrence has a generated `_id` - a plain update would go nowhere.
      if (object._class === calendar.class.ReccuringInstance) {
        await updateReccuringInstance({ rsvp }, object as ReccuringInstance)
      } else {
        await client.update(object, { rsvp })
      }
    } catch (err) {
      current = previous
      setPlatformStatus(unknownError(err))
    }
  }

  const answers: Array<[RsvpStatus, IntlString]> = [
    ['accepted', calendar.string.Going],
    ['tentative', calendar.string.Maybe],
    ['declined', calendar.string.NotGoing]
  ]
</script>

{#if isOrganiser}
  {#if invited > 0}
    <div class="flex-row-center flex-gap-2 rsvp-summary" class:rsvp-indent={indent}>
      {#if (liveSummary?.accepted ?? 0) > 0}
        <span>{liveSummary?.accepted} <Label label={calendar.string.RsvpAccepted} /></span>
      {/if}
      {#if (liveSummary?.declined ?? 0) > 0}
        <span>{liveSummary?.declined} <Label label={calendar.string.RsvpDeclined} /></span>
      {/if}
      {#if (liveSummary?.tentative ?? 0) > 0}
        <span>{liveSummary?.tentative} <Label label={calendar.string.RsvpTentative} /></span>
      {/if}
      {#if pending > 0}
        <span class="content-darker-color">{pending} <Label label={calendar.string.RsvpPending} /></span>
      {/if}
    </div>
  {/if}
{:else if isInvited}
  <div class="flex-row-center flex-gap-2" class:rsvp-indent={indent}>
    <Label label={calendar.string.WillYouAttend} />
    {#each answers as [status, label]}
      <Button
        {label}
        kind={current !== status ? 'regular' : status === 'declined' ? 'dangerous' : 'primary'}
        size="small"
        on:click={() => {
          void answer(status)
        }}
      />
    {/each}
  </div>
{/if}

<style lang="scss">
  // Every other row of the event card starts after its icon column: an icon of `small` size plus the
  // `flex-gap-1` gap. The answer row has no icon of its own, so the same offset is kept as padding.
  .rsvp-indent {
    padding-left: 1.25rem;
  }

  .rsvp-summary {
    font-size: 0.75rem;
    color: var(--theme-content-color);
  }
</style>
