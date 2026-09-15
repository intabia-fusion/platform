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
  import { MessageViewer } from '@hcengineering/presentation'
  import { highlightMarkup, isEmptyMarkup, jsonToMarkup, markupToJSON } from '@hcengineering/text-core'
  import ui, { ModernButton, resizeObserver } from '@hcengineering/ui'
  import { Markup } from '@hcengineering/core'

  import { matchedTerms, splitHighlight } from '../../../search/highlight'

  export let markup: Markup
  export let fragments: string[] = []

  /** Five lines of `line-height: 1.25rem`. */
  const COLLAPSED_HEIGHT = 100

  let expanded = false
  let overflows = false

  function measure (el: Element): void {
    overflows = el.getBoundingClientRect().height > COLLAPSED_HEIGHT + 1
  }

  $: if (!isEmptyMarkup(markup)) expanded = false

  $: matched = matchedTerms(fragments)
  $: highlighted = highlight(markup, matched)

  function highlight (markup: Markup, matched: string[]): Markup | undefined {
    if (isEmptyMarkup(markup)) return undefined
    try {
      return jsonToMarkup(highlightMarkup(markupToJSON(markup), matched))
    } catch (err: any) {
      console.error('failed to highlight message markup', err)
      return markup
    }
  }

  $: parts = fragments.map((f) => splitHighlight(f))
</script>

{#if highlighted !== undefined}
  <div class="snippet markup">
    <div
      class="body"
      class:collapsed={overflows && !expanded}
      style:max-height={expanded ? null : `${COLLAPSED_HEIGHT}px`}
    >
      <div use:resizeObserver={measure}>
        <MessageViewer message={highlighted} preview />
      </div>
    </div>
    {#if overflows}
      <div class="toggle">
        <ModernButton
          label={expanded ? ui.string.ShowLess : ui.string.ShowMore}
          kind="tertiary"
          size="extra-small"
          inheritFont
          noFocus
          on:click={(e) => {
            e.stopPropagation()
            expanded = !expanded
          }}
        />
      </div>
    {/if}
  </div>
{:else if parts.length > 0}
  <span class="snippet">
    {#each parts as fragment, i}
      {#if i > 0}<span class="ellipsis">…</span>{/if}
      {#each fragment as part}
        {#if part.marked}<mark>{part.text}</mark>{:else}{part.text}{/if}
      {/each}
    {/each}
  </span>
{/if}

<style lang="scss">
  .snippet {
    color: var(--theme-content-color);
    word-break: break-word;
  }

  .markup {
    position: relative;
    font-size: 0.875rem;
    :global(.text-markup-view .overflow-label) {
      overflow: visible;
      white-space: normal;
      word-break: break-word;
    }

    .body {
      padding: 0 0.25rem;
      margin: 0 -0.25rem;
    }

    .body.collapsed {
      overflow: hidden;
      mask-image: linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent);
      -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent);
    }

    .toggle {
      margin-top: 0.25rem;
      font-size: 0.75rem;
    }

    :global(p),
    :global(ul),
    :global(ol),
    :global(blockquote) {
      margin: 0;
    }

    :global(ul),
    :global(ol) {
      padding-left: 1.125rem;
    }

    :global(li) {
      margin: 0;
    }

    :global(.text-markup-view mark) {
      background-color: var(--tag-nuance-SunshineBackground);
      color: inherit;
      border-radius: 0.1875rem;
      padding: 0.0625rem 0.125rem;
      margin: -0.0625rem -0.125rem;
    }
  }

  .ellipsis {
    color: var(--theme-darker-color);
    padding: 0 0.25rem;
  }

  mark {
    background-color: var(--tag-nuance-SunshineBackground);
    color: inherit;
    border-radius: 0.1875rem;
    padding: 0.0625rem 0.125rem;
    margin: -0.0625rem -0.125rem;
  }
</style>
