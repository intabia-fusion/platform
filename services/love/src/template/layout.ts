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

/**
 * Layout of the recording template (`page.ts`), free of DOM for unit tests. The screen gets the full
 * frame height; cameras go into the letterbox strip it leaves or into one corner tile.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ParticipantState {
  id: string
  name: string
  hasCamera: boolean
  /** When the participant was first seen by the template, ms. */
  joinedAt: number
  /** Last time the participant was among the active speakers, ms; 0 if never. */
  lastSpokeAt: number
}

export interface ScreenState {
  id: string
  participantId: string
  /** When the template first saw this screen share, ms. */
  publishedAt: number
  /** Intrinsic size of the shared video; 0 until the first frame is decoded. */
  width: number
  height: number
}

export interface TileBox {
  participantId: string
  rect: Rect
}

export interface TemplateLayout {
  mode: 'grid' | 'screen'
  screen?: { id: string, rect: Rect }
  tiles: TileBox[]
}

export const TILE_ASPECT = 16 / 9
/** Grid shows at most this many tiles; the most recent speakers win the slots. */
export const MAX_GRID_TILES = 16
/** Narrowest letterbox strip that still holds a useful camera tile, as a share of the frame width. */
export const MIN_STRIP_SHARE = 0.08
export const MAX_STRIP_TILES = 4
/** Widest strip tile: a narrow shared window must not turn the strip into one giant camera. */
export const MAX_STRIP_TILE_SHARE = 0.2
/** Corner tile used when the screen leaves no strip (16:9 screen in a 16:9 frame). */
export const CORNER_TILE_SHARE = 0.14

/** Gap between tiles and around the frame edge, as a share of the frame height. */
const GAP_SHARE = 0.008

function gapOf (frameH: number): number {
  return Math.max(4, Math.round(frameH * GAP_SHARE))
}

/** The screen share to show: the one started last, so a new presenter takes over. */
export function pickScreen (screens: ScreenState[]): ScreenState | undefined {
  let best: ScreenState | undefined
  for (const s of screens) {
    if (best === undefined || s.publishedAt > best.publishedAt || (s.publishedAt === best.publishedAt && s.id > best.id)) {
      best = s
    }
  }
  return best
}

function compareIds (a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** First non-zero comparison wins. */
function firstDiff (...diffs: number[]): number {
  return diffs.find((d) => d !== 0) ?? 0
}

/** Recent speakers first, then people with a camera, then join order; stable for equal keys. */
export function rankParticipants (participants: ParticipantState[]): ParticipantState[] {
  return [...participants].sort((a, b) =>
    firstDiff(
      b.lastSpokeAt - a.lastSpokeAt,
      Number(b.hasCamera) - Number(a.hasCamera),
      a.joinedAt - b.joinedAt,
      compareIds(a.id, b.id)
    )
  )
}

function byJoin (a: ParticipantState, b: ParticipantState): number {
  return firstDiff(a.joinedAt - b.joinedAt, compareIds(a.id, b.id))
}

/** Columns x rows that give the largest 16:9 tiles for `n` tiles in the given area. */
export function gridShape (n: number, areaW: number, areaH: number, gap: number): { cols: number, rows: number, tileW: number, tileH: number } {
  let best = { cols: 1, rows: 1, tileW: 0, tileH: 0 }
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols)
    const cellW = (areaW - gap * (cols - 1)) / cols
    const cellH = (areaH - gap * (rows - 1)) / rows
    const tileW = Math.min(cellW, cellH * TILE_ASPECT)
    if (tileW > best.tileW) best = { cols, rows, tileW, tileH: tileW / TILE_ASPECT }
  }
  return best
}

function gridLayout (participants: ParticipantState[], frameW: number, frameH: number): TemplateLayout {
  const shown = rankParticipants(participants).slice(0, MAX_GRID_TILES).sort(byJoin)
  if (shown.length === 0) return { mode: 'grid', tiles: [] }
  const gap = gapOf(frameH)
  const areaW = frameW - 2 * gap
  const areaH = frameH - 2 * gap
  const { cols, rows, tileW, tileH } = gridShape(shown.length, areaW, areaH, gap)
  const usedH = rows * tileH + (rows - 1) * gap
  const top = gap + (areaH - usedH) / 2
  const tiles = shown.map((p, i) => {
    const row = Math.floor(i / cols)
    const inRow = row === rows - 1 ? shown.length - row * cols : cols
    const rowW = inRow * tileW + (inRow - 1) * gap
    const left = gap + (areaW - rowW) / 2
    const col = i - row * cols
    return { participantId: p.id, rect: roundRect({ x: left + col * (tileW + gap), y: top + row * (tileH + gap), w: tileW, h: tileH }) }
  })
  return { mode: 'grid', tiles }
}

function roundRect (r: Rect): Rect {
  const x = Math.round(r.x)
  const y = Math.round(r.y)
  return { x, y, w: Math.round(r.x + r.w) - x, h: Math.round(r.y + r.h) - y }
}

/** Fit `srcW x srcH` into the area, keeping the aspect; the result sits at the area's top-left. */
export function fitInto (srcW: number, srcH: number, areaW: number, areaH: number): { w: number, h: number } {
  if (srcW <= 0 || srcH <= 0) return { w: areaW, h: areaH }
  const scale = Math.min(areaW / srcW, areaH / srcH)
  return { w: srcW * scale, h: srcH * scale }
}

function screenLayout (screen: ScreenState, participants: ParticipantState[], frameW: number, frameH: number): TemplateLayout {
  const gap = gapOf(frameH)
  // Never shrink the screen for the cameras: that would resample every glyph.
  const full = fitInto(screen.width, screen.height, frameW, frameH)
  const freeW = frameW - full.w
  const ranked = rankParticipants(participants)

  if (freeW >= frameW * MIN_STRIP_SHARE) {
    // Letterboxed screen (16:10 in 16:9): screen flush left, cameras in the right strip.
    const screenRect = roundRect({ x: 0, y: (frameH - full.h) / 2, w: full.w, h: full.h })
    const tileW = Math.min(freeW - 2 * gap, frameW * MAX_STRIP_TILE_SHARE)
    const tileH = tileW / TILE_ASPECT
    const fit = Math.max(0, Math.floor((frameH - gap) / (tileH + gap)))
    const shown = ranked.slice(0, Math.min(MAX_STRIP_TILES, fit)).sort(byJoin)
    const tiles = shown.map((p, i) => ({
      participantId: p.id,
      rect: roundRect({ x: full.w + gap, y: gap + i * (tileH + gap), w: tileW, h: tileH })
    }))
    return { mode: 'screen', screen: { id: screen.id, rect: screenRect }, tiles }
  }

  // Screen fills the width: the latest speaker goes into the top-right corner.
  const screenRect = roundRect({ x: (frameW - full.w) / 2, y: (frameH - full.h) / 2, w: full.w, h: full.h })
  const top = ranked[0]
  if (top === undefined) return { mode: 'screen', screen: { id: screen.id, rect: screenRect }, tiles: [] }
  const tileW = frameW * CORNER_TILE_SHARE
  const tileH = tileW / TILE_ASPECT
  return {
    mode: 'screen',
    screen: { id: screen.id, rect: screenRect },
    tiles: [{ participantId: top.id, rect: roundRect({ x: frameW - gap - tileW, y: gap, w: tileW, h: tileH }) }]
  }
}

export function computeLayout (
  participants: ParticipantState[],
  screens: ScreenState[],
  frameW: number,
  frameH: number
): TemplateLayout {
  const screen = pickScreen(screens)
  if (screen === undefined) return gridLayout(participants, frameW, frameH)
  return screenLayout(screen, participants, frameW, frameH)
}

/**
 * Camera layer to request for a tile of this height; simulcast and SVC cameras publish about 180p, 360p
 * and 720p, and decoding 720p for a thumbnail wastes the egress CPU. Numbers match `VideoQuality`.
 */
export function videoQualityFor (tileHeight: number): 0 | 1 | 2 {
  if (tileHeight <= 200) return 0
  if (tileHeight <= 400) return 1
  return 2
}

/** `Person.name` is stored as `Last,First`; the meeting UI shows it as `Last First`. */
export function displayName (raw: string): string {
  const sep = raw.indexOf(',')
  if (sep < 0) return raw.trim()
  return [raw.slice(0, sep), raw.slice(sep + 1)].map((p) => p.trim()).filter((p) => p.length > 0).join(' ')
}

/** Up to two initials for a camera-off tile. */
export function initials (name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0)
  return parts
    .slice(0, 2)
    .map((p) => Array.from(p)[0].toUpperCase())
    .join('')
}
