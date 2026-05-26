<!--
// Copyright © 2026 Intabia Fusion.
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
  import { MeetingMinutes } from '@hcengineering/love'
  import { DocNavLink } from '@hcengineering/view-resources'
  import { tooltip } from '@hcengineering/ui'
  import { getEmbeddedLabel } from '@hcengineering/platform'

  import { rooms } from '../stores'
  import { getRoomName } from '../utils'

  export let value: MeetingMinutes

  $: room = $rooms.find((it) => it._id === value.roomId)

  let roomName: string = ''
  $: if (room) {
    void getRoomName(room).then((name) => {
      roomName = name
    })
  }
</script>

{#if room}
  <div class="hulyHeader-titleGroup">
    <div class="title inline-flex min-w-6">
      <DocNavLink object={room} noUnderline>
        <span use:tooltip={{ label: getEmbeddedLabel(roomName) }}>{roomName}</span>
      </DocNavLink>
    </div>
    <div class="title disabled">/</div>
    <div class="title not-active">{value.name}</div>
  </div>
{/if}
