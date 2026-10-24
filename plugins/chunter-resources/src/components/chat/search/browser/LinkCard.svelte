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
  import { hasOnlyLinks, markupToJSON } from '@hcengineering/text-core'
  import { closeTooltip, showPopup, tooltip } from '@hcengineering/ui'
  import { LinkCoverCard } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  import type { LinkRow } from '../../../../search/attachments'
  import { shortUrl } from '../../../../search/browser'
  import { markTerms, matchedTerms } from '../../../../search/highlight'
  import { showItemMenu } from '../../../../search/menu'
  import HighlightedText from '../HighlightedText.svelte'
  import LinksPopup from './LinksPopup.svelte'
  import MarkedText from './MarkedText.svelte'
  import RowAuthor from './RowAuthor.svelte'
  import RowPlace from './RowPlace.svelte'

  export let row: LinkRow

  const dispatch = createEventDispatcher()

  let menuOpen = false

  // A mention or a link inside the text opens itself, not the message as well.
  function keepOwnClick (e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('a, .antiMention') !== null) e.stopPropagation()
  }

  $: link = row.links[0]
  // A preview may carry the page's own address after a redirect, or none on an older one: with one link it is that link's.
  $: preview = row.previews.find((it) => it.url === link.url) ?? (row.links.length === 1 ? row.previews[0] : undefined)
  $: host = link.host
  $: title = preview?.title ?? shortUrl(link.url)
  $: more = row.links.length - 1
  $: allLinks = { links: row.links, previews: row.previews }
  // The words the index matched, marked in the full texts: its fragments cut them short.
  $: terms = [...matchedTerms(row.highlights), ...row.extraTerms]
  // A message that only shares the link would repeat the title: the page's description says more.
  $: onlyLinks = hasOnlyLinks(markupToJSON(row.markup))
  $: text = onlyLinks ? (preview?.description ?? '') : ''
</script>

<LinkCoverCard
  url={link.url}
  {host}
  {title}
  image={preview?.image}
  highlighted={menuOpen}
  on:open={() => dispatch('message')}
  on:contextmenu={(e) => {
    menuOpen = true
    showItemMenu(e.detail, {
      link: link.url,
      message: () => dispatch('message'),
      onClose: () => (menuOpen = false)
    })
  }}
>
  <MarkedText slot="site" text={markTerms(host, terms)} />
  <svelte:fragment slot="extra">
    {#if more > 0}
      <!-- A button too, so the other links are reachable without a pointer that hovers. -->
      <button
        class="more"
        use:tooltip={{ component: LinksPopup, props: allLinks }}
        on:click|stopPropagation={(e) => {
          // The same list as the tooltip, which would otherwise stay under it.
          closeTooltip()
          showPopup(LinksPopup, allLinks, e.currentTarget)
        }}
      >
        +{more}
      </button>
    {/if}
  </svelte:fragment>
  <MarkedText slot="title" text={markTerms(title, terms)} />
  {#if !onlyLinks}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="message" on:click={keepOwnClick}>
      <HighlightedText markup={row.markup} fragments={row.highlights} lines={2} expandable={false} />
    </div>
  {:else if text !== '' && text !== title}
    <span class="text"><MarkedText text={markTerms(text, terms)} /></span>
  {/if}
  <svelte:fragment slot="footer">
    <RowAuthor {row} date={row.createdOn} />
    <RowPlace {row} />
  </svelte:fragment>
</LinkCoverCard>

<style lang="scss">
  .message {
    min-width: 0;
  }

  .text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }

  .more {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    height: 1.25rem;
    margin-left: auto;
    padding: 0 0.375rem;
    border: none;
    border-radius: var(--extra-small-BorderRadius);
    font: inherit;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    color: var(--theme-dark-color);
    background-color: color-mix(in srgb, var(--theme-caption-color) 7%, transparent);
    cursor: pointer;

    &:hover {
      color: var(--theme-caption-color);
      background-color: color-mix(in srgb, var(--theme-caption-color) 12%, transparent);
    }
  }
</style>
