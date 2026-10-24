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
<script lang="ts" generics="Id extends string = string">
  import { createEventDispatcher } from 'svelte'

  import type { IconSize } from '../../types'
  import Button from '../button/Button.svelte'
  import type { ButtonSize } from '../button/types'
  import type { ButtonGroupEvents, ButtonGroupItem, ButtonGroupKind, ButtonGroupProps } from './types'

  type $$Props = ButtonGroupProps<Id>
  type $$Events = ButtonGroupEvents<Id>

  export let items: Array<ButtonGroupItem<Id>>
  export let selected: Id | undefined = undefined
  export let allowDeselect: boolean | undefined = undefined
  export let kind: ButtonGroupKind | undefined = undefined
  export let size: ButtonSize | undefined = undefined
  export let iconSize: IconSize | undefined = undefined

  // Resolved here: an explicit undefined would reach Button and take its secondary large defaults.
  $: resolvedKind = kind ?? 'ghost'
  $: resolvedSize = size ?? 'small'

  const dispatch = createEventDispatcher<{ select: Id | null }>()

  function toggle (id: Id): void {
    if (selected === id && allowDeselect === false) return
    selected = selected === id ? undefined : id
    dispatch('select', selected ?? null)
  }
</script>

<div class="button-group" role="group" {...$$restProps}>
  {#each items as item (item.id)}
    <!-- Kept from the legacy group: tests and places find the toggles by this id. -->
    <Button
      id={`btnGID-${item.id}`}
      kind={resolvedKind}
      size={resolvedSize}
      icon={item.icon}
      {iconSize}
      label={item.label}
      labelParams={item.labelParams}
      tooltip={item.tooltip}
      disabled={item.disabled}
      selected={selected === item.id}
      on:click={() => {
        toggle(item.id)
      }}
    />
  {/each}
</div>

<style lang="scss">
  .button-group {
    display: flex;
    align-items: center;
    gap: var(--spacing-0_5);
  }
</style>
