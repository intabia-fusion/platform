<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { type Blob, type Ref } from '@hcengineering/core'
  import { getFileUrl } from '@hcengineering/presentation'
  import ui, { Button, Loading, Scroller } from '@hcengineering/ui'

  export let value: Ref<Blob>
  export let name: string
  export let fit: boolean = false

  // Rendering a multi-MB string in a single <pre> freezes the browser.
  // Show only the tail by default (logs are usually read from the end).
  const MAX_CHARS = 256 * 1024

  $: void fetchFile(value, name)

  let loading = true
  let fullText: string | undefined = undefined
  let truncated = false
  let showFull = false

  $: text =
    fullText === undefined
      ? undefined
      : showFull || fullText.length <= MAX_CHARS
        ? fullText
        : fullText.slice(fullText.length - MAX_CHARS)

  async function fetchFile (value: Ref<Blob>, name: string): Promise<void> {
    loading = true
    showFull = false

    const src = getFileUrl(value, name)
    const res = await fetch(src)
    fullText = await res.text()
    truncated = fullText.length > MAX_CHARS

    loading = false
  }
</script>

{#if loading}
  <div class="flex-center w-full h-full clear-mins">
    <Loading />
  </div>
{:else}
  <div class="container h-full w-full" class:fit>
    <Scroller horizontal padding="0 1rem">
      {#if truncated && !showFull}
        <div class="truncate-bar">
          <span>
            Showing last {Math.round(MAX_CHARS / 1024)} KB of {Math.round((fullText?.length ?? 0) / 1024)} KB
          </span>
          <Button label={ui.string.ShowMore} kind="link" size="small" on:click={() => (showFull = true)} />
        </div>
      {/if}
      <pre class="select-text">{text}</pre>
    </Scroller>
  </div>
{/if}

<style lang="scss">
  .container {
    max-height: 80vh;

    overflow: hidden;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.25rem;

    &.fit {
      min-height: 100%;
    }
    &:not(.fit) {
      height: 80vh;
      min-height: 20rem;
    }
  }

  pre {
    font-family: var(--mono-font);
    white-space: pre !important;
    word-wrap: nowrap !important;
    font-size: 0.8125rem;
  }

  .truncate-bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    color: var(--theme-dark-color);
    font-size: 0.8125rem;
    background-color: var(--theme-popup-color);
  }
</style>
