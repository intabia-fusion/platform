<!--
//
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
<!--
  The caption row of the grouped list of meetings: the parameters the view shows, written the way the
  table header writes its columns (`antiTable th`). The list itself has no place for such a row, so the
  view draws it above the categories; the gear of the view edits exactly this list.
-->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import type { BuildModelKey, Viewlet } from '@hcengineering/view'
  import view from '@hcengineering/view'
  import { buildConfigLookup, getKeyLabel } from '@hcengineering/view-resources'
  import { onMount } from 'svelte'

  import love from '../plugin'

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let labels: Array<IntlString | undefined> = []

  // The geometry the captions copy from a row of the list: a row is a grid of columns once the view
  // sets their widths, and the captions are laid out over exactly the same ones.
  let template = ''
  let columnGap = '0px'
  let leftInset = '0px'
  // How far the rows of a section are rolled sideways: the captions follow them, column for column.
  let scrolled = 0

  let caption: HTMLDivElement | undefined = undefined
  let observer: ResizeObserver | undefined = undefined

  // A section rolls its own columns: the caption takes the offset of whichever section was scrolled.
  function onScroll (event: Event): void {
    const target = event.target as HTMLElement | null
    if (!target?.classList.contains('scroll')) return
    scrolled = target.scrollLeft
  }

  /** Scroll listeners of every horizontal scroller of the list, attached once. */
  function attachScrollers (container: HTMLElement): void {
    for (const scroller of Array.from(container.querySelectorAll<HTMLElement>('.scroll'))) {
      if (scroller.dataset.captionScroll === 'true') continue
      if (scroller.scrollWidth <= scroller.clientWidth) continue
      scroller.dataset.captionScroll = 'true'
      scroller.addEventListener('scroll', onScroll)
    }
  }

  /**
   * A row is the source of truth for the columns: its template is what the widths of the view resolve
   * to, and the container of a row may be inset from the list, so the offset is taken as well.
   */
  function syncWithRows (): boolean {
    const container = caption?.closest<HTMLElement>('.list-container') ?? null
    if (caption === undefined || container == null) return false
    const row = container.querySelector<HTMLElement>('.listGrid')
    if (row == null) return false
    const style = getComputedStyle(row)
    if (style.display !== 'grid' || style.gridTemplateColumns === 'none') return false
    template = style.gridTemplateColumns
    columnGap = style.columnGap
    attachScrollers(container)
    // The grid of a row starts inside its own padding and border, not at the edge of the row.
    const rowInset =
      row.getBoundingClientRect().left -
      caption.getBoundingClientRect().left +
      (parseFloat(style.paddingLeft) || 0) +
      (parseFloat(style.borderLeftWidth) || 0)
    leftInset = `${Math.max(0, Math.round(rowInset))}px`
    return true
  }

  // The rows come with the documents of the view, and a reloaded preference rebuilds them: until one of
  // them is a grid, there is nothing to copy, so the sync retries instead of giving up after one tick.
  function scheduleSync (): void {
    let attempts = 0
    const tick = (): void => {
      attempts++
      if (syncWithRows() || attempts > 25) return
      setTimeout(tick, 120)
    }
    requestAnimationFrame(tick)
  }

  $: if (labels.length > 0) {
    template = ''
    scheduleSync()
  }

  onMount(() => {
    observer = new ResizeObserver(() => {
      syncWithRows()
    })
    const container = caption?.closest<HTMLElement>('.list-container') ?? undefined
    if (caption !== undefined) observer.observe(container ?? caption)
    return () => {
      observer?.disconnect()
      container?.querySelectorAll('.scroll').forEach((it) => it.removeEventListener('scroll', onScroll))
    }
  })

  const query = createQuery()

  void client.findOne(view.class.Viewlet, { _id: love.viewlet.ListPermanentMeetings }).then((res) => {
    if (res === undefined) return
    // One preference per viewlet: a second one for the same viewlet would be a broken state, and the
    // first is the same one the view itself reads.
    query.query(view.class.ViewletPreference, { attachedTo: res._id }, (prefs) => {
      labels = labelsOf(res, prefs[0]?.config ?? res.config)
    })
  })

  function keyOf (entry: BuildModelKey | string): string {
    if (typeof entry === 'string') return entry
    return entry.displayProps?.key ?? entry.key
  }

  /** Labels of the configured columns; a column with no label of its own keeps an empty caption. */
  function labelsOf (viewlet: Viewlet, config: Array<BuildModelKey | string>): Array<IntlString | undefined> {
    const classLabel = hierarchy.getClass(love.class.PermanentMeeting).label
    const lookup = buildConfigLookup(hierarchy, love.class.PermanentMeeting, config, viewlet.options?.lookup)
    return config.map((entry) => {
      // A configured presenter names its column itself: that label is what the table header shows.
      if (typeof entry === 'object' && entry.label !== undefined) return entry.label
      const key = keyOf(entry)
      const label = key === '' ? classLabel : getKeyLabel(client, love.class.PermanentMeeting, key, lookup)
      return label === '' ? undefined : label
    })
  }
</script>

{#if labels.length > 0}
  <div class="list-caption__clip">
    <div
      class="list-caption"
      bind:this={caption}
      data-id="meeting-list-caption"
      style:grid-template-columns={template === '' ? undefined : template}
      style:column-gap={columnGap}
      style:padding-left={leftInset}
      style:transform={`translateX(${-scrolled}px)`}
    >
      <!-- The lead column of a row holds the checkbox and has no caption of its own. -->
      <span class="list-caption__cell" />
      {#each labels as label}
        <span class="list-caption__cell"
          >{#if label !== undefined}<Label {label} />{/if}</span
        >
      {/each}
    </div>
  </div>
{/if}

<style lang="scss">
  // The captions of the columns of the list, laid out over the grid of the rows themselves: the theme
  // writes a table header this way (`antiTable th`), and the offset comes from a row, not from a guess.
  // The clip keeps the part that is rolled out of sight from widening the panel.
  .list-caption__clip {
    flex-shrink: 0;
    width: 100%;
    height: var(--global-large-Size);
    overflow: hidden;
  }

  .list-caption {
    display: grid;
    align-items: center;
    width: max-content;
    height: var(--global-large-Size);
    user-select: none;

    &__cell {
      display: flex;
      align-items: center;
      min-width: 0;
      font-size: 0.625rem;
      font-weight: 600;
      letter-spacing: 0.5px;
      line-height: 1rem;
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--theme-dark-color);
    }
  }
</style>
