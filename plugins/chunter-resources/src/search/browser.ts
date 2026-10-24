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
//

import type { Class, Doc, Hierarchy, Ref, SearchResultDoc, SearchSortOrder, Timestamp } from '@hcengineering/core'
import type { Asset } from '@hcengineering/platform'

export interface MonthGroup<Row> {
  key: string
  /** Absent when the rows are ranked rather than dated. */
  month?: Timestamp
  rows: Array<{ row: Row, index: number }>
}

/** Relevance means nothing without a query: everything ties, so the list reads newest first. */
export function shownOrder (sort: SearchSortOrder, search: string): SearchSortOrder {
  return search === '' && sort === 'relevance' ? 'date-desc' : sort
}

/** A relevance-ranked list stays whole: month headers would cut it into meaningless runs. */
export function groupByMonth<Row extends { createdOn: Timestamp }> (
  rows: Row[],
  sort: SearchSortOrder
): Array<MonthGroup<Row>> {
  if (sort === 'relevance') {
    return rows.length > 0 ? [{ key: 'all', rows: rows.map((row, index) => ({ row, index })) }] : []
  }

  // By key, not by run: rows still ranked by a cleared query would otherwise repeat a month.
  const groups = new Map<string, MonthGroup<Row>>()
  rows.forEach((row, index) => {
    const date = new Date(row.createdOn)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    let group = groups.get(key)
    if (group === undefined) {
      group = { key, month: new Date(date.getFullYear(), date.getMonth(), 1).getTime(), rows: [] }
      groups.set(key, group)
    }
    group.rows.push({ row, index })
  })
  return Array.from(groups.values())
}

export function formatMonth (month: Timestamp, lang: string, now: Date = new Date()): { name: string, year?: string } {
  const date = new Date(month)
  const name = date.toLocaleDateString(lang, { month: 'long' })
  return {
    name: name.charAt(0).toLocaleUpperCase(lang) + name.slice(1),
    year: date.getFullYear() !== now.getFullYear() ? String(date.getFullYear()) : undefined
  }
}

export function formatDay (value: Timestamp, lang: string, now: Date = new Date()): string {
  const date = new Date(value)
  return date.toLocaleDateString(lang, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  })
}

/** System locale, as the message timestamps show it. */
export function formatDateTime (value: Timestamp, lang: string = 'default'): string {
  return new Date(value).toLocaleString(lang, {
    minute: '2-digit',
    hour: 'numeric',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

export interface JustifiedRow<T> {
  items: Array<{ item: T, width: number }>
  height: number
}

// Cropped to 3:4..16:9: a panorama or a long screenshot would make its row a strip or a wall.
const MIN_RATIO = 3 / 4
const MAX_RATIO = 16 / 9

export function clampRatio (raw: number): number {
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.max(raw, MIN_RATIO), MAX_RATIO) : 1
}

/** The last row keeps the target height rather than blowing a few pictures up to the full width. */
export function justifyRows<T> (
  items: T[],
  ratioOf: (item: T) => number,
  width: number,
  targetHeight: number,
  gap: number
): Array<JustifiedRow<T>> {
  const rows: Array<JustifiedRow<T>> = []
  if (width <= 0) return rows

  let current: Array<{ item: T, ratio: number }> = []
  let sum = 0
  const close = (height: number, free?: number): void => {
    const widths = current.map(({ ratio }) => Math.floor(ratio * height))
    // The rounding leftover goes to the last picture, so a full row ends flush with the block's edge.
    if (free !== undefined) widths[widths.length - 1] += free - widths.reduce((a, b) => a + b, 0)
    rows.push({ height, items: current.map(({ item }, i) => ({ item, width: widths[i] })) })
    current = []
    sum = 0
  }

  for (const item of items) {
    const ratio = clampRatio(ratioOf(item))
    current.push({ item, ratio })
    sum += ratio
    const free = width - gap * (current.length - 1)
    if (sum * targetHeight >= free) close(free / sum, Math.floor(free))
  }
  if (current.length > 0) close(targetHeight)
  return rows
}

export interface PlacedItem<T> {
  item: T
  x: number
  y: number
  width: number
  height: number
}

/** Rows as positions in one block: a resize moving a picture to another row keeps its node. */
export function placeJustified<T> (
  rows: Array<JustifiedRow<T>>,
  gap: number
): { items: Array<PlacedItem<T>>, height: number } {
  const items: Array<PlacedItem<T>> = []
  let y = 0
  rows.forEach((row, i) => {
    if (i > 0) y += gap
    let x = 0
    for (const { item, width } of row.items) {
      items.push({ item, x, y, width, height: row.height })
      x += width + gap
    }
    y += row.height
  })
  return { items, height: y }
}

export function mediaRatio (row: { attachment: { metadata?: Record<string, any> } }): number {
  const width = row.attachment.metadata?.originalWidth ?? row.attachment.metadata?.thumbnail?.width
  const height = row.attachment.metadata?.originalHeight ?? row.attachment.metadata?.thumbnail?.height
  return typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0 ? width / height : 1
}

export function shortUrl (url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/** A file climbs to the channel of its message, for the icon. */
export function placeClass (raw: SearchResultDoc): Ref<Class<Doc>> | undefined {
  return raw.doc.rootObjectClass ?? raw.doc.objectClass ?? raw.doc.attachedToClass
}

export function classIcon (hierarchy: Hierarchy, _class: Ref<Class<Doc>> | undefined): Asset | undefined {
  return _class !== undefined && hierarchy.hasClass(_class) ? hierarchy.getClass(_class).icon : undefined
}
