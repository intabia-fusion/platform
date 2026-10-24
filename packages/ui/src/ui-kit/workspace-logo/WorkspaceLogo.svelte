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
  import { translateCB } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'

  import ui from '../../plugin'
  import type { WorkspaceLogoProps, WorkspaceLogoSize } from './types'

  type $$Props = WorkspaceLogoProps

  export let name: string
  export let src: string | undefined = undefined
  export let srcset: string | undefined = undefined
  export let size: WorkspaceLogoSize | undefined = undefined
  export let notify: boolean = false

  $: resolvedSize = size ?? 'small'
  $: letter = Array.from(name.trim())[0]?.toUpperCase() ?? ''

  // A picture that fails to load falls back to the letter; a new address gets another try.
  let failed: string | undefined
  $: picture = src !== undefined && src !== '' && src !== failed ? src : undefined

  // An image role hides its children from assistive tech, so the dot is announced in the name.
  let activity: string | undefined
  let translation = 0
  $: translateActivity(notify, $languageStore === '' ? undefined : $languageStore)
  $: accessibleName = notify && activity !== undefined ? `${name}, ${activity}` : name

  function translateActivity (show: boolean, language: string | undefined): void {
    const request = ++translation
    if (!show) {
      activity = undefined
      return
    }
    translateCB(ui.string.NewActivity, {}, language, (text) => {
      if (request === translation) activity = text
    })
  }
</script>

<span class="workspace-logo workspace-logo--{resolvedSize}" role="img" aria-label={accessibleName}>
  {#if picture !== undefined}
    <img
      class="workspace-logo__image"
      src={picture}
      {srcset}
      alt=""
      on:error={() => {
        failed = picture
      }}
    />
  {:else}
    <span class="workspace-logo__letter" aria-hidden="true">{letter}</span>
  {/if}
  {#if notify}
    <span class="workspace-logo__dot" />
  {/if}
</span>

<style lang="scss">
  .workspace-logo {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    aspect-ratio: 1;
    // The letter would put the baseline inside and the picture at the bottom: in a line both sit the same.
    vertical-align: middle;

    &--small {
      --_radius: var(--small-BorderRadius);
      height: var(--global-small-Size);
      font-size: 1rem;
      line-height: 1.5rem;
    }
    &--extra-small {
      --_radius: var(--extra-small-BorderRadius);
      height: var(--global-extra-small-Size);
      font-size: 0.875rem;
      line-height: 1.25rem;
    }

    &__image,
    &__letter {
      width: 100%;
      height: 100%;
      border-radius: var(--_radius);
    }
    &__image {
      object-fit: cover;
    }
    &__letter {
      display: flex;
      justify-content: center;
      align-items: center;
      font-weight: 500;
      color: var(--button-accent-LabelColor);
      background-color: var(--kit-button-primary-BackgroundColor);
      user-select: none;
    }
    &__dot {
      position: absolute;
      // Clear of the corner at every size: the gap separates the dot from a picture of the same tone without a cut-out ring.
      top: -0.5rem;
      right: -0.375rem;
      width: 0.5rem;
      height: 0.5rem;
      background-color: var(--button-negative-BackgroundColor);
      border-radius: 50%;
    }
  }
</style>
