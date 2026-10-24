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
  export let on: boolean = false
  export let label: string
  export let hint: string | undefined = undefined
</script>

<div class="kit-radio">
  <div class="dot" class:on />
  <div class="text">
    <span class="label">{label}</span>
    {#if hint !== undefined}<span class="hint">{hint}</span>{/if}
  </div>
</div>

<style lang="scss">
  .kit-radio {
    display: inline-flex;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .dot {
    flex-shrink: 0;
    box-sizing: border-box;
    width: 1rem;
    height: 1rem;
    border: 1px solid var(--theme-button-border);
    border-radius: 50%;

    &.on {
      border: 5px solid var(--primary-button-default);
    }
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .label {
    color: var(--theme-caption-color);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
</style>
