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
  Actions of the permanent meetings view. A group is a property of the list, not of a selection, so
  its button is always there: the dialog lists the meetings itself.
-->
<script lang="ts">
  import type { Ref, Space } from '@hcengineering/core'
  import ui, { Button, showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import love from '../plugin'
  import CreatePermanentMeetingPopup from './CreatePermanentMeetingPopup.svelte'
  import MeetingGroupPopup from './MeetingGroupPopup.svelte'

  // Sent by the view header; the form resolves its own space, so it only has to be accepted.
  export let space: Ref<Space> | undefined = undefined

  function createGroup (): void {
    showPopup(MeetingGroupPopup, {}, 'center')
  }

  function createMeeting (): void {
    // The only place that may create a meeting without a calendar series.
    showPopup(CreatePermanentMeetingPopup, { space, allowNoCalendar: true }, 'top')
  }
</script>

<Button icon={view.icon.List} label={love.string.CreateMeetingGroup} kind="secondary" on:click={createGroup} />
<Button icon={ui.icon.Plus} label={love.string.NewMeeting} kind="primary" on:click={createMeeting} />
