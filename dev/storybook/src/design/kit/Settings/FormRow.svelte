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
  // Label on the left, the control in the slot on the right
  export let label: string
  export let hint: string | undefined = undefined
  export let alignTop: boolean = false
</script>

<div class="kit-form-row" class:top={alignTop}>
  <div class="label">
    <span class="text">{label}</span>
    {#if hint !== undefined}<span class="hint">{hint}</span>{/if}
  </div>
  <slot />
</div>

<style>
  .kit-form-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 2rem;
  }
  .top {
    align-items: flex-start;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    width: 13.75rem;
    flex-shrink: 0;
  }
  .text {
    color: var(--theme-content-color);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
</style>
