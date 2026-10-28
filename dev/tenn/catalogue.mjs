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

// Layout of a library category on its canvas: components of one group (Forms/Toggle and Forms/Toggle/off are the group
// Toggle) sit side by side in a framed section, the sections are packed on shelves. Positions depend only on the kit data.

// Spacing of the canvas: between sections, between variants, inside a section (the title takes the top band)
export const GAP = { group: 48, variant: 32, pad: 24, title: 44 }
// Widest a shelf of variants and a shelf of sections may grow before it wraps
const ROW_W = 1500
const SHELF_W = 2400
// Text is measured with the advance widths of the kit (host.textWidth), 20% wider: the renderer font is wider than the kit table, an overlap is worse than air
const WIDER = 1.2

const pads = (p) => {
  if (typeof p === 'number') return [p, p, p, p]
  if (!Array.isArray(p)) return [0, 0, 0, 0]
  if (p.length === 2) return [p[0], p[1], p[0], p[1]]
  if (p.length === 4) return p
  return [0, 0, 0, 0]
}

// Size of a node tree as the Tenniarb layout will draw it, from what the kit declared: numbers are taken as they are,
// content-sized frames are summed from their visible children, text is measured by its length.
// avail: the room a `fill_container` axis gets from the parent (absent: the content size).
export function estimate (node, env, avail = {}) {
  const { comps, textWidth } = env
  if (node.type === 'text') {
    const fs = node.fontSize ?? 14
    const lh = fs * (node.lineHeight ?? 1.25)
    const wide = (t) => Math.ceil(textWidth(t, fs) * WIDER)
    const lines = String(node.content ?? '').split('\n')
    const room = typeof node.width === 'number' ? node.width : node.width === 'fill_container' ? avail.w : undefined
    if (room !== undefined) {
      // greedy word wrap in the fixed width
      const rows = lines.reduce((n, l) => {
        let rows = 1
        let line = ''
        for (const word of l.split(' ')) {
          const next = line === '' ? word : line + ' ' + word
          if (line !== '' && wide(next) > room) { rows++; line = word } else line = next
        }
        return n + rows
      }, 0)
      return { w: room, h: rows * lh }
    }
    return { w: Math.max(...lines.map(wide)), h: lines.length * lh }
  }
  const own = (v, key) => (typeof v === 'number' ? v : undefined)
  let w = own(node.width)
  let h = own(node.height)
  if (node.type === 'ref') {
    const c = comps.get(node.ref)
    const inner = c === undefined ? {} : estimate(c.json, env, avail)
    return { w: w ?? inner.w ?? 0, h: h ?? inner.h ?? 0 }
  }
  if (node.type !== 'frame') return { w: w ?? 0, h: h ?? 0 }
  if (w !== undefined && h !== undefined) return { w, h } // fixed size; fill children never change it
  const [pt, pr, pb, pl] = pads(node.padding)
  const kids = (node.children ?? []).filter((k) => k.enabled !== false)
  const gap = node.gap ?? 0
  const horizontal = node.layout === 'horizontal'
  if (node.layout === 'none') {
    // fit on a frame without layout keeps the declared size; reach of the children is the best guess left
    const r = kids.map((k) => { const s = estimate(k, env); return { x: (k.x ?? 0) + s.w, y: (k.y ?? 0) + s.h } })
    return { w: w ?? Math.max(0, ...r.map((v) => v.x)), h: h ?? Math.max(0, ...r.map((v) => v.y)) }
  }
  const innerW = (w ?? (node.width === 'fill_container' ? avail.w : undefined))
  const innerH = (h ?? (node.height === 'fill_container' ? avail.h : undefined))
  const roomW = innerW === undefined ? undefined : innerW - pl - pr
  const roomH = innerH === undefined ? undefined : innerH - pt - pb
  // Fixed children first, fill children share what is left of the main axis
  const fill = (k, axis) => k[axis === 'w' ? 'width' : 'height'] === 'fill_container'
  const sizes = kids.map((k) => estimate(k, env, { w: horizontal ? undefined : roomW, h: horizontal ? roomH : undefined }))
  if (horizontal && roomW !== undefined) {
    const fills = kids.filter((k) => fill(k, 'w'))
    if (fills.length > 0) {
      const used = kids.reduce((n, k, i) => n + (fill(k, 'w') ? 0 : sizes[i].w), 0) + gap * (kids.length - 1)
      const share = Math.max(0, (roomW - used) / fills.length)
      kids.forEach((k, i) => { if (fill(k, 'w')) sizes[i] = estimate(k, env, { w: share, h: roomH }) })
    }
  }
  if (horizontal && node.metadata?.type === 'wrap' && roomW !== undefined) {
    // children flow into lines of the room, the gap is both the gap in a line and between lines
    const lines = shelves(sizes, roomW, gap)
    return { w: w ?? Math.ceil(lines.w + pl + pr), h: h ?? Math.ceil(lines.h + pt + pb) }
  }
  const main = horizontal ? 'w' : 'h'
  const cross = horizontal ? 'h' : 'w'
  const mainSum = sizes.reduce((n, s) => n + s[main], 0) + gap * Math.max(0, kids.length - 1)
  const crossMax = Math.max(0, ...sizes.map((s) => s[cross]))
  const fitW = (horizontal ? mainSum : crossMax) + pl + pr
  const fitH = (horizontal ? crossMax : mainSum) + pt + pb
  return { w: w ?? Math.ceil(fitW), h: h ?? Math.ceil(fitH) }
}

// Group of a component: the name without the variant, 'Forms/Toggle/off' -> 'Forms/Toggle'
export const groupOf = (name) => name.split('/').slice(0, 2).join('/')

// Shelf packing of boxes [{ w, h }] into rows no wider than limit (a box wider than the limit gets a row of its own).
// Returns the position of every box and the size of the whole.
export function shelves (boxes, limit, gap) {
  const at = []
  let x = 0
  let y = 0
  let rowH = 0
  let width = 0
  for (const b of boxes) {
    if (x > 0 && x + b.w > limit) { x = 0; y += rowH + gap; rowH = 0 }
    at.push({ x, y })
    x += b.w + gap
    rowH = Math.max(rowH, b.h)
    width = Math.max(width, x - gap)
  }
  return { at, w: width, h: boxes.length === 0 ? 0 : y + rowH }
}

// list: [{ name, size: { w, h } }] of one category in library order.
// Returns { groups: [{ name, x, y, w, h, members: [{ name, x, y }] }], w, h } with absolute positions (Y grows down).
export function layoutCategory (list) {
  const order = []
  const byGroup = new Map()
  for (const c of list) {
    const g = groupOf(c.name)
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g) }
    byGroup.get(g).push(c)
  }
  const groups = order.map((g) => {
    const members = byGroup.get(g)
    const packed = shelves(members.map((m) => m.size), ROW_W, GAP.variant)
    return {
      name: g.split('/')[1] ?? g,
      w: packed.w + 2 * GAP.pad,
      h: packed.h + GAP.title + GAP.pad,
      members: members.map((m, i) => ({ name: m.name, w: m.size.w, h: m.size.h, x: GAP.pad + packed.at[i].x, y: GAP.title + packed.at[i].y }))
    }
  })
  const outer = shelves(groups, Math.max(SHELF_W, ...groups.map((g) => g.w)), GAP.group)
  groups.forEach((g, i) => {
    g.x = outer.at[i].x
    g.y = outer.at[i].y
    for (const m of g.members) { m.x += g.x; m.y += g.y }
  })
  return { groups, w: outer.w, h: outer.h }
}
