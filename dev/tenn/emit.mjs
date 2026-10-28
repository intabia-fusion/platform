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

// Node trees of the kit (library definitions and screens) -> .tenn text. Ports the decisions of
// tenniarb/go/penimport (props.go, overrides.go, defaults.go) to the kit tree: `ref` names a library component,
// descendants of an instance are keyed by child index paths ('#i/j'). See README.md.
import { P, num, word, str, normalize, nameArg, printCmd } from './print.mjs'
import { GAP, estimate, layoutCategory } from './catalogue.mjs'
import { LIBS, libOf, isFlat, libFile } from './libs.mjs'

// host: the kit host after the scripts ran (pages, components); mode: the theme the colors are resolved for.
// Returns { library(), screens(pages), app(categories), warnings }: warnings count what the node tree has and .tenn cannot say.
export function createEmitter (host, TOKENS, mode) {
  // ---------- small helpers ----------
  const unsup = {}
  const note = (k) => { unsup[k] = (unsup[k] || 0) + 1 }
  // ---------- colors: tokens are resolved for the theme (the tenn spec has no variables) ----------
  function hex (s) {
    s = s.replace('#', '').toLowerCase()
    if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join('')
    return '#' + s
  }
  function colorOf (v) {
    if (typeof v !== 'string') return undefined
    if (!v.startsWith('$')) return hex(v)
    const name = v.slice(1)
    let r
    if (name.startsWith('palbge-')) r = TOKENS.paletteBackgroundEnd[mode][name.slice(7)]
    else if (name.startsWith('palbg-')) r = TOKENS.paletteBackground[mode][name.slice(6)]
    else if (name.startsWith('palt-')) r = TOKENS.paletteTitle[mode][name.slice(5)]
    else if (name.startsWith('pal-')) r = TOKENS.palette[mode][name.slice(4)]
    else r = TOKENS.colors[mode][name] ?? TOKENS.colors.light[name] // a token without a dark value keeps the light one
    if (r === undefined) throw new Error('no variable ' + name)
    return hex(r)
  }
  // The flat color of a fill or a stroke; a gradient gives its first stop
  function paint (v) {
    if (v === undefined || v === null) return undefined
    if (typeof v === 'string') return colorOf(v)
    if (v.type === 'gradient') return colorOf(v.colors[0].color)
    note('fill ' + v.type)
  }
  // The value of `color`: a flat color, or `linear ANGLE COLOR POS ...` for a linear gradient (spec 5a.16).
  // The angle is CSS (0 up, 90 right), pen rotation is counter-clockwise: 360 - rotation. A gradient with a center,
  // a size of its own, another kind, or on text or a path keeps its first stop.
  function fillArgs (v, typ) {
    const flat = [word(paint(v))]
    if (typeof v !== 'object' || v === null || v.type !== 'gradient') return flat
    const cols = v.colors ?? []
    const own = v.center !== undefined || (v.size && (v.size.width !== undefined || (v.size.height !== undefined && v.size.height !== 1)))
    const stops = cols.map((c) => [colorOf(c.color), c.position])
    if (typ === 'text' || typ === 'path' || (v.gradientType ?? 'linear') !== 'linear' || own || cols.length < 2 || stops.some(([c, p]) => c === undefined || typeof p !== 'number')) {
      note('gradient fill (first stop)')
      return flat
    }
    // Equal stops are a flat color (a palette header in the light theme)
    if (stops.every(([c]) => c === stops[0][0])) return flat
    const angle = (((360 - (v.rotation ?? 0)) % 360) + 360) % 360
    return [word('linear'), num(angle), ...stops.flatMap(([c, p]) => [word(c), num(p)])]
  }

  // ---------- properties (port of props.go) ----------
  const sizeProp = (name, v, explicit) => {
    if (typeof v === 'number') return [P(name, num(v))]
    if (typeof v === 'string') {
      const w = v.startsWith('fill_container') ? 'fill' : 'hug'
      if (w === 'hug' && !explicit) return []
      return [P(name, word(w))]
    }
    return []
  }
  const padArgs = (p) => {
    if (!Array.isArray(p)) return [num(p)]
    const [t, r, b, l] = p.length === 2 ? [p[0], p[1], p[0], p[1]] : p
    if (t === r && r === b && b === l) return [num(t)]
    return t === b && r === l ? [num(t), num(r)] : [num(t), num(r), num(b), num(l)]
  }
  const ALIGN = { center: 'center', end: 'end', space_between: 'space-between' }
  function layoutProps (m, explicit) {
    const ps = []
    if (m.layout !== undefined || !explicit) ps.push(P('auto-layout', word(m.layout === 'vertical' ? 'column' : m.layout === 'none' ? 'abs' : 'row')))
    if (typeof m.gap === 'number' && (m.gap !== 0 || explicit)) ps.push(P('gap', num(m.gap)))
    if (m.padding !== undefined) ps.push(P('padding', ...padArgs(m.padding)))
    for (const [k, name] of [['alignItems', 'align'], ['justifyContent', 'justify']]) {
      const v = m[k]
      if (v === undefined) continue
      if (ALIGN[v]) ps.push(P(name, word(ALIGN[v])))
      else if (v === 'space_around') note(k + ' space_around')
      else if (explicit && v === 'start') ps.push(P(name, word('start')))
    }
    return ps
  }
  function radiusProp (v) {
    if (typeof v === 'number') return v > 0 ? [P('corner-radius', num(v))] : []
    if (Array.isArray(v)) {
      const same = v.every((x) => x === v[0])
      const a = same ? [v[0]] : v
      return a[0] > 0 || a.length > 1 ? [P('corner-radius', ...a.map(num))] : []
    }
    return []
  }
  function shadowProp (e) {
    const list = Array.isArray(e) ? e : [e]
    const s = list.find((x) => x.type === 'shadow' && x.shadowType !== 'inner')
    if (!s) return []
    // Y points up as in pos: a shadow that falls down has a negative dy
    return [P('shadow', num(s.offset?.x ?? 0), num(-(s.offset?.y ?? 0)), num(s.blur ?? 0), word(colorOf(s.color) ?? '#00000040'))]
  }
  const viewBoxProp = (m) => {
    if (Array.isArray(m.viewBox) && m.viewBox.length === 4) return [P('view-box', ...m.viewBox.map(num))]
    if (typeof m.width === 'number' && typeof m.height === 'number') return [P('view-box', num(0), num(0), num(m.width), num(m.height))]
    return []
  }
  function lookProps (m, typ, x) {
    const fill = paint(m.fill)
    const stroke = paint(m.stroke)
    let sw = m.strokeWidth ?? 0
    if (stroke && sw === 0) sw = 1
    if (stroke && m.strokeAlignment !== 'inner') note('stroke alignment other than inner')
    if (x.explicit) {
      const ps = []
      if (typ === 'path' && typeof m.geometry === 'string') { ps.push(P('path', str(m.geometry))); ps.push(...viewBoxProp({ ...x.eff, ...m })) } else if (typ === 'path' && m.viewBox) ps.push(...viewBoxProp(m))
      if (typ === 'path' && m.fillRule === 'evenodd') ps.push(P('fill-rule', word('evenodd')))
      if (m.fill !== undefined && fill) ps.push(P(typ === 'text' ? 'text-color' : 'color', ...fillArgs(m.fill, typ)))
      if (m.stroke !== undefined && stroke) ps.push(P('border-color', word(stroke)))
      if (m.strokeWidth !== undefined || stroke) ps.push(P('line-width', num(sw)))
      return ps
    }
    if (typ === 'text') return fill ? [P('text-color', word(fill))] : []
    if (typ === 'path') {
      if (!m.geometry || (!fill && !stroke)) return []
      const ps = [P('path', str(m.geometry)), ...viewBoxProp(m)]
      if (m.fillRule === 'evenodd') ps.push(P('fill-rule', word('evenodd')))
      if (fill) ps.push(P('color', ...fillArgs(m.fill, typ)))
      if (stroke) ps.push(P('border-color', word(stroke)), P('line-width', num(sw)))
      return ps
    }
    const ps = []
    if (typ === 'ellipse') {
      if (typeof m.width === 'number') ps.push(P('corner-radius', num(m.width / 2)))
      else note('ellipse of flexible width')
    }
    if (fill) ps.push(P('color', ...fillArgs(m.fill, typ)))
    else if (typ === 'ellipse') ps.push(P('color', word('#00000000')))
    if (stroke) ps.push(P('border-color', word(stroke)), P('line-width', num(sw)))
    else if (fill || typ === 'ellipse') ps.push(P('line-width', num(0)))
    return ps
  }
  function fontProps (m, explicit) {
    const ps = []
    if (m.fontFamily) ps.push(P('font-family', str(m.fontFamily)))
    const w = m.fontWeight
    if (w !== undefined && (explicit || (w !== 'normal' && String(w) !== '400'))) ps.push(P('font-weight', word(String(w))))
    if (m.fontStyle && (explicit || m.fontStyle !== 'normal')) ps.push(P('font-style', word(m.fontStyle)))
    if (typeof m.letterSpacing === 'number' && (explicit || m.letterSpacing !== 0)) ps.push(P('letter-spacing', num(m.letterSpacing)))
    return ps
  }
  function textProps (m, x) {
    const ps = []
    if (typeof m.content === 'string') ps.push(P('title', str(m.content)))
    if (m.fontSize !== undefined || m.lineHeight !== undefined || !x.explicit) {
      const eff = x.eff ?? m
      const size = eff.fontSize || 14
      if (size !== 18 || x.explicit) ps.push(P('font-size', num(size)))
      if (eff.lineHeight > 0) ps.push(P('line-height', num(Math.round(eff.lineHeight * size))))
    }
    ps.push(...fontProps(m, x.explicit))
    if (m.textAlign === 'center') ps.push(P('layout', word('middle')))
    else if (m.textAlign === 'right') ps.push(P('layout', word('right')))
    else if (m.textAlign !== undefined || !x.explicit) ps.push(P('layout', word('left')))
    return ps
  }
  function props (m, typ, x) {
    const ps = []
    if (typ === 'frame') ps.push(...layoutProps(m, x.explicit))
    if (typ === 'text') {
      ps.push(...textProps(m, x))
      if (!x.explicit) ps.push(P('auto-layout', word('row')))
    }
    for (const k of ['width', 'height']) if (m[k] !== undefined) ps.push(...sizeProp(k, m[k], x.explicit))
    if (typeof m.clip === 'boolean' && (m.clip || x.explicit)) ps.push(P('clip', word(m.clip ? 'yes' : 'no')))
    ps.push(...lookProps(m, typ, x))
    if (typeof m.opacity === 'number' && (m.opacity < 1 || x.explicit)) ps.push(P('opacity', num(m.opacity)))
    if (m.cornerRadius !== undefined) ps.push(...radiusProp(m.cornerRadius))
    if (m.effect) ps.push(...shadowProp(m.effect))
    if (m.metadata?.type === 'wrap') ps.push(P('wrap', word('yes')), P('line-gap', num(m.gap ?? 0)))
    for (const k of ['rotation', 'flipX', 'flipY', 'strokeLinecap', 'strokeLinejoin']) if (m[k]) note(k)
    return ps
  }
  const hiddenProp = (m, explicit) => (m.enabled === false ? [P('hidden', word('yes'))] : m.enabled === true && explicit ? [P('hidden', word('no'))] : [])
  const posProps = (m, ctx, explicit) => {
    const ps = []
    if ((ctx.top || ctx.parentAbs || explicit) && (m.x || m.y || explicit || ctx.top)) ps.push(P('pos', num(m.x ?? 0), num(-(m.y ?? 0))))
    return ps
  }

  // ---------- names: unique sibling keys inside a component, so that at/replace paths are not ambiguous ----------
  const comps = new Map() // component name -> { name, json } (json: the definition as a node tree)
  // First segments a use can start with: the category of a multi-category library, any library
  const catNames = [...new Set(host.components.map((c) => c.name.split('/')[0]))]
  for (const c of catNames) if (libOf(c) === undefined) throw new Error(`category ${c} is not in any library (dev/tenn/libs.mjs)`)
  const CATS = new Set([...LIBS.map((l) => normalize(l.name)), ...catNames.filter((c) => !isFlat(libOf(c))).map(normalize)])
  // An item named like its category would capture the short paths of the library (spec 5a.2): keep the full name then
  const itemName = (name) => {
    const [cat, ...rest] = name.split('/')
    const r = rest.join('/') || cat
    return CATS.has(normalize(r)) ? name : r
  }
  const keyOf = (n) => normalize(n.name ?? n.type)
  function dedupe (node, taken) {
    const seen = new Set()
    for (const k of node.children ?? []) {
      let name = String(k.name ?? k.type)
      // A first path segment equal to a category or to an item of the same category would capture a use (spec 5a.2)
      if (/^\d/.test(normalize(name)) || CATS.has(normalize(name)) || taken.has(normalize(name))) name = '_' + name
      let n = name
      for (let i = 2; seen.has(normalize(n)); i++) n = name + ' ' + i
      seen.add(normalize(n))
      k.name = n
      k._key = keyOf(k)
      dedupe(k, taken)
    }
  }
  // A slot is addressed by the name of its frame, suffixed on a clash. An empty fill of the unnamed slot keeps
  // its fallback in go/scene, so the root slot is named too.
  function slotNames (node, taken) {
    if (Array.isArray(node.slot)) {
      const base = node === taken.root ? 'content' : normalize(node.name)
      let n = base
      for (let i = 2; taken.has(n); i++) n = base + '_' + i
      node._slot = n
      taken.add(n)
    }
    for (const k of node.children ?? []) slotNames(k, taken)
  }
  // Every definition is built before any is renamed: the template of a variant is cached on its first use
  const defs = host.components.map((c) => ({ name: c.name, json: c.toLib(false) }))
  const itemKeys = new Map() // category -> normalized item names, the first segment of a use inside its file
  for (const d of defs) {
    const cat = d.name.split('/')[0]
    if (!itemKeys.has(cat)) itemKeys.set(cat, new Set())
    itemKeys.get(cat).add(normalize(itemName(d.name)))
  }
  for (const d of defs) {
    d.json._key = normalize(d.name)
    dedupe(d.json, itemKeys.get(d.name.split('/')[0]))
    const taken = new Set()
    taken.root = d.json
    slotNames(d.json, taken)
    comps.set(d.name, d)
  }

  // Where the path is written: null in a screen file (the libraries are mounted by the entry document, the path starts with
  // the name of one), else the category file being written: its own items by name, a category of its library by
  // Category.item (the library file mounts them), another library by its name.
  let home = null
  const compPath = (name) => {
    const cat = name.split('/')[0]
    const item = normalize(itemName(name))
    const lib = libOf(cat)
    const inLib = isFlat(lib) ? `${lib.name}.${item}` : `${lib.name}.${normalize(cat)}.${item}`
    if (home === null) return inLib
    if (cat === home) return item
    if (libOf(home) === lib) return `${normalize(cat)}.${item}`
    return inLib
  }

  // ---------- tree -> commands ----------
  function itemCmd (m, ctx, tail) {
    const typ = m.type
    const x = { explicit: false }
    const body = []
    body.push(...hiddenProp(m, false), ...props(m, typ, x), ...posProps(m, ctx, false))
    const kids = []
    let holder = kids
    if (Array.isArray(m.slot) && typ === 'frame') {
      const slotCmd = { kind: 'slot', name: m._slot || null, body: [], kids: [] }
      kids.push(slotCmd)
      holder = slotCmd.kids
    }
    const cctx = { parentAbs: m.layout === 'none', layout: typ === 'frame' }
    for (const k of m.children ?? []) holder.push(nodeCmd(k, cctx))
    let leafTitle = false
    if (typ !== 'text' && typ !== 'frame' && !kids.length && !ctx.layout && !body.some((p) => p.name === 'path')) leafTitle = true
    return { kind: 'item', name: m.name, props: leafTitle ? [P('title', str('')), ...body] : body, kids }
  }
  function nodeCmd (m, ctx) {
    if (m.type === 'ref') return useCmd(m, ctx)
    return itemCmd(m, ctx)
  }
  function baseAt (def, path) {
    let n = def
    for (const i of path) n = n.children[i]
    return n
  }
  function useCmd (m, ctx) {
    const comp = comps.get(m.ref)
    if (!comp) throw new Error('unknown component ' + m.ref)
    const root = comp.json
    const rootProps = { ...m }
    for (const k of ['type', 'ref', 'name', 'descendants', 'children', 'x', 'y', 'reusable', 'enabled', 'metadata']) delete rootProps[k]
    for (const k of Object.keys(rootProps)) if (JSON.stringify(rootProps[k]) === JSON.stringify(root[k])) delete rootProps[k]
    const props_ = [...hiddenProp(m, false), ...props(rootProps, root.type, { explicit: true, eff: { ...root, ...rootProps } }), ...posProps(m, ctx, ctx.top)]
    const block = []
    if (Array.isArray(m.children)) block.push(...fillCmds(root, m.children, true))
    const fills = []
    const keys = Object.keys(m.descendants ?? {}).sort((a, b) => cmpPath(a, b))
    for (const key of keys) {
      const ov = m.descendants[key]
      if (!key.startsWith('#')) { // a name key such as 'initials'
        const segs = key.split('/').map(normalize)
        let n = root
        for (const sg of segs) n = (n.children ?? []).find((c) => c._key === sg)
        if (!n) throw new Error('no node ' + key + ' in ' + m.ref)
        block.push({ kind: 'at', path: segs.join('.'), props: ovProps(ov, n, null), kids: [] })
        continue
      }
      const idx = key.slice(1).split('/').map(Number)
      const chain = []
      let n = root
      for (const i of idx) { if (!n.children?.[i]) throw new Error('bad path ' + key + ' in ' + m.ref + ' at ' + i); n = n.children[i]; chain.push(n._key) }
      const parent = idx.length > 1 ? baseAt(root, idx.slice(0, -1)) : root
      if (ov.type !== undefined) { // a replacement of the part
        block.push({ kind: 'replace', path: chain.join('.'), props: [], kids: [nodeCmd(ov, { parentAbs: parent.layout === 'none', layout: true })] })
        continue
      }
      const ops = { kind: 'at', path: chain.join('.'), props: ovProps(ov, n, parent), kids: [] }
      if (Array.isArray(ov.children)) fills.push(...fillCmds(n, ov.children, false))
      if (ops.props.length) block.push(ops)
    }
    return { kind: 'use', path: compPath(m.ref), as: m.name, props: props_, kids: [...block, ...fills] }
  }
  const cmpPath = (a, b) => {
    const x = a.replace('#', '').split('/').map(Number)
    const y = b.replace('#', '').split('/').map(Number)
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]
    return x.length - y.length
  }
  function ovProps (ov, base, parent) {
    const rest = { ...ov }
    for (const k of ['children', 'enabled', 'x', 'y', 'layoutPosition', 'descendants']) delete rest[k]
    const typ = base.type === 'ref' ? 'frame' : base.type
    const eff = { ...base, ...ov }
    const ps = [...hiddenProp(ov, true), ...props(rest, typ, { explicit: true, eff })]
    if (ov.x !== undefined || ov.y !== undefined) ps.push(P('pos', num(eff.x ?? 0), num(-(eff.y ?? 0))))
    return ps
  }
  // slot fill: children go to the slot of the frame (named by the frame, the unnamed one for the root)
  function fillCmds (node, kids, root) {
    const out = []
    const cctx = { parentAbs: node.layout === 'none', layout: true }
    const nodes = kids.map((k) => nodeCmd(k, cctx))
    out.push({ kind: 'slotfill', name: node._slot || null, kids: nodes })
    return out
  }

  // ---------- defaults (port of defaults.go) ----------
  const has = (cs, n) => cs.some((c) => c.name === n)
  function dropDefaults (cmds, parentAuto) {
    for (const c of cmds) {
      if (c.kind === 'item') {
        const auto = parentAuto || has(c.props, 'auto-layout')
        const hasKids = c.kids.length > 0
        c.props = c.props.filter((p) => {
          const v = p.args[0]?.s
          if (p.name === 'color') return !(v === '#00000000' && (has(c.props, 'auto-layout') || parentAuto))
          if (p.name === 'line-width') return !(Number(v) === 1 || ((has(c.props, 'auto-layout') || parentAuto) && !has(c.props, 'border-color')))
          if (p.name === 'text-color') return !(v === '#000000' && !has(c.props, 'color'))
          if (p.name === 'auto-layout') {
            if (v !== 'row' || !parentAuto || hasKids) return true
            return ['padding', 'gap', 'line-gap', 'wrap', 'align', 'justify'].some((n) => has(c.props, n))
          }
          return true
        })
        dropDefaults(c.kids, auto)
      } else if (c.kind === 'slot' || c.kind === 'slotfill') dropDefaults(c.kids, parentAuto)
      else dropDefaults(c.kids ?? [], false)
    }
  }

  // ---------- library catalogue ----------
  // Icons are one component per name, nothing to group: a fixed grid of cells.
  const ICON_CELL = { w: 48, h: 48, cols: 16 }

  // Screens of an application category: 1920x1080 frames, 120 apart horizontally and vertically, two per row
  const GRID = { cols: 2, w: 2040, h: 1200 }

  // ---------- library: one command tree per category ----------
  function libItem (c) {
    let cmd
  try { cmd = itemCmd(c.json, { top: false, parentAbs: false, layout: false }) } catch (e) { throw new Error(c.name + ': ' + e.message) }
    cmd.name = itemName(c.name)
    return cmd
  }

  const categories = new Map()
  for (const c of comps.values()) {
    const cat = c.name.split('/')[0]
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat).push(c)
  }

  const categoryFile = (cat) => 'lib/' + cat.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.tenn'

  // Section frame of a group: a bordered frame with the group name, a sibling of its components, not their parent,
  // so that the path of a component (<library>.<Category>.<Item>) does not change. The name starts with § and is not a component.
  const sectionCmd = (g) => {
    const node = {
      type: 'frame', name: '§ ' + g.name, width: Math.ceil(g.w), height: Math.ceil(g.h), layout: 'none', clip: false,
      stroke: '$theme-divider-color', strokeWidth: 1, strokeAlignment: 'inner', cornerRadius: 8,
      children: [{ type: 'text', name: 'title', content: g.name, fontFamily: 'IBM Plex Sans', fontSize: 13, fontWeight: '600', lineHeight: 1.25, fill: '$theme-caption-color', x: GAP.pad, y: 14 }]
    }
    const cmd = itemCmd(node, { top: false, parentAbs: false, layout: false })
    cmd.props.push(P('pos', num(g.x), num(-g.y)))
    return cmd
  }

  // Files of the library, relative to the output folder: the root only mounts the category files
  function library () {
    const files = []
    const canvas = {} // category -> { w, h }: the size of the layout
    for (const [cat, list] of categories) {
      home = cat
      const cmds = []
      if (cat === 'Icon') {
        list.forEach((c, i) => {
          const cmd = libItem(c)
          cmd.props.push(P('pos', num((i % ICON_CELL.cols) * ICON_CELL.w), num(-Math.floor(i / ICON_CELL.cols) * ICON_CELL.h)))
          cmds.push(cmd)
        })
        canvas[cat] = { w: ICON_CELL.cols * ICON_CELL.w, h: Math.ceil(list.length / ICON_CELL.cols) * ICON_CELL.h }
      } else {
        const lay = layoutCategory(list.map((c) => ({ name: c.name, size: estimate(c.json, { comps, textWidth: host.textWidth }) })))
        canvas[cat] = { w: Math.ceil(lay.w), h: Math.ceil(lay.h) }
        const at = new Map(lay.groups.flatMap((g) => g.members.map((m) => [m.name, m])))
        for (const g of lay.groups) cmds.push(sectionCmd(g)) // sections first, so that the components are drawn over them
        for (const c of list) {
          const cmd = libItem(c)
          const m = at.get(c.name)
          cmd.props.push(P('pos', num(m.x), num(-m.y)))
          cmds.push(cmd)
        }
      }
      dropDefaults(cmds, false)
      const out = []
      for (const m of cmds) printCmd(m, 0, out)
      files.push({ path: categoryFile(cat), text: out.join('\n') + '\n' })
    }
    home = null
    // The file of a multi-category library only mounts its categories, one file each
    for (const lib of LIBS.filter((l) => !isFlat(l))) {
      const mounts = lib.categories.map((cat) => `element ${nameArg(cat)} --from-file "${categoryFile(cat)}"`)
      files.unshift({ path: libFile(lib, categoryFile), text: mounts.join('\n') + '\n' })
    }
    return { files, canvas }
  }

  // ---------- screens: an element per page (task files) or per category (application files), the library mounted as ui_kit ----------
  function pageElement (name, frames) {
    const el = { kind: 'element', name: name.replace(/\.\s*/g, ' ').trim(), kids: [] } // a dot in an element name breaks its path
    // top frames: kit coordinates of the page, Y flipped by posProps
    for (const f of frames) el.kids.push(nodeCmd(f.toNode('none', true), { top: true, parentAbs: false, layout: false }))
    dropDefaults(el.kids, false)
    return el
  }
  function elementsFile (elements) {
    home = null
    const out = []
    for (const el of elements) printCmd(el, 0, out)
    return out.join('\n') + '\n'
  }
  const screens = (pages) => elementsFile([...pages].map(([page, frames]) => pageElement(page, frames)))

  // Application file: an element per category, its screens on a fixed grid (the frame keeps its size, only the position is set).
  // categories: [{ name, frames }] in the order of the taxonomy
  function app (categories) {
    return elementsFile(categories.map(({ name, frames }) => {
      frames.forEach((f, i) => {
        f.x = (i % GRID.cols) * GRID.w
        f.y = Math.floor(i / GRID.cols) * GRID.h
      })
      return pageElement(name, frames)
    }))
  }

  const libs = LIBS.map((l) => ({ name: l.name, file: libFile(l, categoryFile) }))
  return { library, screens, app, categories, libs, warnings: unsup }
  }
