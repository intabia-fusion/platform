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
  // An icon that failed is not asked again this session, whichever card links to its site.
  const failed = new Set<string>()
</script>

<script lang="ts">
  import { themeStore } from '@hcengineering/theme'

  import Icon from '../../components/Icon.svelte'
  import ui from '../../plugin'
  import { nonEmpty } from './utils'

  export let src: string | undefined = undefined
  export let host: string | undefined = undefined
  export let size: 'small' | 'large' = 'small'

  let broken: string | undefined
  let loaded: string | undefined

  $: url = nonEmpty(src) ?? (nonEmpty(host) != null ? `https://${host}/favicon.ico` : undefined)
  $: missing = url == null || url === broken || failed.has(url)
  $: shown = url != null && url === loaded

  function fail (): void {
    if (url == null) return
    failed.add(url)
    broken = url
  }
</script>

{#if !missing}
  <!-- Site icons are drawn for a light page: a dark one would swallow most of them. -->
  <span class="site-icon {size}" class:plate={$themeStore.dark && shown && size === 'small'} aria-hidden="true">
    <img
      src={url}
      class:shown
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      on:load={() => (loaded = url)}
      on:error={fail}
    />
  </span>
{:else}
  <Icon icon={ui.icon.Globe} {size} />
{/if}

<style lang="scss">
  .site-icon {
    display: inline-flex;
    flex-shrink: 0;
    overflow: hidden;

    &.small {
      width: 1rem;
      height: 1rem;
      border-radius: 0.25rem;
    }

    &.large {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--medium-BorderRadius);
    }

    &.plate {
      padding: 0.0625rem;
      background-color: color-mix(in srgb, var(--white-color) 92%, transparent);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0;
      transition: opacity 0.2s ease;

      &.shown {
        opacity: 1;
      }
    }
  }
</style>
