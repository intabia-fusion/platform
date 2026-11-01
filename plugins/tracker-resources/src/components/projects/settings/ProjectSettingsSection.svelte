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
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'

  // No title: a section embedded in a dialog
  export let title: IntlString | undefined = undefined
  export let description: IntlString | undefined = undefined
  export let descriptionParams: Record<string, any> = {}
  // Tables take the whole content width; forms keep the narrow column
  export let wide: boolean = false
</script>

<div class="section" class:wide>
  {#if title !== undefined}
    <div class="head">
      <span class="title"><Label label={title} /></span>
      {#if description !== undefined}
        <span class="description"><Label label={description} params={descriptionParams} /></span>
      {/if}
    </div>
  {/if}
  <slot />
</div>

<style lang="scss">
  .section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    max-width: 47.5rem;

    &.wide {
      max-width: none;
    }
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .description {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
</style>
