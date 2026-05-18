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
  import { Room } from '@hcengineering/love'
  import { Ref, WithLookup } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { tooltip, Icon, getPlatformColorForTextDef, themeStore } from '@hcengineering/ui'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'

  import love from '../plugin'
  import { getRoomName } from '../utils'

  export let value: Ref<Room> | WithLookup<Room> | undefined
  export let object: Room | undefined = undefined
  export let kind: 'list' | 'list-header' | undefined = undefined
  export let accent: boolean = false
  export let inline: boolean = false

  const dispatch = createEventDispatcher()

  let room: Room | undefined
  $: room = typeof value === 'object' ? value : object

  const roomQuery = createQuery()
  $: if (room === undefined && typeof value === 'string') {
    roomQuery.query(love.class.Room, { _id: value }, (res) => {
      room = res[0]
    })
  } else {
    roomQuery.unsubscribe()
  }

  let roomName: string = ''
  $: if (room !== undefined) {
    void getRoomName(room).then((name) => {
      roomName = name
    })
  } else {
    roomName = ''
  }

  $: if (kind === 'list-header' && room !== undefined) {
    dispatch('accent-color', getPlatformColorForTextDef(room._id, $themeStore.dark))
  }
</script>

{#if room && roomName}
  {#if kind === 'list-header'}
    <span class="flex-presenter" use:tooltip={{ label: getEmbeddedLabel(roomName) }} class:fs-bold={accent}>
      <div class="icon">
        <Icon icon={love.icon.Love} size={'small'} />
      </div>
      <span class="overflow-label">{roomName}</span>
    </span>
  {:else}
    <span class="overflow-label" use:tooltip={{ label: getEmbeddedLabel(roomName) }}>{roomName}</span>
  {/if}
{/if}

<style lang="scss">
  .flex-presenter {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>
