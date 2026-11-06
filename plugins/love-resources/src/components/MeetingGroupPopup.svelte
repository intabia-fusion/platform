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
  Merge selected meetings into a named group. The list is intentionally a plain checkbox list: the
  meetings are few and the price of a wrong pick is a re-drop, not data.
-->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import love, { type PermanentMeeting } from '@hcengineering/love'
  import { Card, createQuery, getClient } from '@hcengineering/presentation'
  import { CheckBox, EditBox, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { createMeetingGroup } from '../groups'

  const dispatch = createEventDispatcher()
  const client = getClient()

  let name = ''
  let meetings: PermanentMeeting[] = []
  let selected = new Set<Ref<PermanentMeeting>>()

  const query = createQuery()
  $: void query.query(love.class.PermanentMeeting, {}, (res) => {
    meetings = res
  })

  function toggle (id: Ref<PermanentMeeting>, on: boolean): void {
    if (on) selected.add(id)
    else selected.delete(id)
    selected = selected
  }

  async function save (): Promise<void> {
    const chosen = meetings.filter((it) => selected.has(it._id))
    if (name.trim() === '' || chosen.length === 0) return
    await createMeetingGroup(client, name.trim(), chosen)
    dispatch('close')
  }
</script>

<Card
  label={love.string.CreateMeetingGroup}
  okAction={save}
  canSave={name.trim() !== '' && selected.size > 0}
  on:close={() => dispatch('close')}
>
  <div class="flex-col gap-2 p-4" style="min-width: 28rem">
    <Label label={love.string.GroupName} />
    <EditBox bind:value={name} kind="regular" autoFocus focusIndex={1} />
    <div class="flex-col gap-1 mt-2" style="max-height: 20rem; overflow: auto">
      {#each meetings as meeting (meeting._id)}
        <div class="flex-row-center gap-2">
          <CheckBox
            checked={selected.has(meeting._id)}
            kind="primary"
            on:value={(ev) => toggle(meeting._id, ev.detail)}
          />
          <span class="overflow-label">{meeting.name}</span>
        </div>
      {/each}
    </div>
  </div>
</Card>
