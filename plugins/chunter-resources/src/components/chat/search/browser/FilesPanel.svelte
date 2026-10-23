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
  import { AttachmentFormat } from '@hcengineering/attachment'
  import type { SearchSortOrder } from '@hcengineering/core'
  import { sharedPlayback } from '@hcengineering/ui/kit'

  import {
    BrowserTab,
    createAttachmentSearchStore,
    placeFilters,
    tabFormats,
    type AttachmentRow,
    type AttachmentTab
  } from '../../../../search/attachments'
  import { groupByMonth, justifyRows, mediaRatio, placeJustified, shownOrder } from '../../../../search/browser'
  import type { ChatSearchFilters } from '../../../../search/types'
  import { openAttachmentViewer, openMessage } from '../../../../search/viewer'
  import chunter from '../../../../plugin'
  import VirtualRow from '../VirtualRow.svelte'
  import AudioCard from './AudioCard.svelte'
  import BrowserList from './BrowserList.svelte'
  import FileCard from './FileCard.svelte'
  import FormatFilter from './FormatFilter.svelte'
  import MediaTile from './MediaTile.svelte'
  import MonthHeader from './MonthHeader.svelte'

  export let tab: AttachmentTab
  export let value: string = ''
  export let filters: ChatSearchFilters = {}
  export let formats: AttachmentFormat[] = []
  export let searchContent: boolean = false
  export let sort: SearchSortOrder = 'date-desc'

  // Formats whose text the index extracts, so a match outside the name can only be inside the file.
  const TEXT_FORMATS = new Set<AttachmentFormat>([
    AttachmentFormat.Pdf,
    AttachmentFormat.Document,
    AttachmentFormat.Spreadsheet,
    AttachmentFormat.Presentation,
    AttachmentFormat.Text
  ])
  const MEDIA_GAP = 4
  // A lazy audio card holds this much room until it renders.
  const AUDIO_CARD_HEIGHT = 170

  // Created with what is already chosen, so the first page is the only request on opening.
  const store = createAttachmentSearchStore(tab, {
    search: value,
    filters: { ...filters, formats, content: searchContent },
    sort
  })
  // The chat's player: a recording here stops one playing in a message, and back.
  const playback = sharedPlayback()

  let mediaWidth = 0

  $: store.setFilters({ ...filters, formats, content: searchContent })

  // Assigned only when the results change: a loading flag alone must not lay the list out again.
  let rows: AttachmentRow[] = []
  $: if ($store.results !== rows) rows = $store.results
  $: groups = groupByMonth(rows, shownOrder($store.sort, $store.searched.trim()))
  $: mediaRowHeight = mediaWidth < 480 ? 110 : mediaWidth < 900 ? 140 : 170
  $: mediaLayouts =
    tab === BrowserTab.Media
      ? new Map(
        groups.map((group) => [
          group.key,
          placeJustified(
            justifyRows(group.rows, (r) => mediaRatio(r.row), mediaWidth, mediaRowHeight, MEDIA_GAP),
            MEDIA_GAP
          )
        ])
      )
      : undefined
  $: options =
    tab === BrowserTab.Files
      ? [{ key: 'content', label: chunter.string.SearchInFileText, on: searchContent }]
      : undefined
  // The same rules the request goes by: a filter that changes nothing does not count.
  $: filtered = formats.length > 0 || Object.keys(placeFilters(filters)).length > 0
  // Matches of the shown rows: the toggle may already have changed while they reload.
  $: contentSearched = $store.filters.content === true

  function inContent (row: AttachmentRow, content: boolean, search: string): boolean {
    return content && search !== '' && row.nameHighlight == null && TEXT_FORMATS.has(row.format)
  }

  function openViewer (index: number): void {
    openAttachmentViewer(store, index)
  }
</script>

<BrowserList
  {store}
  {tab}
  bind:value
  bind:filters
  bind:sort
  {options}
  {filtered}
  measured={tab !== BrowserTab.Media || mediaWidth > 0}
  on:options={(e) => {
    searchContent = e.detail.content === true
  }}
  let:search
>
  <FormatFilter
    slot="filters"
    available={tabFormats(tab)}
    selected={formats}
    on:change={(e) => {
      formats = e.detail
    }}
  />
  {#if tab === BrowserTab.Media}
    <div class="measure" bind:clientWidth={mediaWidth} />
  {/if}
  {#each groups as group (group.key)}
    <section class="group" class:media={tab === BrowserTab.Media}>
      <MonthHeader month={group.month} />
      {#if tab === BrowserTab.Files}
        <div class="cards">
          {#each group.rows as { row, index } (row._id)}
            <FileCard
              {row}
              inContent={inContent(row, contentSearched, search)}
              on:open={() => {
                openViewer(index)
              }}
              on:message={() => openMessage(row.message)}
            />
          {/each}
        </div>
      {:else if tab === BrowserTab.Media}
        {@const layout = mediaLayouts?.get(group.key)}
        {#if layout != null}
          <div class="justified" style:height={`${layout.height}px`}>
            {#each layout.items as { item, x, y, width, height } (item.row._id)}
              <div
                class="media-picture"
                style:transform={`translate(${x}px, ${y}px)`}
                style:width={`${width}px`}
                style:height={`${height}px`}
              >
                <MediaTile
                  row={item.row}
                  named={search !== ''}
                  on:open={() => {
                    openViewer(item.index)
                  }}
                  on:message={() => openMessage(item.row.message)}
                />
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="cards audio">
          {#each group.rows as { row } (row._id)}
            <VirtualRow estimatedHeight={AUDIO_CARD_HEIGHT}>
              <AudioCard {row} {playback} on:message={() => openMessage(row.message)} />
            </VirtualRow>
          {/each}
        </div>
      {/if}
    </section>
  {/each}
</BrowserList>

<style lang="scss">
  .group {
    display: flex;
    flex-direction: column;

    // A month of tiles far off screen skips layout and paint; not for cards, whose hover shadow it would clip.
    &.media {
      content-visibility: auto;
      contain-intrinsic-size: auto 30rem;
      // Room for the shadow of the edge tiles, which the containment would cut off.
      margin: 0 -0.375rem -0.375rem;
      padding: 0 0.375rem 0.375rem;
    }
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
    gap: 0.875rem;
    padding-bottom: 0.5rem;

    &.audio {
      grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));

      // The lazy wrapper stretches, so cards in a row share a height.
      > :global(div) {
        display: flex;
        flex-direction: column;
      }
    }
  }

  .measure {
    width: 100%;
    height: 0;
  }

  .justified {
    position: relative;
  }

  .media-picture {
    position: absolute;
    top: 0;
    left: 0;
    border-radius: var(--small-BorderRadius);
    // A soft shadow lifts a white screenshot off a white page; the tile inside clips the picture.
    box-shadow:
      0 0.0625rem 0.25rem var(--global-popover-ShadowColor),
      0 0 1px var(--global-popover-ShadowColor);
  }

  @media (max-width: 480px) {
    // Two file cards a row on a phone: one would be a screenful of tint. A recording needs the width.
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    .cards.audio {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
