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
  import { IconError, Label } from '@hcengineering/ui'
  import type { ImportWarning } from '@hcengineering/workflow'

  import plugin from '../../../plugin'

  export let warnings: ImportWarning[] = []
</script>

{#if warnings.length > 0}
  <div class="warnings flex-col flex-gap-2">
    <div class="warnings-banner flex-row-center flex-gap-2">
      <IconError size="small" />
      <div class="flex-col">
        <span class="font-medium-14"><Label label={plugin.string.ImportWarningsTitle} /></span>
        <span class="font-regular-12 mt-0-5 text-secondary">
          <Label label={plugin.string.ImportWarningsDescription} />
        </span>
      </div>
    </div>
    <ul class="warnings-list font-regular-12">
      {#each warnings as warning}
        <li><Label label={warning.message} params={warning.params} /></li>
      {/each}
    </ul>
  </div>
{/if}

<style lang="scss">
  .warnings-banner {
    padding: 0.625rem 0.875rem;
    border-radius: var(--border-radius-1, 0.5rem);
    background-color: var(--global-warning-highlight-BackgroundColor, rgba(227, 98, 9, 0.08));
    border: 1px solid var(--global-warning-BorderColor, rgba(227, 98, 9, 0.25));
    color: var(--global-warning-TextColor, #e36209);
    box-sizing: border-box;
    width: 100%;
  }

  .warnings-list {
    margin: 0;
    padding-left: 1.25rem;
    max-height: 12rem;
    overflow-y: auto;
    color: var(--theme-content-color);

    li + li {
      margin-top: 0.25rem;
    }
  }
</style>
