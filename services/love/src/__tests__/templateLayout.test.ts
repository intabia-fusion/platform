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

import {
  computeLayout,
  displayName,
  gridShape,
  initials,
  MAX_GRID_TILES,
  MAX_STRIP_TILE_SHARE,
  MAX_STRIP_TILES,
  type ParticipantState,
  pickScreen,
  type Rect,
  type ScreenState,
  videoQualityFor
} from '../template/layout'
import { normalizeTemplateUrl } from '../template/url'

const W = 1920
const H = 1080

function person (id: string, extra: Partial<ParticipantState> = {}): ParticipantState {
  return { id, name: id, hasCamera: true, joinedAt: Number(id.replace(/\D/g, '')), lastSpokeAt: 0, ...extra }
}

function screen (id: string, width: number, height: number, publishedAt = 1): ScreenState {
  return { id, participantId: 'p1', publishedAt, width, height }
}

function overlaps (a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function inside (r: Rect): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H
}

describe('recording template layout', () => {
  it('gives a 16:10 screen the full frame height and puts cameras into the letterbox strip', () => {
    const people = [person('p1'), person('p2'), person('p3')]
    const layout = computeLayout(people, [screen('s1', 2880, 1800)], W, H)

    expect(layout.mode).toBe('screen')
    // 1080 / 1800 = 0.6: the 2880 px screen becomes 1728 px, nothing is given up to the cameras.
    expect(layout.screen?.rect).toEqual({ x: 0, y: 0, w: 1728, h: 1080 })
    expect(layout.tiles).toHaveLength(3)
    for (const t of layout.tiles) {
      expect(inside(t.rect)).toBe(true)
      expect(t.rect.x).toBeGreaterThanOrEqual(1728)
      expect(overlaps(t.rect, layout.screen?.rect as Rect)).toBe(false)
    }
  })

  it('keeps the strip to the most recent speakers when there are more people than slots', () => {
    const people = Array.from({ length: 8 }, (_, i) => person(`p${i + 1}`))
    people[6].lastSpokeAt = 100
    people[7].lastSpokeAt = 200
    const layout = computeLayout(people, [screen('s1', 2880, 1800)], W, H)

    expect(layout.tiles).toHaveLength(MAX_STRIP_TILES)
    const ids = layout.tiles.map((t) => t.participantId)
    expect(ids).toContain('p7')
    expect(ids).toContain('p8')
    // Drawn in join order, so tiles do not reshuffle every time the speaker ranking changes.
    expect(ids).toEqual([...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))))
  })

  it('shows a 16:9 screen 1:1 and puts only the latest speaker into a corner tile', () => {
    const people = [person('p1', { lastSpokeAt: 10 }), person('p2', { lastSpokeAt: 50 }), person('p3')]
    const layout = computeLayout(people, [screen('s1', 1920, 1080)], W, H)

    expect(layout.screen?.rect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 })
    expect(layout.tiles).toHaveLength(1)
    expect(layout.tiles[0].participantId).toBe('p2')
    const tile = layout.tiles[0].rect
    expect(inside(tile)).toBe(true)
    expect(tile.x + tile.w).toBeGreaterThan(W - 20)
    expect(tile.y).toBeLessThan(20)
  })

  it('keeps camera tiles thumbnail-sized next to a narrow shared window', () => {
    const people = [person('p1'), person('p2'), person('p3'), person('p4')]
    const layout = computeLayout(people, [screen('s1', 800, 1200)], W, H)

    expect(layout.screen?.rect).toEqual({ x: 0, y: 0, w: 720, h: 1080 })
    expect(layout.tiles).toHaveLength(4)
    for (const t of layout.tiles) {
      expect(inside(t.rect)).toBe(true)
      expect(t.rect.w).toBeLessThanOrEqual(Math.ceil(W * MAX_STRIP_TILE_SHARE))
    }
  })

  it('scales with the frame, so a 1440p preset keeps the same geometry', () => {
    const layout = computeLayout([person('p1')], [screen('s1', 2880, 1800)], 2560, 1440)
    expect(layout.screen?.rect).toEqual({ x: 0, y: 0, w: 2304, h: 1440 })
    expect(layout.tiles[0].rect.x).toBeGreaterThanOrEqual(2304)
  })

  it('lays out the screen before its size is known without collapsing it', () => {
    const layout = computeLayout([person('p1')], [screen('s1', 0, 0)], W, H)
    expect(layout.screen?.rect.w).toBe(W)
    expect(layout.screen?.rect.h).toBe(H)
  })

  it('switches to the screen shared last', () => {
    const a = screen('a', 2880, 1800, 10)
    const b = screen('b', 1920, 1080, 20)
    expect(pickScreen([a, b])?.id).toBe('b')
    expect(pickScreen([b, a])?.id).toBe('b')
    expect(pickScreen([])).toBeUndefined()
  })

  it('draws a centred grid of non-overlapping 16:9 tiles without a screen share', () => {
    const people = [person('p1'), person('p2', { hasCamera: false }), person('p3')]
    const layout = computeLayout(people, [], W, H)

    expect(layout.mode).toBe('grid')
    expect(layout.tiles.map((t) => t.participantId)).toEqual(['p1', 'p2', 'p3'])
    for (let i = 0; i < layout.tiles.length; i++) {
      const r = layout.tiles[i].rect
      expect(inside(r)).toBe(true)
      expect(Math.abs(r.w / r.h - 16 / 9)).toBeLessThan(0.02)
      for (let j = i + 1; j < layout.tiles.length; j++) {
        expect(overlaps(r, layout.tiles[j].rect)).toBe(false)
      }
    }
  })

  it('caps the grid and keeps the recent speakers in it', () => {
    const people = Array.from({ length: MAX_GRID_TILES + 4 }, (_, i) => person(`p${i + 1}`))
    people[people.length - 1].lastSpokeAt = 1
    const layout = computeLayout(people, [], W, H)
    expect(layout.tiles).toHaveLength(MAX_GRID_TILES)
    expect(layout.tiles.map((t) => t.participantId)).toContain(`p${MAX_GRID_TILES + 4}`)
  })

  it('returns an empty grid for an empty room', () => {
    expect(computeLayout([], [], W, H)).toEqual({ mode: 'grid', tiles: [] })
  })

  it('picks the grid shape with the largest tiles', () => {
    expect(gridShape(1, 1904, 1064, 8)).toMatchObject({ cols: 1, rows: 1 })
    expect(gridShape(4, 1904, 1064, 8)).toMatchObject({ cols: 2, rows: 2 })
    expect(gridShape(3, 1904, 1064, 8)).toMatchObject({ cols: 2, rows: 2 })
  })

  it('shows the stored Last,First person name the way the meeting UI does', () => {
    expect(displayName('Fefelova,Kristina')).toBe('Fefelova Kristina')
    expect(displayName('Денисов,Максим')).toBe('Денисов Максим')
    expect(displayName('AI Julia')).toBe('AI Julia')
    expect(displayName('Solo,')).toBe('Solo')
    expect(displayName('')).toBe('')
    expect(initials(displayName('Fefelova,Kristina'))).toBe('FK')
  })

  it('asks for a camera layer that matches the tile', () => {
    // Strip tile next to a 16:10 screen, corner tile, grid of 9, grid of 1 (VideoQuality LOW/MEDIUM/HIGH).
    expect(videoQualityFor(98)).toBe(0)
    expect(videoQualityFor(151)).toBe(0)
    expect(videoQualityFor(345)).toBe(1)
    expect(videoQualityFor(1064)).toBe(2)
  })

  it('keeps the trailing slash the page needs to load its script', () => {
    expect(normalizeTemplateUrl('https://host/_love/egress-template')).toBe('https://host/_love/egress-template/')
    expect(normalizeTemplateUrl('https://host/_love/egress-template/')).toBe('https://host/_love/egress-template/')
    expect(normalizeTemplateUrl(' http://love:8096/egress-template?x=1 ')).toBe('http://love:8096/egress-template/?x=1')
    expect(normalizeTemplateUrl('https://host/t/index.html')).toBe('https://host/t/index.html')
    expect(normalizeTemplateUrl('')).toBe('')
    expect(normalizeTemplateUrl(undefined)).toBe('')
  })

  it('builds initials from the first two words', () => {
    expect(initials('Sobolev Andrey')).toBe('SA')
    expect(initials('денисов максим петрович')).toBe('ДМ')
    expect(initials('  single ')).toBe('S')
    expect(initials('')).toBe('')
  })
})
