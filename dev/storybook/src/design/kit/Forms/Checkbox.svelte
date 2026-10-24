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

  export let checked: boolean = false
  export let label: string | undefined = undefined
</script>

<div class="kit-checkbox">
  <div class="box" class:checked>
    {#if checked}<Icon name="tick" size={12} color="#fff" />{/if}
  </div>
  {#if label !== undefined}<span class="label">{label}</span>{/if}
</div>

<style lang="scss">
  .kit-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .box {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 1rem;
    height: 1rem;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.25rem;

    &.checked {
      background-color: var(--primary-button-default);
      border-color: transparent;
    }
  }
  .label {
    color: var(--theme-caption-color);
  }
</style>
