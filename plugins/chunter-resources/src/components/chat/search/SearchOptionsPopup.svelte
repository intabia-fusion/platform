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
  import { Label, Toggle, resizeObserver } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import chunter from '../../../plugin'
  import type { ChatSearchFilters } from '../../../search/types'

  export let filters: ChatSearchFilters = {}

  const dispatch = createEventDispatcher()

  let hasAttachment = filters.hasAttachment === true
  let includeTranscription = filters.includeTranscription === true

  function toggle (patch: Partial<ChatSearchFilters>): void {
    dispatch('update', patch)
  }
</script>

<div class="hulyPopup-container options" use:resizeObserver={() => dispatch('changeContent')}>
  <button
    class="option"
    on:click={() => {
      hasAttachment = !hasAttachment
      toggle({ hasAttachment: hasAttachment ? true : undefined })
    }}
  >
    <span class="label"><Label label={chunter.string.SearchFilterHasAttachment} /></span>
    {#key hasAttachment}
      <Toggle on={hasAttachment} />
    {/key}
  </button>
  <button
    class="option"
    on:click={() => {
      includeTranscription = !includeTranscription
      toggle({ includeTranscription: includeTranscription ? true : undefined })
    }}
  >
    <span class="label"><Label label={chunter.string.SearchFilterIncludeTranscription} /></span>
    {#key includeTranscription}
      <Toggle on={includeTranscription} />
    {/key}
  </button>
</div>

<style lang="scss">
  .options {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: var(--spacing-1);
    min-width: 16rem;
  }

  .option {
    display: flex;
    width: 100%;
    border: none;
    background: transparent;
    font: inherit;
    text-align: left;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    padding: var(--spacing-0_5) var(--spacing-1);
    border-radius: var(--small-BorderRadius);
    cursor: pointer;

    &:hover {
      background-color: var(--theme-bg-accent-color);
    }
  }

  .label {
    color: var(--theme-caption-color);
  }
</style>
