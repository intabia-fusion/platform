<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { getEmbeddedLabel } from '@intabiafusion/platform'
  import { Avatar, getPersonByPersonRefStore } from '@intabiafusion/contact-resources'
  import { tooltip, deviceOptionsStore as deviceInfo, checkAdaptiveMatching } from '@intabiafusion/ui'
  import { ParticipantInfo } from '@intabiafusion/love'
  import { formatName } from '@intabiafusion/contact'
  import ParticipantsList from './ParticipantsList.svelte'

  export let label: string
  export let participants: (ParticipantInfo & { onclick?: (e: MouseEvent) => void })[]
  export let active: boolean = false
  export let limit: number = 4

  $: overLimit = participants.length > limit
  $: adaptive = checkAdaptiveMatching($deviceInfo.size, 'md') || overLimit
  $: personByRefStore = getPersonByPersonRefStore(participants.map((p) => p.person))
</script>

{#if adaptive}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="hulyStatusBarButton"
    class:active
    use:tooltip={{ component: ParticipantsList, props: { items: participants }, direction: 'bottom' }}
    on:click
  >
    <span class="hulyStatusBarButton-label">{label}</span>
    <div class="hulyCombineAvatars-container">
      {#each participants.slice(0, limit) as participant, i (participant._id)}
        <div
          class="hulyCombineAvatar tiny"
          data-over={i === limit - 1 && overLimit ? `+${participants.length - limit + 1}` : undefined}
        >
          <Avatar
            name={$personByRefStore.get(participant.person)?.name ?? participant.name}
            size={'card'}
            person={$personByRefStore.get(participant.person)}
          />
        </div>
      {/each}
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="hulyStatusBarButton" class:active on:click>
    <span class="hulyStatusBarButton-label">{label}</span>
    <div class="hulyStatusBarButton-icons">
      {#each participants as participant (participant._id)}
        <div
          use:tooltip={{ label: getEmbeddedLabel(formatName(participant.name)), direction: 'bottom' }}
          on:click={participant.onclick}
        >
          <Avatar
            name={$personByRefStore.get(participant.person)?.name ?? participant.name}
            size={'card'}
            person={$personByRefStore.get(participant.person)}
          />
        </div>
      {/each}
    </div>
  </div>
{/if}
