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
<script lang="ts" context="module">
  // Asked once per session for a site, not by every card that links to it.
  const noTouchIcon = new Set<string>()
  const noFavicon = new Set<string>()
</script>

<script lang="ts">
  import { themeStore } from '@hcengineering/theme'

  import { getPlatformColorForTextDef } from '../../colors'

  export let host: string

  // The address, not a flag: a tile handed another site fades in anew.
  let loaded: string | undefined

  $: name = host.startsWith('www.') ? host.slice(4) : host
  $: hue = getPlatformColorForTextDef(name, $themeStore.dark).color
  $: touchFailed = noTouchIcon.has(host)
  $: faviconFailed = noFavicon.has(host)
  $: stage = pickStage(host, touchFailed, faviconFailed)
  $: touchUrl = `https://${host}/apple-touch-icon.png`
  $: faviconUrl = `https://${host}/favicon.ico`

  // The touch icon is drawn big; a 16-32px favicon would blur scaled up.
  function pickStage (host: string, touchFailed: boolean, faviconFailed: boolean): 'touch' | 'favicon' | 'letter' {
    if (host === '') return 'letter'
    if (!touchFailed) return 'touch'
    return faviconFailed ? 'letter' : 'favicon'
  }
</script>

<span
  class="site-tile"
  style:--tile-color={`color-mix(in srgb, ${hue} ${$themeStore.dark ? '62%' : '78%'}, var(--theme-caption-color))`}
  style:--tile-background={`color-mix(in srgb, ${hue} ${$themeStore.dark ? '26%' : '16%'}, transparent)`}
  aria-hidden="true"
>
  {#if stage === 'touch'}
    <img
      class="touch"
      class:shown={loaded === touchUrl}
      src={touchUrl}
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      on:load={() => (loaded = touchUrl)}
      on:error={() => {
        noTouchIcon.add(host)
        touchFailed = true
      }}
    />
  {:else if stage === 'favicon'}
    <img
      class="favicon"
      class:shown={loaded === faviconUrl}
      src={faviconUrl}
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      on:load={() => (loaded = faviconUrl)}
      on:error={() => {
        noFavicon.add(host)
        faviconFailed = true
      }}
    />
  {:else}
    <span class="letter">{name.charAt(0).toUpperCase()}</span>
  {/if}
</span>

<style lang="scss">
  .site-tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--tile-color);
    background-color: var(--tile-background);
    user-select: none;
  }

  img {
    opacity: 0;
    transition: opacity 0.2s ease;

    &.shown {
      opacity: 1;
    }
  }

  .touch {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 0.875rem;
    object-fit: cover;
    box-shadow: 0 0.25rem 0.875rem -0.375rem var(--global-popover-ShadowColor);
  }

  .favicon {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: contain;
  }

  .letter {
    font-size: 3rem;
    font-weight: 600;
  }
</style>
