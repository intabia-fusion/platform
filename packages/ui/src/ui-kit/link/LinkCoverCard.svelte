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
  import { createEventDispatcher } from 'svelte'

  import { nonEmpty, webUrl } from './link'
  import SiteIcon from './SiteIcon.svelte'
  import SiteTile from './SiteTile.svelte'

  export let url: string | undefined = undefined
  export let host: string
  export let title: string
  export let image: string | undefined = undefined
  // Kept lit while its menu is open, so it is clear which card the menu is for.
  export let highlighted: boolean = false

  const dispatch = createEventDispatcher<{ open: undefined, contextmenu: MouseEvent }>()

  // Addresses, not flags: another picture on the same card loads on its own.
  let broken: string | undefined
  let shown: string | undefined

  $: picture = nonEmpty(image) != null && image !== broken ? image : undefined
</script>

<div
  class="link-cover-card"
  class:highlighted
  role="button"
  tabindex="0"
  on:click={() => dispatch('open')}
  on:keydown={(e) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    dispatch('open')
  }}
  on:contextmenu={(e) => dispatch('contextmenu', e)}
>
  <div class="cover">
    {#if picture != null}
      <img
        src={picture}
        alt=""
        class:shown={shown === picture}
        loading="lazy"
        referrerpolicy="no-referrer"
        on:load={() => (shown = picture)}
        on:error={() => (broken = picture)}
      />
    {:else}
      <SiteTile {host} />
    {/if}
  </div>

  <div class="info">
    <span class="site">
      <SiteIcon {host} />
      <span class="host"><slot name="site">{host}</slot></span>
      <slot name="extra" />
    </span>
    <a class="title" href={webUrl(url)} title={url} target="_blank" rel="noopener noreferrer" on:click|stopPropagation>
      <slot name="title">{title}</slot>
    </a>
    <div class="body"><slot /></div>
    <div class="footer"><slot name="footer" /></div>
  </div>
</div>

<style lang="scss">
  .link-cover-card {
    // The cover sits inside the card on its own corners, so the edge never runs along its colour.
    --card-pad: 0.375rem;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    padding: var(--card-pad);
    border: 1px solid color-mix(in srgb, var(--global-ui-BorderColor) 50%, transparent);
    border-radius: calc(var(--small-BorderRadius) + var(--card-pad));
    cursor: pointer;
    transition:
      box-shadow 0.15s ease,
      border-color 0.15s ease;

    // The hover look alone is too faint to find the card the keys are on.
    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }

    &:hover,
    &.highlighted,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--theme-caption-color) 6%, var(--global-ui-BorderColor));
      box-shadow:
        0 0.0625rem 0.125rem color-mix(in srgb, var(--global-popover-ShadowColor) 40%, transparent),
        0 0.125rem 0.375rem color-mix(in srgb, var(--global-popover-ShadowColor) 30%, transparent);
    }
  }

  .cover {
    aspect-ratio: 1.91;
    overflow: hidden;
    border-radius: var(--small-BorderRadius);
    background-color: color-mix(in srgb, var(--theme-caption-color) 4%, transparent);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 0.2s ease;

      &.shown {
        opacity: 1;
      }
    }
  }

  .info {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    gap: 0.25rem;
    padding: 0.5rem 0.375rem 0.375rem;
    min-width: 0;
  }

  .site {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }

  .host,
  .title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .title {
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--theme-caption-color);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  // Two lines held even for a shorter text, so the footers of a row line up.
  .body {
    min-height: 2.5rem;
    min-width: 0;
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: var(--theme-content-color);
  }

  .footer {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
    min-width: 0;
    margin-top: auto;
    padding-top: 0.375rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);

    &:empty {
      display: none;
    }
  }
</style>
