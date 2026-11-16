<!--
// Copyright © 2022-2023 Hardcore Engineering Inc.
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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { themeStore, tooltip } from '@hcengineering/ui'
  import { formatDuration, formatDurationRoundedHours, isDurationRounded } from '@hcengineering/tracker'

  export let id: string | undefined = undefined
  export let kind: 'link' | undefined = undefined
  export let value: number
  export let accent: boolean = false
  export let roundedHours: boolean = false

  $: exactLabel = formatDuration(value, $themeStore.language)
  $: label = roundedHours ? formatDurationRoundedHours(value, $themeStore.language) : exactLabel
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<span
  {id}
  class:link={kind === 'link'}
  class:fs-bold={accent}
  class:rounded={roundedHours && isDurationRounded(value)}
  on:click
  use:tooltip={{ label: getEmbeddedLabel(exactLabel) }}
>
  {label}
</span>

<style lang="scss">
  .rounded {
    text-decoration-line: underline;
    text-decoration-style: dotted;
    text-underline-offset: 0.125rem;
  }
  .link {
    white-space: nowrap;

    font-size: 0.8125rem;
    color: var(--theme-content-color);
    cursor: pointer;

    &:hover {
      color: var(--theme-caption-color);
      text-decoration: underline;
    }
    &:active {
      color: var(--theme-accent-color);
    }
  }
</style>
