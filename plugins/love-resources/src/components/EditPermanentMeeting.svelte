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
  Panel header of a permanent meeting. The document, attachments and chat below it are rendered by
  the generic panel from `descriptionRef` and the collections, the same way a session gets them.
  The document is followed live, so a rename made here is the rename the panel shows.
-->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import type { PermanentMeeting } from '@hcengineering/love'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { CheckBox, EditBox, Label, showPopup } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { createEventDispatcher, onMount } from 'svelte'
  import love from '../plugin'
  import { joinMeetingBySession } from '../meetings'
  import RepeatEveryEditor from './RepeatEveryEditor.svelte'

  export let object: PermanentMeeting
  export let readonly: boolean = false

  const client = getClient()
  const dispatch = createEventDispatcher()

  let live: PermanentMeeting = object
  const query = createQuery(true)

  $: query.query(object._class, { _id: object._id }, (res) => {
    if (res.length > 0) live = res[0] as PermanentMeeting
  })

  let currentName = object.name
  let newName = object.name

  $: if (live.name !== currentName) {
    newName = live.name
    currentName = live.name
  }

  // The series created together with the meeting carries the same title: renaming one renames the
  // other, otherwise the planner and the meeting list keep showing the old name.
  async function changeName (): Promise<void> {
    const name = newName.trim()
    if (name === '' || name === live.name) return
    await client.diffUpdate(live, { name })
    const series = await client.findAll(calendar.class.Event, {
      [`${love.mixin.MeetingEventLink}.permanentMeeting`]: object._id
    } as any)
    for (const event of series) {
      if (event.title !== name) await client.update(event as Event, { title: name })
    }
  }

  // The period is edited here rather than in the attribute panel: it is stored in milliseconds and
  // reads as a number and a unit, which the panel cannot do without a model update. The value is
  // held locally as well, so the editor follows the click at once and not only the live document.
  let period: number | undefined = object.repeatEvery

  $: if (live.repeatEvery !== undefined && live.repeatEvery !== period) {
    period = live.repeatEvery
  }

  async function changeRepeatEvery (value: number): Promise<void> {
    period = value
    await client.diffUpdate(live, { repeatEvery: value })
  }

  onMount(() => {
    dispatch('open', { ignoreKeys: ['name', 'repeatEvery'] })
  })

  // The marked point in the information panel: it says the meeting is permanent and opens the same
  // window that created it, so settings are one click away from the card.
  function openSettings (): void {
    showPopup(love.component.PermanentMeetingForm, { object: live }, 'content')
  }
</script>

<div class="flex-row-center flex-between flex-gap-2 mb-4">
  <div class="title flex-grow">
    <EditBox
      disabled={readonly}
      placeholder={love.string.PermanentMeeting}
      bind:value={newName}
      on:change={changeName}
      focusIndex={1}
    />
  </div>
  <Button
    label={love.string.JoinMeeting}
    size="large"
    kind="primary"
    on:click={() => {
      void joinMeetingBySession(live._id, 'meeting')
    }}
  />
</div>

<div class="flex-row-center gap-1-5 mb-2">
  <CheckBox
    checked={true}
    kind="primary"
    on:value={() => {
      openSettings()
    }}
  />
  <span class="text-sm text-content-color cursor-pointer" on:click={openSettings} on:keydown={openSettings} role="button" tabindex="0">
    <Label label={love.string.PermanentMeeting} />
  </span>
</div>

<div class="flex-row-center gap-2 mb-4">
  <span class="text-sm text-content-color"><Label label={love.string.RepeatEvery} /></span>
  <RepeatEveryEditor value={period} onChange={changeRepeatEvery} readonly={readonly} />
</div>

<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--theme-caption-color);
  }
</style>
