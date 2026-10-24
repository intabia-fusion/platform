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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { BlankView, IconSearch, Label, tooltip } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  import chunter from '../../../plugin'
  import type { SearchFailure } from '../../../search/types'

  export let failure: SearchFailure
  export let inline: boolean = false

  const dispatch = createEventDispatcher<{ retry: undefined }>()

  // The error text is for whoever debugs it: shown on hover, not as the message.
  $: details = failure.kind === 'error' && failure.message !== '' ? failure.message : undefined
  $: hint = failure.kind === 'unavailable' ? chunter.string.SearchUnavailable : chunter.string.SearchFailedHint

  function retry (): void {
    dispatch('retry')
  }
</script>

{#if inline}
  <div class="failure">
    <span class="title" use:tooltip={details != null ? { label: getEmbeddedLabel(details) } : undefined}>
      <Label label={chunter.string.SearchFailed} />
    </span>
    <span class="hint"><Label label={hint} /></span>
    <div class="retry">
      <Button label={chunter.string.SearchRetry} kind="secondary" size="medium" on:click={retry} />
    </div>
  </div>
{:else}
  <!-- No error text here: on the whole place it would pop up over the retry button too. -->
  <div class="blank">
    <BlankView icon={IconSearch} header={chunter.string.SearchFailed} label={hint}>
      <Button label={chunter.string.SearchRetry} kind="secondary" size="medium" on:click={retry} />
    </BlankView>
  </div>
{/if}

<style lang="scss">
  // Without it the circle and the button touch the edges of the floating search panel.
  .blank {
    display: flex;
    box-sizing: border-box;
    height: 100%;
    padding: 2rem;
  }

  .failure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    text-align: center;
  }

  .title {
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--theme-caption-color);
  }

  .hint {
    max-width: 24rem;
    font-size: 0.8125rem;
    color: var(--theme-darker-color);
  }

  .retry {
    margin-top: 0.75rem;
  }
</style>
