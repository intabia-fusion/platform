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
  // Row markup of a Menu item that has a hint or an accent label, which the product Menu has no props for
  export let label: string
  export let description: string | undefined = undefined
  export let hint: string | undefined = undefined
  export let accent: boolean = false
</script>

<span class="row">
  <span class="text">
    <span class="label" class:accent>{label}</span>
    {#if description !== undefined}<span class="description">{description}</span>{/if}
  </span>
  {#if hint !== undefined}<span class="hint">{hint}</span>{/if}
</span>

<style lang="scss">
  .row {
    display: flex;
    flex-grow: 1;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-1);
    min-width: 0;
    font-size: 0.875rem;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .accent {
    color: var(--primary-button-default);
  }
  .description,
  .hint {
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
  }
</style>
