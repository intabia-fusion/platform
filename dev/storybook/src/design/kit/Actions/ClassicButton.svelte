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
  // Button of the settings and form pages: the product Button (antiButton), 28/32/36 px high
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import ui, { Button } from '@hcengineering/ui'

  import { productIcon } from '../productIcon'
  import type { IconName } from '../types'

  export let kind: 'regular' | 'primary' | 'dangerous' | 'ghost' | 'icon' = 'regular'
  export let size: 'small' | 'medium' | 'large' = 'medium'
  export let icon: IconName | undefined = undefined
  export let label: string | undefined = undefined
  // 20 draws a medium icon
  export let iconSize: 16 | 20 = 16
  export let disabled: boolean = false
  // Dropdown chevron after the label (ignored when the slot has content)
  export let menu: boolean = false

  $: asset = productIcon(icon)
</script>

{#if $$slots.default}
  <Button {kind} {size} {disabled}>
    <svelte:fragment slot="content"><slot /></svelte:fragment>
  </Button>
{:else}
  <Button
    {kind}
    {size}
    {disabled}
    icon={asset}
    iconProps={{ size: iconSize === 20 ? 'medium' : 'small' }}
    iconRight={menu ? ui.icon.CaretDownFill : undefined}
    iconRightProps={{ size: 'small' }}
    gap={menu ? 'large' : 'medium'}
    label={label !== undefined && label !== '' ? getEmbeddedLabel(label) : undefined}
  />
{/if}
