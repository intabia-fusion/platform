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
  import ui, { getPlatformColorDef, themeStore } from '@hcengineering/ui'
  import { IconBox, TypingIndicator } from '@hcengineering/ui/kit'

  import AvatarInstance from '../../../../../plugins/contact-resources/src/components/AvatarInstance.svelte'

  export let kind: 'channel' | 'private' | 'direct' = 'channel'
  export let typing: boolean = false
  export let online: boolean = false
  export let initials: string = 'ЗА'
  export let color: number = 4
  // The navigator background around a single icon, as in the panel.
  export let framed: boolean = true

  let element: HTMLElement

  $: colorDef = getPlatformColorDef(color, $themeStore.dark)
</script>

<span class:typing-indicator-example={framed}>
  <TypingIndicator {typing}>
    {#if kind === 'direct'}
      <!-- The product avatar: rounded square, presence dot in its own stacking context. -->
      <span class="typing-indicator-example__avatar">
        <AvatarInstance
          bind:element
          url={undefined}
          srcset={undefined}
          displayName={initials}
          size="x-small"
          color={colorDef}
          withStatus
        />
        <span class="hulyAvatar-statusMarker x-small" class:online class:offline={!online} />
      </span>
    {:else}
      <IconBox icon={kind === 'private' ? ui.icon.Lock : ui.icon.Hash} size="extra-small" />
    {/if}
  </TypingIndicator>
</span>

<style lang="scss">
  .typing-indicator-example {
    display: inline-flex;
    padding: var(--spacing-1) var(--spacing-1_5);
    background-color: var(--theme-navpanel-color);
    border-radius: var(--small-BorderRadius);
  }
  .typing-indicator-example__avatar {
    position: relative;
    z-index: 0;
    display: flex;
  }
</style>
