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
  import Icon from '../../components/Icon.svelte'
  import type { IconComponent, IconSize } from '../../types'
  import type { ButtonShape } from '../button/types'
  import type { IconBoxProps, IconBoxSize } from './types'

  type $$Props = IconBoxProps

  export let icon: IconComponent
  export let iconProps: Record<string, any> = {}
  export let iconSize: IconSize | undefined = undefined
  export let size: IconBoxSize | undefined = undefined
  export let shape: ButtonShape | undefined = undefined
  export let color: string | undefined = undefined

  $: resolvedSize = size ?? 'small'
  // The shares of FileBadge: pulled towards the theme's text, the palette's own dark shades are lost on a dark theme.
  $: hue = color == null ? undefined : getPlatformColorByName(color, $themeStore.dark)?.color
  $: tintColor =
    hue == null ? undefined : `color-mix(in srgb, ${hue} ${$themeStore.dark ? '62%' : '82%'}, var(--theme-caption-color))`
  $: tintBackground = hue == null ? undefined : `color-mix(in srgb, ${hue} ${$themeStore.dark ? '26%' : '14%'}, transparent)`
</script>

<!-- Decorative: the object kind is already named by the field or title next to it. -->
<span
  class="icon-box icon-box--{resolvedSize}"
  class:icon-box--round={shape === 'round'}
  class:icon-box--tinted={hue != null}
  style:--_tint-color={tintColor}
  style:--_tint-background={tintBackground}
  aria-hidden="true"
>
  <Icon {icon} {iconProps} size={iconSize ?? 'small'} />
</span>

<style lang="scss">
  // Same look as a secondary icon-only button, so it lines up with buttons around it.
  .icon-box {
    display: inline-flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
    aspect-ratio: 1;
    border: 1px solid var(--kit-button-secondary-BorderColor, transparent);
    background-color: var(--kit-button-secondary-BackgroundColor);
    color: var(--kit-button-subtle-IconColor);

    &--large {
      height: var(--global-large-Size);
      border-radius: var(--medium-BorderRadius);
    }
    &--medium {
      height: var(--global-medium-Size);
      border-radius: var(--medium-BorderRadius);
    }
    &--small {
      height: var(--global-small-Size);
      border-radius: var(--small-BorderRadius);
    }
    &--extra-small {
      height: var(--global-extra-small-Size);
      border-radius: var(--extra-small-BorderRadius);
    }
    &--tinted {
      border-color: transparent;
      background-color: var(--_tint-background);
      color: var(--_tint-color);
    }
    // Always square, so a circle at every size, unlike the button radius token.
    &--round {
      border-radius: 50%;
    }
  }
</style>
