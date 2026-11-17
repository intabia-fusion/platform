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
  import Icon from '../Icon.svelte'

  // Condition as in the filter bar: attribute, operator, value
  export let attribute: string
  export let operator: string
  // Without a value the slot holds icons or avatars
  export let value: string | undefined = undefined
  // A condition of a settings table has no remove cross
  export let plain: boolean = false
  // Tinted chip of board settings: one block without dividers
  export let condition: boolean = false
</script>

<div class="kit-filter-chip" class:condition>
  <span class="part">{attribute}</span>
  <span class="part dark">{operator}</span>
  <span class="part last"
    >{#if value !== undefined}{value}{:else}<slot />{/if}</span
  >
  {#if !plain}<span class="remove"><Icon name="x" size={12} color="var(--theme-darker-color)" /></span>{/if}
</div>

<style lang="scss">
  .kit-filter-chip {
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    height: 1.75rem;
    font-size: 0.8125rem;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
    overflow: hidden;
  }
  .part {
    display: inline-flex;
    align-items: center;
    height: 100%;
    padding: 0 0.5rem;
    color: var(--theme-caption-color);
    background-color: var(--theme-button-default);
    border-right: 1px solid var(--theme-divider-color);

    &.dark {
      color: var(--theme-dark-color);
    }
    &.last {
      border-right: none;
    }
  }
  .condition {
    height: 2rem;
    padding: 0.125rem;
    font-size: 0.875rem;
    border: none;
    border-radius: 0.25rem;
    background-color: color-mix(in srgb, var(--primary-edit-border-color) 10%, transparent);

    .part {
      gap: 0.25rem;
      padding: 0 0.375rem 0 0.5rem;
      background: none;
      border-right: none;
      border-radius: 0.25rem;
    }
  }
  .remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.625rem;
  }
</style>
