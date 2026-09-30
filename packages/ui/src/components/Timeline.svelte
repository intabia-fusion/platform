<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import { fly } from 'svelte/transition'
  import type { Timestamp } from '@hcengineering/core'
  import type { TimelineItem, TimelinePoint, TimelineRow, TimelineState, TTimelineRow } from '../types'
  import ui, {
    Icon,
    Scroller,
    Button,
    resizeObserver,
    MILLISECONDS_IN_WEEK,
    IconArrowLeft,
    IconArrowRight,
    IconAdd,
    isWeekend
  } from '..'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import {
    clampDragDays,
    clampLane,
    getBounds as boundsOf,
    getDateByOffset as dateByOffset,
    getDays,
    getNextWeek as nextWeekDate,
    getOffsetByDate as offsetByDate,
    getWeekends,
    keepPending,
    PENDING_TIMEOUT_MS
  } from '../timelineMath'

  export let selectedRow: number | undefined = undefined
  // Highlighted date span, e.g. the bounds of the milestone the rows belong to.
  export let range: { startDate: Timestamp, targetDate: Timestamp } | undefined = undefined
  export let lines: TimelineRow[] | undefined = undefined
  export let currentTime: Timestamp = new Date().setHours(0, 0, 0, 0)
  export let editable: boolean = false

  const dispatch = createEventDispatcher()
  const NOT_ENDED = MILLISECONDS_IN_WEEK * 4
  // Wide enough to cover any scroll distance on either side of the range.
  const OUT_OF_RANGE_WIDTH = 100000
  let currentDate: Date = new Date(currentTime)
  $: currentDate = new Date(currentTime)

  export const scrollToDate = (date: Timestamp): void => {
    time.offsetView = -getOffsetByDate(date) + dayWidth * 5
  }
  export const selectRow = (row: number) => {
    selectedRow = row
  }
  const handleRowFocused = (row: number) => {
    dispatch('row-focus', row)
  }

  let panelWidth: number = 320
  // Pixels per day; weekends get shaded once a day is wide enough to see them.
  export let dayWidth: number = 5
  // Narrow grids: short month names, no week numbers, so labels do not overlap.
  $: monthFormat = (dayWidth * 30 < 110 ? 'short' : 'long') as 'short' | 'long'
  $: showWeeks = dayWidth * 7 >= 35
  $: showDays = dayWidth >= 16
  let container: HTMLElement
  let viewbox: HTMLElement
  let scroller: Scroller
  let scrollDir: 'horizontal' | 'vertical' | 'none' = 'none'

  const locale = new Intl.NumberFormat().resolvedOptions().locale
  const nillPoint: TimelinePoint = { label: '', date: currentDate, x: 0 }
  const nillRect: DOMRect = { x: 0, y: 0, width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0, toJSON: () => {} }
  const time: TimelineState = {
    todayMarker: nillPoint,
    offsetView: 0,
    renderedRange: { left: nillPoint, right: nillPoint, firstDays: [] },
    rows: undefined,
    months: [],
    days: [],
    timelineBox: nillRect,
    viewBox: nillRect
  }

  const checkRange = (reverse: boolean) => {
    if (reverse) {
      if (time.offsetView * -1 - time.viewBox.width <= time.renderedRange.left.x) renderPrevMonth()
    } else {
      if (time.offsetView * -1 + time.viewBox.width * 2 >= time.renderedRange.right.x) renderNextMonth()
    }
  }

  const getDateByOffset = (x: number): { date: Date, delta: number } => dateByOffset(currentTime, dayWidth, x)
  const getOffsetByDate = (date: Timestamp | Date): number => offsetByDate(currentTime, dayWidth, date)
  const getNextMonth = (date: Date): TimelinePoint => {
    const fDate = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0)
    const offDate = getOffsetByDate(fDate)
    const lDate = Intl.DateTimeFormat(locale, { month: monthFormat }).format(fDate)
    return { date: fDate, x: offDate, label: lDate }
  }
  const getNextWeek = (date: Date, reverse?: boolean): TimelinePoint => {
    const fDate = nextWeekDate(date, reverse)
    const offDate = getOffsetByDate(fDate)
    const lDate = fDate.getDate().toString()
    return { date: fDate, x: offDate, label: lDate }
  }

  const renderPrevMonth = () => {
    const oldRange: TimelinePoint = time.renderedRange.left
    const newDate: Date = new Date(oldRange.date.getFullYear(), oldRange.date.getMonth() - 1, 1, 0, 0)
    const newRange: number = getOffsetByDate(newDate)
    const newLabel: string = Intl.DateTimeFormat(locale, { month: monthFormat }).format(newDate)
    const newPoint: TimelinePoint = {
      x: newRange,
      date: newDate,
      label: newLabel
    }
    time.renderedRange.left = newPoint
    time.months = [newPoint, ...time.months]
    while (getNextWeek(time.days[0].date, true).x > newPoint.x) {
      const prevDay: TimelinePoint = getNextWeek(time.days[0].date, true)
      time.days = [prevDay, ...time.days]
    }
  }
  const renderNextMonth = () => {
    const oldRange: TimelinePoint = time.renderedRange.right
    const newDate: Date = new Date(oldRange.date.getFullYear(), oldRange.date.getMonth() + 1, 1, 0, 0)
    const newRange: number = getOffsetByDate(newDate)
    const newLabel: string = Intl.DateTimeFormat(locale, { month: monthFormat }).format(newDate)
    const newPoint: TimelinePoint = {
      x: newRange,
      date: newDate,
      label: newLabel
    }
    time.renderedRange.right = newPoint
    time.months = [...time.months, newPoint]
    while (getNextWeek(time.days[time.days.length - 1].date).x < newPoint.x) {
      const nextDay: TimelinePoint = getNextWeek(time.days[time.days.length - 1].date)
      time.days = [...time.days, nextDay]
    }
  }

  const wheelEvent = (e: WheelEvent) => {
    e = e || window.event
    const deltaX = -e.deltaX
    const deltaY = e.deltaY
    if (scrollDir === 'none' && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) scrollDir = 'horizontal'
      else scrollDir = 'vertical'
    } else if (Math.abs(deltaX) <= 4 && Math.abs(deltaY) <= 4) scrollDir = 'none'
    time.offsetView += deltaX
    if (scrollDir === 'horizontal') {
      mouseMoveEvent(e)
      checkRange(deltaX > 0)
    }
    if (scrollDir === 'vertical') scroller.scrollBy(deltaY)
    e.preventDefault ? e.preventDefault() : (e.returnValue = false)
  }
  const mouseMoveEvent = (e: MouseEvent) => {
    const cur = e.x - time.viewBox.left
    if (cur >= 0 && cur <= time.viewBox.width) {
      const offset = cur - time.offsetView
      const t = getDateByOffset(offset)
      time.cursorMarker = {
        label: t.date.getDate().toString(),
        x: offset,
        date: t.date
      }
    }
  }
  const mouseOutEvent = (e: MouseEvent) => {
    time.cursorMarker = undefined
  }
  const clickEvent = (e: MouseEvent) => {}

  // Dotted lines where each weekend starts and ends; only on wide grids.
  const getWeekendEdges = (from: Date, to: Date): number[] =>
    getDays(from, to).flatMap((d) => {
      if (d.getDay() === 6) return [getOffsetByDate(d)]
      if (d.getDay() === 0) return [getOffsetByDate(d) + dayWidth]
      return []
    })
  // Primitives, so cursor moves (which touch `time`) do not recompute the day lists
  $: rangeFrom = time.renderedRange.left.date.getTime()
  $: rangeTo = time.renderedRange.right.date.getTime()
  $: weekendEdges = dayWidth >= 16 ? getWeekendEdges(new Date(rangeFrom), new Date(rangeTo)) : []
  $: rangeDays = showDays ? getDays(new Date(rangeFrom), new Date(rangeTo)) : []

  // Weekend days of a bar, relative to its padding box (inside the 1px border); only on wide grids.
  const weekendCuts = (start: Timestamp, target: Timestamp): number[] => {
    if (dayWidth < 16) return []
    const left = getOffsetByDate(start) + 1
    return getWeekends(new Date(start), new Date(target)).map((d) => getOffsetByDate(d) - left)
  }

  const buildRows = (): number[] => {
    let mass: number[] = [currentTime]
    const rows: TTimelineRow[] = []
    lines?.forEach((line) => {
      if (line.items !== undefined) {
        let tr: number[] = []
        line.items.forEach((it) => {
          if (it.startDate) tr = [...tr, it.startDate]
          if (it.targetDate) tr = [...tr, it.targetDate]
          else if (it.startDate) tr = [...tr, it.startDate + NOT_ENDED]
        })
        if (tr.length > 0) {
          mass = [...mass, ...tr]
          tr.sort((a, b) => a - b)
          const minD: Date = new Date(tr[0])
          const maxD: Date = new Date(tr[tr.length - 1])
          rows.push({
            min: { date: minD, x: getOffsetByDate(minD) },
            max: { date: maxD, x: getOffsetByDate(maxD) }
          })
        } else rows.push(null)
      } else rows.push(null)
    })
    time.rows = rows.length > 0 ? rows : undefined
    return mass
  }

  let mounted = false
  $: if (mounted && lines !== undefined) buildRows()

  interface DragState {
    row: number
    index: number
    mode: 'move' | 'start' | 'end'
    x0: number
    days: number
    key?: string
    // Droppable row under the pointer during a move
    overRow?: number
  }
  let drag: DragState | undefined
  $: if (drag?.key !== undefined && lines !== undefined) {
    const at = lines.findIndex((it) => it.key === drag?.key)
    if (at !== -1 && at !== drag.row) drag.row = at
  }

  // Dropped bounds shown until the item update arrives, so the bar does not jump back meanwhile
  interface PendingBounds {
    itemKey?: string
    rowKey?: string
    row: number
    index: number
    start: Timestamp
    target?: Timestamp
    at: number
  }
  let pending: Record<string, PendingBounds> = {}
  const pendingId = (row: number, index: number): string => {
    const itemKey = lines?.[row]?.items?.[index]?.key
    return itemKey !== undefined ? `item:${itemKey}` : `${lines?.[row]?.key ?? `row${row}`}:${index}`
  }
  const findPendingItem = (rows: TimelineRow[] | undefined, p: PendingBounds): TimelineItem | undefined => {
    if (p.itemKey !== undefined) {
      for (const line of rows ?? []) {
        const found = line.items?.find((it) => it.key === p.itemKey)
        if (found !== undefined) return found
      }
      return undefined
    }
    const line = p.rowKey !== undefined ? rows?.find((it) => it.key === p.rowKey) : rows?.[p.row]
    return line?.items?.[p.index]
  }
  const prunePending = (rows: TimelineRow[] | undefined): void => {
    pending = Object.fromEntries(
      Object.entries(pending).filter(([, p]) => {
        const item = findPendingItem(rows, p)
        return item?.startDate !== undefined && keepPending(item, p, Date.now() - p.at)
      })
    )
  }
  $: prunePending(lines)

  const getBounds = (
    item: TimelineItem,
    d: DragState | undefined,
    p?: PendingBounds
  ): { start: Timestamp, target?: Timestamp } =>
    p !== undefined ? boundsOf(p.start, p.target, d) : boundsOf(item.startDate, item.targetDate, d)
  const dragMove = (e: MouseEvent) => {
    if (drag === undefined) return
    const item = lines?.[drag.row]?.items?.[drag.index]
    const raw = Math.round((e.clientX - drag.x0) / dayWidth)
    const days = item !== undefined ? clampDragDays(drag.mode, raw, item.startDate, item.targetDate) : raw
    if (days !== drag.days) drag.days = days
    if (drag.mode === 'move') {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-row]')
      const row = over != null ? Number(over.getAttribute('data-row')) : undefined
      // Only a bar of a droppable row can move to another one
      const movable = lines?.[drag.row]?.droppable === true
      const overRow =
        movable && row !== undefined && row !== drag.row && lines?.[row]?.droppable === true ? row : undefined
      if (overRow !== drag.overRow) drag.overRow = overRow
    }
  }
  const dragEnd = () => {
    document.removeEventListener('mousemove', dragMove)
    document.removeEventListener('mouseup', dragEnd)
    const d = drag
    drag = undefined
    const item = d !== undefined ? lines?.[d.row]?.items?.[d.index] : undefined
    if (d !== undefined && item !== undefined && (d.days !== 0 || d.overRow !== undefined)) {
      const { start, target } = getBounds(item, d, pending[pendingId(d.row, d.index)])
      if (d.overRow === undefined) {
        pending[pendingId(d.row, d.index)] = {
          itemKey: item.key,
          rowKey: lines?.[d.row]?.key,
          row: d.row,
          index: d.index,
          start,
          target,
          at: Date.now()
        }
        setTimeout(() => {
          prunePending(lines)
        }, PENDING_TIMEOUT_MS + 50)
      }
      dispatch('item-change', {
        row: d.row,
        index: d.index,
        startDate: start,
        targetDate: target,
        targetRow: d.overRow
      })
    }
    if (d?.mode === 'move') dispatch('drag-end')
  }
  const dragStart = (e: MouseEvent, row: number, index: number, mode: DragState['mode']) => {
    // macOS reports ctrl+click as button 0 and then opens the context menu
    if (!editable || e.button !== 0 || e.ctrlKey) return
    e.preventDefault()
    e.stopPropagation()
    drag = { row, index, mode, x0: e.clientX, days: 0, key: lines?.[row]?.key }
    if (mode === 'move') dispatch('drag-start', { row, index })
    document.addEventListener('mousemove', dragMove)
    document.addEventListener('mouseup', dragEnd)
  }

  onDestroy(() => {
    if (drag?.mode === 'move') dispatch('drag-end')
    document.removeEventListener('mousemove', dragMove)
    document.removeEventListener('mouseup', dragEnd)
    document.removeEventListener('mousemove', splitterMove)
    document.removeEventListener('mouseup', splitterEnd)
  })

  onMount(() => {
    container.addEventListener('wheel', wheelEvent)
    container.addEventListener('mousemove', mouseMoveEvent)
    container.addEventListener('mouseout', mouseOutEvent)
    container.addEventListener('click', clickEvent)

    time.timelineBox = container.getBoundingClientRect()
    time.viewBox = viewbox.getBoundingClientRect()
    time.offsetView = Math.floor(time.viewBox.width / 2)
    time.todayMarker.x = 0
    time.todayMarker.date = currentDate
    time.todayMarker.label = Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(currentDate)

    const mass = buildRows()
    mass.sort((a, b) => a - b)

    let leftRange: number = getOffsetByDate(mass[0]) - time.viewBox.width * 1.5
    const leftDate: Date = new Date(getDateByOffset(leftRange).date.setDate(1))
    leftRange = getOffsetByDate(leftDate)
    time.renderedRange.left = {
      x: leftRange,
      date: leftDate,
      label: Intl.DateTimeFormat(locale, { month: monthFormat }).format(leftDate)
    }
    let rightRange: number = getOffsetByDate(mass[mass.length - 1]) + time.viewBox.width * 1.5
    const tr: Date = new Date(getDateByOffset(rightRange).date)
    const rightDate: Date = new Date(new Date(tr.getFullYear(), tr.getMonth() + 1, 1, 0, 0).getTime() - 1)
    rightRange = getOffsetByDate(rightDate)
    time.renderedRange.right = {
      x: rightRange,
      date: rightDate,
      label: Intl.DateTimeFormat(locale, { month: monthFormat }).format(rightDate)
    }

    time.months = [time.renderedRange.left]
    let i = 0
    do {
      const nextMonth: TimelinePoint = getNextMonth(time.months[i].date)
      time.months = [...time.months, nextMonth]
      i++
    } while (getNextMonth(time.months[i].date).x <= time.renderedRange.right.x)
    time.days = [
      {
        x: time.renderedRange.left.x,
        date: time.renderedRange.left.date,
        label: '1'
      }
    ]
    i = 0
    do {
      const nextWeek: TimelinePoint = getNextWeek(time.days[i].date)
      time.days = [...time.days, nextWeek]
      i++
    } while (getNextWeek(time.days[i].date).x <= time.renderedRange.right.x)
    mounted = true
  })

  let moving: boolean = false
  let sX: number
  const splitterStart = (e: MouseEvent) => {
    if (time.timelineBox.width <= 450) return
    sX = (e.x - time.viewBox.left) * -1
    document.addEventListener('mouseup', splitterEnd)
    document.addEventListener('mousemove', splitterMove)
    moving = true
  }
  const splitterMove = (e: MouseEvent) => {
    if (e.x - time.timelineBox.left + sX < 300) panelWidth = 300
    else if (time.timelineBox.right - e.x + sX < 150) panelWidth = time.timelineBox.width - 150
    else panelWidth = e.x - time.timelineBox.left + sX
  }
  const splitterEnd = (e: MouseEvent) => {
    document.removeEventListener('mousemove', splitterMove)
    document.removeEventListener('mouseup', splitterEnd)
    time.viewBox = viewbox.getBoundingClientRect()
    moving = false
  }
</script>

<div
  class="timeline-container"
  bind:this={container}
  use:resizeObserver={() => {
    time.timelineBox = container.getBoundingClientRect()
    time.viewBox = viewbox.getBoundingClientRect()
  }}
>
  <div class="timeline-header">
    <div class="timeline-header__title" style:width={`${panelWidth}px`}>
      <Button
        label={ui.string.Today}
        on:click={() => {
          time.offsetView = Math.floor(time.viewBox.width / 2)
        }}
      />
    </div>
    <div class="timeline-header__time" bind:this={viewbox}>
      <div class="timeline-header__time-content" style:transform={`translateX(${time.offsetView}px)`}>
        {#if time.months}
          {#each time.months as month}
            <div class="month firstLetter" style:left={`${month.x}px`}>
              {#if month.date.getMonth() === 0}
                <b class="caption-color">{month.date.getFullYear()}</b>
              {/if}
              <span style="firstLetter">{month.label}</span>
            </div>
          {/each}
        {/if}
        {#if showDays}
          {#each rangeDays as day}
            <div class="day" class:weekend={isWeekend(day)} style:left={`${getOffsetByDate(day) + dayWidth / 2}px`}>
              {day.getDate()}
            </div>
          {/each}
        {:else if time.days && showWeeks}
          {#each time.days as day}
            <div class="day" style:left={`${day.x}px`}>{day.label}</div>
          {/each}
        {/if}
        <div class="cursor" style:left={`${time.todayMarker.x}px`}>{time.todayMarker.date.getDate()}</div>
        <!-- {#if time.cursorMarker}
          <div class="cursor" style:left={`${time.cursorMarker.x}px`}>{time.cursorMarker.label}</div>
        {/if} -->
      </div>
    </div>
  </div>
  <div class="timeline-background__headers" style:width={`${panelWidth}px`} />
  <div class="timeline-background__viewbox" style:left={`${panelWidth}px`}>
    <div class="timeline-wrapped_content" style:transform={`translateX(${time.offsetView}px)`}>
      {#if time.months}
        {#each time.months as month}
          <div class="monthMarker" style:left={`${month.x}px`} />
        {/each}
      {/if}
    </div>
  </div>
  {#if lines}
    <Scroller bind:this={scroller}>
      {#each lines as line, row}
        {@const rangeRow = time.rows?.[row] ?? null}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="listGrid"
          class:compact={line.compact}
          style:height={line.lanes !== undefined
            ? `${line.lanes * (line.compact === true ? 2.25 : 3.25)}rem`
            : undefined}
          class:mListGridSelected={selectedRow === row}
          class:dropTarget={drag?.overRow === row}
          data-row={row}
          on:focus={() => {}}
          on:mousemove={(ev) => {
            if (row !== selectedRow) {
              handleRowFocused(row)
            }
            ev.preventDefault()
          }}
        >
          <div class="headerWrapper" style:width={`${panelWidth}px`}>
            <slot {row} />
          </div>
          <div class="contentWrapper" class:nullRow={rangeRow === null && !moving}>
            <div class="timeline-wrapped_content" style:transform={`translateX(${time.offsetView}px)`}>
              {#if line.items}
                {#each line.items as item, index}
                  {#if item.startDate}
                    {@const b = getBounds(
                      item,
                      drag?.row === row && drag.index === index ? drag : undefined,
                      pending[pendingId(row, index)]
                    )}
                    {@const target = b.target != null ? Math.max(b.target, b.start) : b.start + NOT_ENDED}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                      class="component-item"
                      data-key={item.key}
                      class:editable
                      class:dragging={drag?.row === row && drag.index === index}
                      class:laned={item.lane !== undefined}
                      style:top={item.lane !== undefined
                        ? `${clampLane(item.lane, line.lanes) * (line.compact === true ? 2.25 : 3.25) + (line.compact === true ? 0.375 : 0.875)}rem`
                        : undefined}
                      style:left={`${getOffsetByDate(b.start)}px`}
                      style:width={`${getOffsetByDate(target) - getOffsetByDate(b.start) + dayWidth - 1}px`}
                      on:mousedown={(e) => {
                        dragStart(e, row, index, 'move')
                      }}
                      on:dblclick={() => {
                        dispatch('item-open', { row, index })
                      }}
                      on:contextmenu={(event) => {
                        dispatch('item-contextmenu', { row, index, event })
                      }}
                    >
                      {#each weekendCuts(b.start, target) as x}
                        <div class="weekend-cut" style:left={`${x}px`} style:width={`${dayWidth}px`} />
                      {/each}
                      {#if editable}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                          class="resize-handle left"
                          on:mousedown={(e) => {
                            dragStart(e, row, index, 'start')
                          }}
                        />
                        {#if item.targetDate !== undefined}
                          <!-- svelte-ignore a11y-no-static-element-interactions -->
                          <div
                            class="resize-handle right"
                            on:mousedown={(e) => {
                              dragStart(e, row, index, 'end')
                            }}
                          />
                        {/if}
                      {/if}
                      <div class="component-presenter gap-2">
                        {#if item.icon}<Icon
                            icon={item.icon}
                            size={item.iconSize ?? 'small'}
                            iconProps={item.iconProps}
                          />{/if}
                        {#if item.presenter}<svelte:component this={item.presenter} {...item.props} />{/if}
                        {#if item.label}<span>{item.label}</span>{/if}
                      </div>
                    </div>
                  {/if}
                {/each}
              {/if}
            </div>
            {#if line.items}
              {#if rangeRow !== null && -time.offsetView + time.viewBox.width < rangeRow.min.x}
                <button
                  transition:fly={{ duration: 150, x: 50, opacity: 0 }}
                  class="timeline-action__button right"
                  on:click={() => {
                    if (rangeRow !== null) time.offsetView = -getOffsetByDate(rangeRow.min.date) + dayWidth * 5
                  }}
                >
                  <IconArrowRight size={'small'} />
                </button>
              {/if}
              {#if rangeRow !== null && -time.offsetView > rangeRow.max.x}
                <button
                  transition:fly={{ duration: 150, x: -50, opacity: 0 }}
                  class="timeline-action__button left"
                  on:click={() => {
                    if (rangeRow !== null) time.offsetView = -getOffsetByDate(rangeRow.min.date) + dayWidth * 5
                  }}
                >
                  <IconArrowLeft size={'small'} />
                </button>
              {/if}
            {/if}
            {#if rangeRow === null && selectedRow === row && time.cursorMarker && !moving}
              <button
                class="timeline-action__button add"
                class:editable
                style:left={`${time.offsetView + time.cursorMarker.x}px`}
                on:click={() => {
                  if (editable && time.cursorMarker) {
                    dispatch('row-add', { row, date: new Date(time.cursorMarker.date).setHours(0, 0, 0, 0) })
                  }
                }}
              >
                <IconAdd size={'small'} />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </Scroller>
    <div class="timeline-foreground__viewbox" style:left={`${panelWidth}px`}>
      <div class="timeline-wrapped_content" style:transform={`translateX(${time.offsetView}px)`}>
        {#if range !== undefined}
          {@const from = getOffsetByDate(range.startDate)}
          {@const to = getOffsetByDate(range.targetDate) + dayWidth}
          <!-- Everything outside the range is tinted, the range itself stays clean. -->
          <div
            class="outOfRange before"
            style:left={`${from - OUT_OF_RANGE_WIDTH}px`}
            style:width={`${OUT_OF_RANGE_WIDTH}px`}
          />
          <div class="outOfRange after" style:left={`${to}px`} style:width={`${OUT_OF_RANGE_WIDTH}px`} />
        {/if}
        {#each weekendEdges as x}
          <div class="weekendMarker" style:left={`${x}px`} />
        {/each}
        <div class="todayMarker" style:left={`${time.todayMarker.x}px`} />
      </div>
    </div>
  {/if}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="timeline-splitter" class:moving style:left={`${panelWidth}px`} on:mousedown={splitterStart} />
</div>

<style lang="scss">
  .timeline-container {
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;

    & > * {
      overscroll-behavior-x: contain;
    }
  }
  .timeline-header {
    display: flex;
    align-items: center;
    min-height: 4rem;
    border-bottom: 1px solid var(--divider-color);
  }
  .timeline-header__title {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0 2.25rem;
    height: 100%;
    background-color: var(--theme-comp-header-color);
    box-shadow: var(--accent-shadow);
    // z-index: 2;
  }
  .timeline-header__time {
    position: relative;
    flex-grow: 1;
    height: 100%;
    background-color: var(--theme-bg-color);
    mask-image: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0,
      rgba(0, 0, 0, 1) 2rem,
      rgba(0, 0, 0, 1) calc(100% - 2rem),
      rgba(0, 0, 0, 0) 100%
    );

    &-content {
      width: 100%;
      height: 100%;
      will-change: transform;

      .day,
      .month {
        position: absolute;
        pointer-events: none;
      }
      .month {
        width: max-content;
        top: 0.25rem;
        font-size: 1rem;
        color: var(--accent-color);

        &:first-letter {
          text-transform: uppercase;
        }
      }
      .day {
        bottom: 0.5rem;
        font-size: 1rem;
        color: var(--content-color);
        transform: translateX(-50%);

        &.weekend {
          color: var(--dark-color);
        }
      }
      .cursor {
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        padding-bottom: 1px;
        width: 1.75rem;
        height: 1.75rem;
        bottom: 0.375rem;
        font-size: 1rem;
        font-weight: 600;
        color: #fff;
        background-color: var(--primary-bg-color);
        border-radius: 50%;
        transform: translateX(-50%);
        pointer-events: none;
      }
    }
  }
  .todayMarker,
  .monthMarker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    height: 100%;
    pointer-events: none;
  }
  .monthMarker {
    border-left: 1px dashed var(--highlight-select);
  }
  .weekendMarker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    pointer-events: none;
    border-left: 1px dotted var(--dark-color);
    opacity: 0.5;
  }

  .todayMarker {
    border-left: 1px solid var(--primary-bg-color);
  }
  .outOfRange {
    position: absolute;
    top: 0;
    bottom: 0;
    height: 100%;
    pointer-events: none;
    background-color: color-mix(in srgb, var(--primary-bg-color) 6%, transparent);

    &.before {
      border-right: 1px dashed color-mix(in srgb, var(--primary-bg-color) 40%, transparent);
    }
    &.after {
      border-left: 1px dashed color-mix(in srgb, var(--primary-bg-color) 40%, transparent);
    }
  }

  .timeline-background__headers,
  .timeline-background__viewbox,
  .timeline-foreground__viewbox {
    overflow: hidden;
    position: absolute;
    top: 4rem;
    bottom: 0;
    height: 100%;
    z-index: -1;
  }
  .timeline-background__headers {
    left: 0;
    background-color: var(--theme-comp-header-color);
  }
  .timeline-background__viewbox,
  .timeline-foreground__viewbox {
    right: 0;
    mask-image: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0,
      rgba(0, 0, 0, 1) 2rem,
      rgba(0, 0, 0, 1) calc(100% - 2rem),
      rgba(0, 0, 0, 0) 100%
    );
  }
  .timeline-foreground__viewbox {
    z-index: 1;
    pointer-events: none;
  }

  .timeline-splitter,
  .timeline-splitter::before {
    position: absolute;
    top: 0;
    bottom: 0;
    height: 100%;
    transform: translateX(-50%);
  }
  .timeline-splitter {
    width: 1px;
    background-color: var(--divider-color);
    cursor: col-resize;
    z-index: 3;
    transition-property: width, background-color;
    transition-timing-function: var(--timing-main);
    transition-duration: 0.1s;
    transition-delay: 0s;

    &:hover {
      width: 3px;
      background-color: var(--button-border-hover);
      transition-duration: 0.15s;
      transition-delay: 0.3s;
    }
    &::before {
      content: '';
      width: 10px;
      left: 50%;
    }
    &.moving {
      width: 2px;
      background-color: var(--primary-edit-border-color);
      transition-duration: 0.1s;
      transition-delay: 0s;
    }
  }

  .headerWrapper {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    height: 100%;
    min-width: 0;
    padding-left: 0.75rem;
    padding-right: 1.15rem;
    // border-bottom: 1px solid var(--accent-bg-color);
  }
  .contentWrapper {
    overflow: hidden;
    position: relative;
    display: flex;
    align-items: center;
    flex-grow: 1;
    height: 100%;
    min-width: 0;
    min-height: 0;
    mask-image: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0,
      rgba(0, 0, 0, 1) 2rem,
      rgba(0, 0, 0, 1) calc(100% - 2rem),
      rgba(0, 0, 0, 0) 100%
    );

    &.nullRow {
      cursor: pointer;
    }
  }
  .timeline-wrapped_content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    will-change: transform;
  }

  .timeline-action__button,
  .component-item {
    position: absolute;
    display: flex;
    align-items: center;
    padding: 0.5rem;
    box-shadow: var(--button-shadow);
  }
  .component-item {
    top: 0.875rem;
    bottom: 0.875rem;
    padding: 0 0.5rem;
    overflow: hidden;
    font-size: 0.75rem;
    background-color: var(--button-bg-color);
    border: 1px solid var(--button-border-color);
    border-radius: 0.375rem;

    &:hover {
      background-color: var(--button-bg-hover);
      border-color: var(--button-border-hover);
    }
    &.laned {
      bottom: auto;
      height: 1.5rem;
    }
    &.editable {
      cursor: grab;
    }
    &.dragging {
      cursor: grabbing;
      z-index: 2;
    }
    // Pales weekend days; presenters keep their text above it with z-index 2.
    .weekend-cut {
      position: absolute;
      top: 0;
      bottom: 0;
      z-index: 1;
      pointer-events: none;
      background-color: var(--theme-bg-color);
      opacity: 0.55;
    }
    .resize-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 0.5rem;
      cursor: col-resize;

      &.left {
        left: 0;
      }
      &.right {
        right: 0;
      }
    }

    .component-presenter {
      display: flex;
      align-items: center;
      min-width: 0;
      white-space: nowrap;
    }
  }
  .timeline-action__button {
    top: 0.625rem;
    bottom: 0.625rem;
    width: 2rem;
    color: var(--content-color);
    background-color: var(--button-bg-color);
    border: 1px solid var(--button-border-color);
    border-radius: 0.5rem;

    // color: var(--caption-color);
    // font-size: 0.65rem;
    // font-weight: 600;

    &:hover {
      color: var(--accent-color);
      background-color: var(--button-bg-hover);
      border-color: var(--button-border-hover);
    }

    &.left {
      left: 1rem;
    }
    &.right {
      right: 1rem;
    }
    &.add {
      transform: translateX(-50%);
      pointer-events: none;

      &.editable {
        pointer-events: auto;
      }
    }
  }

  .listGrid {
    display: flex;
    // The global .listGrid adds side padding, which would shift bars off the header and background grid.
    padding: 0;
    justify-content: stretch;
    align-items: center;
    flex-shrink: 0;
    width: 100%;
    height: 3.25rem;
    min-height: 0;

    &:nth-child(even) {
      .headerWrapper,
      .contentWrapper {
        background-color: var(--trans-content-05);
      }
    }

    &.compact {
      height: 2.25rem;

      .component-item {
        top: 0.375rem;
        bottom: 0.375rem;
      }
    }
    color: var(--caption-color);
    z-index: 2;

    &.dropTarget {
      .headerWrapper,
      .contentWrapper {
        background-color: var(--highlight-select-hover);
        outline: 1px dashed var(--primary-button-default);
        outline-offset: -1px;
      }
    }

    &.mListGridSelected {
      .headerWrapper {
        background-color: var(--highlight-select-hover);
      }
      .contentWrapper {
        background-color: var(--trans-content-10);
      }
    }
  }
</style>
