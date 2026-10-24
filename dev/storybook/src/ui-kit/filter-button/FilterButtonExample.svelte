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
  import type { FilterButtonActiveFilter, FilterButtonCategory } from '@hcengineering/ui/kit'
  import { FilterButton, type FilterButtonKind, type FilterButtonSize } from '@hcengineering/ui/kit'

  export let categories: FilterButtonCategory[]
  export let activeFilters: FilterButtonActiveFilter[] = []
  export let kind: FilterButtonKind | undefined = undefined
  export let size: FilterButtonSize | undefined = undefined
  export let disabled: boolean = false
</script>

<!-- Holds the filters the way a place does: the button only reports the new list. -->
<div class="filter-example">
  <FilterButton
    {categories}
    {activeFilters}
    {kind}
    {size}
    {disabled}
    on:change={(event) => {
      activeFilters = event.detail
    }}
  />
  <span class="filter-example__state">
    {activeFilters.length === 0
      ? 'no filters'
      : activeFilters.map((it) => `${it.categoryId}: ${it.optionId}`).join(', ')}
  </span>
</div>

<style lang="scss">
  .filter-example {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);

    &__state {
      font-size: 0.75rem;
      color: var(--theme-dark-color);
    }
  }
</style>
