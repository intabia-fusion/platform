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
  let lastId = 0
</script>

<script lang="ts" generics="Value = string">
  import { createEventDispatcher } from 'svelte'

  import Radio from './Radio.svelte'
  import type { RadioGroupEvents, RadioGroupItem, RadioGroupProps, RadioKind, RadioSize } from './types'

  type $$Props = RadioGroupProps<Value>
  type $$Events = RadioGroupEvents<Value>

  export let items: Array<RadioGroupItem<Value>>
  export let selected: Value | null | undefined = undefined
  export let name: string | undefined = undefined
  export let kind: RadioKind | undefined = undefined
  export let size: RadioSize | undefined = undefined
  export let disabled: boolean = false
  export let readonly: boolean = false
  export let error: boolean = false

  const dispatch = createEventDispatcher<{ change: Value }>()
  // One name per group: the browser keeps one option checked and moves between them with arrows.
  const generatedName = `radio-group-${++lastId}`

  $: resolvedSize = size ?? 'medium'

  function select (value: Value): void {
    selected = value
    dispatch('change', value)
  }
</script>

<div
  class="radio-group radio-group--{resolvedSize}"
  role="radiogroup"
  aria-disabled={disabled || undefined}
  aria-readonly={(readonly && !disabled) || undefined}
  aria-invalid={error || undefined}
  {...$$restProps}
>
  {#each items as item}
    <Radio
      name={name ?? generatedName}
      value={item.value}
      group={selected}
      label={item.label}
      labelParams={item.labelParams}
      {kind}
      size={resolvedSize}
      disabled={disabled || item.disabled === true}
      {readonly}
      {error}
      on:change={(event) => {
        select(event.detail)
      }}
    />
  {/each}
</div>

<style lang="scss">
  .radio-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;

    &--medium {
      gap: var(--spacing-1);
    }
    &--small {
      gap: var(--spacing-0_75);
    }
  }
</style>
