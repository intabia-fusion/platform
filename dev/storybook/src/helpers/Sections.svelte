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
  import Matrix from './Matrix.svelte'
  import type { MatrixSection } from './matrix'

  export let sections: MatrixSection[]
</script>

<div class="sections">
  {#each sections as section}
    <section class="sections__item">
      <h3 class="sections__title">{section.title}</h3>
      <Matrix component={section.component} rows={section.rows} columns={section.columns} props={section.props} />
    </section>
  {/each}
</div>

<style lang="scss">
  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);

    &__title {
      margin: 0 0 var(--spacing-1) var(--spacing-2);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--theme-caption-color);
    }
  }
</style>
