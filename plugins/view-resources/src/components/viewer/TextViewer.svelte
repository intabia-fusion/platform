<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import type { Blob, Markup, Ref } from '@hcengineering/core'
  import { fileBadge, getFileUrl, MessageViewer } from '@hcengineering/presentation'
  import { jsonToMarkup } from '@hcengineering/text'
  import { markdownToMarkup } from '@hcengineering/text-markdown'
  import ui, { Label, Loading, Scroller } from '@hcengineering/ui'
  import { FileNoPreview, IconButton } from '@hcengineering/ui/kit'

  import view from '../../plugin'
  import IconCode from '../icons/Code.svelte'
  import IconPicture from '../icons/Picture.svelte'
  import TextFlow from './TextFlow.svelte'

  export let value: Ref<Blob>
  export let name: string
  export let contentType: string = ''
  export let fit: boolean = false
  export let frame: boolean = true
  export let scroll: boolean = true

  $: scroller = scroll ? Scroller : TextFlow

  // Rendering a multi-MB string in a single <pre> freezes the browser.
  // Show only the tail by default (logs are usually read from the end).
  const MAX_CHARS = 256 * 1024
  // Laying out a larger JSON would stall the tab longer than reading it as is.
  const MAX_JSON_CHARS = 2 * 1024 * 1024
  // Parsing grows faster than the file and every node is a component: past this it would stall the tab.
  const MAX_MARKDOWN_CHARS = 100 * 1024

  $: void fetchFile(value, name)

  let loading = true
  let failed = false
  let fullText: string | undefined = undefined
  let showFull = false
  let fromStart = false

  $: text =
    fullText === undefined
      ? undefined
      : showFull || fullText.length <= MAX_CHARS
        ? fullText
        : fromStart
          ? fullText.slice(0, MAX_CHARS)
          : fullText.slice(fullText.length - MAX_CHARS)

  $: truncated = fullText !== undefined && fullText.length > MAX_CHARS

  // A slower answer for the previous file must not overwrite the current one.
  let request = 0

  async function fetchFile (value: Ref<Blob>, name: string): Promise<void> {
    const current = ++request
    loading = true
    showFull = false

    const res = await fetch(getFileUrl(value, name)).catch(() => undefined)
    const raw = res?.ok === true ? await res.text().catch(() => undefined) : ''
    if (current !== request) return
    // The text of an error answer is not the file's; an empty sheet would pass for an empty file.
    failed = res?.ok !== true || raw === undefined
    const json = isJson(name, res?.headers.get('content-type'))
    const body = json ? pretty(raw ?? '') : (raw ?? '')
    fromStart = json || isMarkdown(name, contentType)
    fullText = body

    loading = false
  }

  $: markdownFile = isMarkdown(name, contentType)
  $: tooLarge = markdownFile && fullText !== undefined && fullText.length > MAX_MARKDOWN_CHARS
  $: markdown = fullText !== undefined && markdownFile && !tooLarge ? toMarkup(fullText) : undefined
  // The choice is remembered, so those who always read the source do not switch each time.
  const SOURCE_KEY = 'viewer.markdown.source'
  let source = readSource()

  $: cut = truncated && !showFull
  // In bytes, as a file size reads: a character of Cyrillic text takes two.
  $: cutParams = cut ? { shown: kilobytes(text), total: kilobytes(fullText) } : undefined

  function kilobytes (text: string | undefined): number {
    return Math.round(new TextEncoder().encode(text ?? '').length / 1024)
  }

  function readSource (): boolean {
    try {
      return localStorage.getItem(SOURCE_KEY) === 'true'
    } catch {
      return false
    }
  }

  function setSource (value: boolean, e: MouseEvent): void {
    source = value
    // A mouse click leaves no focus ring behind; Enter or Space keeps it, to show where the keyboard is.
    if (e.detail > 0) (e.currentTarget as HTMLElement | null)?.blur()
    try {
      localStorage.setItem(SOURCE_KEY, String(source))
    } catch {}
  }

  function isMarkdown (name: string, type: string): boolean {
    return /\.(md|markdown)$/i.test(name) || type.includes('markdown')
  }

  function toMarkup (text: string): Markup | undefined {
    try {
      return jsonToMarkup(markdownToMarkup(text, { refUrl: 'ref://', imageUrl: '' }))
    } catch {
      return undefined
    }
  }

  function isJson (name: string, type: string | null | undefined): boolean {
    return name.toLowerCase().endsWith('.json') || (type ?? '').includes('json')
  }

  function pretty (text: string): string {
    if (text.length > MAX_JSON_CHARS) return text
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }
</script>

{#if loading}
  <div class="flex-center w-full h-full clear-mins">
    <Loading />
  </div>
{:else if failed}
  <div class="flex-center w-full h-full clear-mins">
    <FileNoPreview
      {name}
      badge={fileBadge(name, contentType)}
      url={getFileUrl(value, name)}
      label={ui.string.PreviewFailed}
    />
  </div>
{:else}
  <div class="container w-full" class:h-full={scroll} class:fit class:frame class:flow={!scroll}>
    {#if markdown !== undefined}
      <div class="mode">
        <IconButton
          icon={IconPicture}
          kind="ghost"
          size="small"
          iconSize="medium"
          selected={!source}
          tooltip={{ label: view.string.MarkdownPreview, direction: 'bottom' }}
          on:click={(e) => {
            setSource(false, e)
          }}
        />
        <IconButton
          icon={IconCode}
          kind="ghost"
          size="small"
          iconSize="medium"
          selected={source}
          tooltip={{ label: view.string.MarkdownSource, direction: 'bottom' }}
          on:click={(e) => {
            setSource(true, e)
          }}
        />
      </div>
    {/if}
    {#if markdown !== undefined && !source}
      <svelte:component this={scroller} padding="3rem 2rem 0" bottomPadding="2rem">
        <div class="markdown select-text"><MessageViewer message={markdown} /></div>
      </svelte:component>
    {:else}
      <svelte:component
        this={scroller}
        padding={markdown !== undefined ? '3rem 1rem 0' : '1rem 1rem 0'}
        bottomPadding="1rem"
      >
        {#if tooLarge}
          <div class="mark top">
            <Label label={view.string.MarkdownTooLarge} params={{ limit: Math.round(MAX_MARKDOWN_CHARS / 1024) }} />
          </div>
        {/if}
        {#if cut && !fromStart}
          <div class="mark top">
            <Label label={view.string.TextShownLast} params={cutParams} />
            <button type="button" on:click={() => (showFull = true)}><Label label={ui.string.ShowMore} /></button>
          </div>
        {/if}
        <pre class="select-text">{text}</pre>
        {#if cut && fromStart}
          <div class="mark bottom">
            <Label label={view.string.TextShownFirst} params={cutParams} />
            <button type="button" on:click={() => (showFull = true)}><Label label={ui.string.ShowMore} /></button>
          </div>
        {/if}
      </svelte:component>
    {/if}
  </div>
{/if}

<style lang="scss">
  .container {
    position: relative;
    max-height: 80vh;
    overflow: hidden;

    &.frame {
      border: 1px solid var(--theme-button-border);
      border-radius: 0.25rem;
    }

    &.fit {
      min-height: 100%;
    }
    &:not(.fit) {
      height: 80vh;
      min-height: 20rem;
    }

    &.flow {
      height: auto;
      max-height: none;
      min-height: 0;
    }
  }

  // Floats in the corner on a solid plate: the lines scrolled beneath go under it, not through it.
  .mode {
    position: absolute;
    top: 0.75rem;
    right: 1.25rem;
    z-index: 2;
    border-radius: calc(var(--small-BorderRadius) + 0.125rem);
    background-color: var(--viewer-bg, var(--theme-popup-color));
    display: flex;
    gap: 0.125rem;
    padding: 0.125rem;
    --button-tertiary-IconColor: var(--viewer-icon, var(--theme-content-color));
    --button-tertiary-icon-IconColor: var(--viewer-icon, var(--theme-content-color));
  }

  // A line of a document, not of the window: long lines are hard to follow.
  // Full width, not the width of its content: a code line or a table would push it past a narrow screen.
  .markdown {
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
    font-size: 0.9375rem;
    line-height: 1.5;
    color: var(--theme-text-primary-color);
    overflow-wrap: anywhere;

    // Wide tables and code lines scroll on their own; the text around them keeps the screen's width.
    :global(table.proseTable),
    :global(pre) {
      display: block;
      max-width: 100%;
      overflow-x: auto;
    }
  }

  // Long lines wrap: a sideways scroll loses the start of every line.
  pre {
    font-family: var(--mono-font);
    white-space: pre-wrap !important;
    overflow-wrap: anywhere;
    font-size: 0.8125rem;
  }

  .mark {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);

    &.top {
      margin-bottom: 0.75rem;
    }
    &.bottom {
      margin-top: 0.75rem;
    }
    &::before,
    &::after {
      content: '';
      flex: 1;
      min-width: 1rem;
      border-top: 1px dashed var(--theme-divider-color);
    }

    button {
      display: inline;
      margin: 0;
      padding: 0;
      border: none;
      font: inherit;
      font-weight: 500;
      color: var(--theme-link-color);
      background: none;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }
  }
</style>
