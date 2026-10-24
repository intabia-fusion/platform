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
  import { ShowMore, type ShowMoreProps } from '@hcengineering/ui/kit'

  export let props: Partial<ShowMoreProps> = {}
  export let paragraphs: number = 6
  export let width: string = '24rem'

  const text =
    'The release moves the editor to the new toolbar, keeps drafts between sessions and fixes the cursor jumping to the end of a paragraph after a paste.'
</script>

<div class="show-more-example" style:width>
  <ShowMore {...props} {...$$restProps} on:toggle>
    {#each Array.from({ length: paragraphs }, (_, i) => i + 1) as row}
      <p class="show-more-example__text">{row}. {text}</p>
    {/each}
  </ShowMore>
</div>

<style lang="scss">
  .show-more-example {
    padding: var(--spacing-1_5);
    background-color: var(--theme-panel-color);
    border-radius: var(--small-BorderRadius);

    &__text {
      margin: 0 0 var(--spacing-1);
      color: var(--global-primary-TextColor);
    }
  }
</style>
