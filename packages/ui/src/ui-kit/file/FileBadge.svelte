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
  import { themeStore } from '@hcengineering/theme'

  import { getPlatformColorByName } from '../../colors'
  import IconFile from '../../components/icons/File.svelte'

  export let label: string = ''
  export let color: string | undefined = undefined
  // `row` is square like the photo thumbnails next to it.
  export let variant: 'menu' | 'title' | 'row' | 'mini' | 'small' | 'medium' | 'large' | 'sheet' | 'tint' = 'medium'

  $: hue = color == null ? undefined : getPlatformColorByName(color, $themeStore.dark)?.color
  // Pulled towards the theme's text: the palette's own dark shades are lost on a dark theme.
  $: textColor =
    hue == null
      ? undefined
      : `color-mix(in srgb, ${hue} ${$themeStore.dark ? '62%' : '82%'}, var(--theme-caption-color))`
  // A backdrop is a large area, so it takes a fainter share of the hue than a badge.
  $: share = variant === 'tint' ? ($themeStore.dark ? '12%' : '9%') : $themeStore.dark ? '26%' : '14%'
  $: background = hue == null ? undefined : `color-mix(in srgb, ${hue} ${share}, transparent)`
  $: text = label.slice(0, 5).toUpperCase()
  let glyph: 'small' | 'medium' | 'large'
  $: glyph = variant === 'large' ? 'large' : variant === 'medium' || variant === 'sheet' ? 'medium' : 'small'
</script>

<div
  class="badge {variant}"
  class:colored={hue != null}
  style:--badge-background={background}
  style:--badge-color={textColor}
  aria-hidden="true"
>
  {#if variant !== 'tint'}
    {#if text !== ''}
      <span class="text" class:long={text.length > 4}>{text}</span>
    {:else}
      <IconFile size={glyph} />
    {/if}
  {/if}
</div>

<style lang="scss">
  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--badge-color, var(--theme-dark-color));
    background-color: var(--badge-background, color-mix(in srgb, var(--theme-caption-color) 8%, transparent));
    border-radius: var(--medium-BorderRadius);
    font-weight: 700;
    letter-spacing: 0.03em;
    user-select: none;

    &.medium {
      width: 2.5rem;
      height: 2.5rem;
      font-size: 0.6875rem;
    }

    &.small {
      width: 2rem;
      height: 2rem;
      font-size: 0.5625rem;
      border-radius: var(--small-BorderRadius);
    }

    &.row {
      width: 1.5rem;
      height: 1.5rem;
      font-size: 0.5rem;
      letter-spacing: 0.02em;
      border-radius: var(--extra-small-BorderRadius);
    }

    &.menu {
      width: 1.625rem;
      height: 1rem;
      font-size: 0.5rem;
      letter-spacing: 0.02em;
      border-radius: var(--extra-small-BorderRadius);
    }

    &.title {
      height: 1.5rem;
      min-width: 1.5rem;
      padding: 0 0.375rem;
      font-size: 0.625rem;
      border-radius: var(--extra-small-BorderRadius);
    }

    &.mini {
      height: 1rem;
      padding: 0 0.25rem;
      font-size: 0.5rem;
      border-radius: var(--extra-small-BorderRadius);
    }

    &.large {
      width: 3.75rem;
      height: 3.75rem;
      font-size: 0.875rem;
      border-radius: var(--large-BorderRadius);

      // A ring in the badge's own colour; a neutral one has none.
      &.colored {
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--badge-color) 18%, transparent);
      }
    }

    &.sheet {
      width: 100%;
      height: 100%;
      font-size: 0.6875rem;
      border-radius: var(--small-BorderRadius);
    }

    &.tint {
      border-radius: 0;
    }
  }

  // A five-letter label ("VOICE") in badges sized for four.
  .text.long {
    font-size: 0.875em;
    letter-spacing: 0;
  }
</style>
