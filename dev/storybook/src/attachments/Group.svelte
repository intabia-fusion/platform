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
  export let title: string
  export let note: string = ''
  export let direction: 'row' | 'column' = 'row'
</script>

<section class="group">
  <h3 class="title">{title}</h3>
  {#if note !== ''}<p class="note">{note}</p>{/if}
  <div class="items {direction}"><slot /></div>
</section>

<style lang="scss">
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--theme-dark-color);
  }

  .note {
    margin: 0;
    max-width: 48rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }

  .items {
    display: flex;
    gap: 1rem 1.5rem;

    &.row {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    &.column {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
