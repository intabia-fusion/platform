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
  import type { IconName } from '../types'

  export let label: string | undefined = undefined
  export let value: string | undefined = undefined
  export let placeholder: string | undefined = undefined
  export let icon: IconName | undefined = undefined
  // Select-like field with a chevron
  export let menu: boolean = false
  export let error: boolean = false
  export let size: 'narrow' | 'medium' | 'wide' = 'medium'
  export let lines: number = 1
</script>

<div class="kit-input">
  {#if label !== undefined}<span class="label">{label}</span>{/if}
  <div
    class="field {size}"
    class:error
    class:multiline={lines > 1}
    style:min-height={lines > 1 ? `${lines * 1.5 + 0.5}rem` : undefined}
  >
    {#if icon !== undefined}<Icon name={icon} color="var(--theme-dark-color)" />{/if}
    <span class="text" class:placeholder={value === undefined || value === ''}>{value ?? placeholder ?? ''}</span>
    {#if menu}<Icon name="chevronD" size={14} color="var(--theme-dark-color)" />{/if}
  </div>
</div>

<style lang="scss">
  .kit-input {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .label {
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .field {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    box-sizing: border-box;
    min-height: 2rem;
    padding: 0 0.625rem;
    background-color: var(--input-BackgroundColor);
    border: 1px solid var(--input-BorderColor);
    border-radius: 0.375rem;

    &.narrow {
      width: 10rem;
    }
    &.medium {
      width: 15rem;
    }
    &.wide {
      width: 26.25rem;
    }
    &.error {
      border-color: var(--input-error-BorderColor);
    }
    &.multiline {
      align-items: flex-start;
      padding-top: 0.375rem;
    }
  }
  .text {
    flex: 1;
    min-width: 0;
    color: var(--input-TextColor);

    &.placeholder {
      color: var(--input-PlaceholderColor);
    }
  }
</style>
