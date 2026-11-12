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
  Asks before evicting a meeting from a room: a scheduled meeting names the room it happens in, and a
  room hosts one meeting at a time. Closes with `true` when the newcomer takes the room over.
-->
<script lang="ts">
  import { Label, Modal } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import love from '../plugin'

  export let roomName: string

  const dispatch = createEventDispatcher()
</script>

<Modal
  label={love.string.RoomBusy}
  type="type-popup"
  width="x-small"
  okLabel={love.string.TakeOverRoom}
  okAction={() => dispatch('close', true)}
  canSave={true}
  showCancelButton={true}
  onCancel={() => dispatch('close', false)}
>
  <div class="message">
    <Label label={love.string.RoomBusyText} params={{ room: roomName }} />
  </div>
</Modal>

<style lang="scss">
  .message {
    padding: var(--spacing-2) var(--spacing-3) var(--spacing-3);
    line-height: 1.25rem;
  }
</style>
