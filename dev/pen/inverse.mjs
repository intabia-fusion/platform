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

// The inverse of kit/95-library.js: a library instance (`ref` + `descendants`) back to the kit call that makes it.
// The library samples (`def(name, kit.Fn(args))` in library/ui-kit.js) are the only table: a value of the sample
// arguments is found again in the template (text, nested instance, optional part), so a new component needs nothing here
// unless its slots carry data (LIFT in lifts.mjs).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { here, TOKENS, DEMO, buildIcons, kitSource, AsyncFunction, newHost } from './env.mjs'

export const isPlain = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
export function deepEqual (a, b) {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  if (isPlain(a) && isPlain(b)) {
    const k = Object.keys(a)
    return k.length === Object.keys(b).length && k.every((key) => deepEqual(a[key], b[key]))
  }
  return false
}
const isLeaf = (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

// Sample arguments are copied; whatever is not plain data (shapes) is kept by reference and never written to
export function cloneArgs (v) {
  if (v instanceof String) return String(v)
  if (Array.isArray(v)) return v.map(cloneArgs)
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneArgs(x)]))
  return v
}
export function getAt (v, path) {
  for (const k of path) {
    if (v === undefined || v === null) return undefined
    v = v[k]
  }
  return v
}
export function setAt (v, path, value) {
  const parent = getAt(v, path.slice(0, -1))
  const key = path.at(-1)
  if (value === undefined && !Array.isArray(parent)) delete parent[key]
  else parent[key] = value
}

export async function loadKit () {
  const host = newHost()
  const body = kitSource + '\n' + readFileSync(join(here, 'library/ui-kit.js'), 'utf8') + '\nreturn { kit, fit }'
  const { kit, fit } = await new AsyncFunction('TOKENS', 'DEMO', 'ICONS', 'host', body)(TOKENS, DEMO, buildIcons(), host)
  const defs = new Map()
  for (const shape of host.components) {
    const tpl = shape.toLib(false)
    shape.tpl = tpl
    defs.set(shape.name, { name: shape.name, shape, tpl, call: shape.call, lib: shape.lib ?? {}, nodes: nodesOf(tpl) })
  }
  return { kit, fit, host, defs, TOKENS }
}

// ---- Trees: address of a node = child indexes joined by "/", the root is "" ----
export const addrOf = (parent, i) => (parent === '' ? String(i) : parent + '/' + i)
export function nodesOf (root) {
  const m = new Map()
  const walk = (n, a) => {
    m.set(a, n)
    ;(n.children ?? []).forEach((c, i) => walk(c, addrOf(a, i)))
  }
  walk(root, '')
  return m
}
export function idAddrs (comp) {
  const m = new Map()
  const walk = (n, a) => {
    m.set(n.id, a)
    ;(n.children ?? []).forEach((c, i) => walk(c, addrOf(a, i)))
  }
  walk(comp, '')
  return m
}

// ---- Views: what an instance changes in its component ----
// view = { name, props (root overrides), ov: Map(addr -> { props, children?, node? }), kids (children of the root slot), node }
const STRUCT = new Set(['id', 'type', 'ref', 'name', 'x', 'y', 'descendants', 'children'])
// A gradient fill (palette background) is read as its first stop, the palette variable
const flat = (v) => (v?.type === 'gradient' ? v.colors?.[0]?.color : v)
const propsOf = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !STRUCT.has(k)).map(([k, v]) => [k, k === 'fill' ? flat(v) : v]))
function entryOf (v) {
  return v.type !== undefined ? { props: v.enabled === undefined ? {} : { enabled: v.enabled }, node: v } : { props: propsOf(v), children: v.children }
}

// A nested instance of a template: component by its symbolic name, keys '#i/j' of descendants are addresses
export function viewOfTemplate (node) {
  const ov = new Map()
  for (const [k, v] of Object.entries(node.descendants ?? {})) ov.set(k.slice(1), entryOf(v))
  return { name: node.ref.slice(3), props: propsOf(node), ov, kids: node.children, node }
}

// An instance in a .pen file: `lib` is the index of the library the ref points into
export function viewOfInstance (node, lib, comp) {
  const addrs = lib.addrs(comp)
  const ov = new Map()
  for (const [k, v] of Object.entries(node.descendants ?? {})) {
    const id = k.split('/').at(-1).replace(/^[^:]*:/, '')
    const a = addrs.get(id)
    if (a === undefined) continue
    ov.set(a, entryOf(v))
  }
  return { name: comp.name, props: propsOf(node), ov, kids: node.children, node, comp }
}

// kit.StatusIcon of another size or color is drawn in place: a frame named after the category
function drawnStatusIcon (node, env) {
  const cat = node.name.slice(11)
  const paint = (node.children ?? []).map((c) => tokenName(c.stroke ?? c.fill)).find((v) => v?.startsWith('pal-'))
  const pal = paint?.slice(4)
  return { fn: 'StatusIcon', args: [cat, node.width, pal === env.kit.CATEGORY[cat] ? undefined : pal], view: null }
}
const tokenName = (c) => (typeof c === 'string' && c.startsWith('$') ? c.replace(/^\$(§|[^:]*:)?/, '') : undefined)

// Light value of a library variable (palette or theme color) a node refers to
const varLight = (c, env) => {
  const t = tokenName(c)
  if (t === undefined) return undefined
  const m = /^(pal|palbg|palt)-(.+)$/.exec(t)
  if (m === null) return env.TOKENS.colors.light[t]
  return env.TOKENS[{ pal: 'palette', palbg: 'paletteBackground', palt: 'paletteTitle' }[m[1]]].light[m[2]]
}

// ---- Atoms: refs that kit/90-pen.js and kit.icon make without a tagged function ----
export const palName = (hex, env) => {
  const tn = tokenName(hex)
  if (tn?.startsWith('pal-')) return tn.slice(4)
  const h = String(hex).toUpperCase()
  return Object.entries(env.TOKENS.palette.light).find(([, v]) => v.toUpperCase() === h)?.[0]
}
export function invertAtom (view, env) {
  const n = view.name
  const p = view.props
  if (n.startsWith('Icon/')) {
    const color = p.stroke ?? p.fill
    return { fn: 'icon', args: [n.slice(5), color === undefined ? undefined : { color }, p.width === 16 ? undefined : p.width] }
  }
  if (n.startsWith('Status/StatusIcon/')) return { fn: 'StatusIcon', args: [n.slice(18)] }
  if (n.startsWith('Status/PriorityIcon/')) return { fn: 'PriorityIcon', args: [n.slice(20)] }
  if (n === 'People/Avatar/empty') return { fn: 'AvatarEmpty', args: [p.width === 20 || p.width === undefined ? undefined : p.width] }
  if (n === 'People/Avatar') {
    const size = p.width ?? 20
    const initials = view.ov.get('0')?.props.content ?? 'AJ'
    const pal = p.fill === undefined ? 'Blueberry' : palName(p.fill, env)
    return { fn: 'Avatar', args: [initials, pal ?? 'Blueberry', size === 20 ? undefined : size, p.cornerRadius === size / 2 ? true : undefined], note: pal === undefined && p.fill !== undefined ? `avatar color ${p.fill} is not a palette color` : undefined }
  }
  return null
}

// ---- Bindings: where a value of the sample arguments shows in the template ----
function walkArgs (v, path, visit) {
  if (isLeaf(v)) visit(path, v)
  else if (Array.isArray(v)) {
    if (visit(path, v) === false) return
    v.forEach((x, i) => walkArgs(x, [...path, i], visit))
  } else if (isPlain(v)) {
    if (path.length > 0 && visit(path, v) === false) return
    for (const [k, x] of Object.entries(v)) walkArgs(x, [...path, k], visit)
  }
}
const hasShape = (v) => {
  if (Array.isArray(v)) return v.some(hasShape)
  if (isPlain(v)) return Object.values(v).some(hasShape)
  return v !== null && typeof v === 'object'
}

function underSlot (def, a) {
  if (a === '') return false
  const p = a.split('/')
  for (let i = 0; i < p.length; i++) if (def.nodes.get(p.slice(0, i).join('/'))?.slot !== undefined) return true
  return false
}

export function bindingsOf (def, env) {
  if (def.bindings) return def.bindings
  def.bindings = []
  // Samples made with P()/T() carry a variable name; keep it so that an unchanged sample is written back as the call
  def.sampleTokens = new Map()
  const keep = (v, path) => {
    if (v instanceof String && v.token !== undefined) def.sampleTokens.set(path.join('.'), v.token)
    else if (Array.isArray(v)) v.forEach((x, i) => keep(x, [...path, i]))
    else if (isPlain(v)) for (const [k, x] of Object.entries(v)) keep(x, [...path, k])
  }
  keep(def.call.args, [])
  def.call.args = cloneArgs(def.call.args)
  const args = def.call.args
  const nested = []
  for (const [addr, n] of def.nodes) {
    if (addr === '' || underSlot(def, addr)) continue
    const c = n.type === 'ref' ? invertView(viewOfTemplate(n), env) : n.type === 'frame' && n.name?.startsWith('StatusIcon/') ? drawnStatusIcon(n, env) : null
    if (c) nested.push({ addr, call: c })
  }
  // The children of a slot are sample content, an instance brings its own
  const own = [...def.nodes].filter(([a]) => !underSlot(def, a))
  const textAt = own.filter(([, n]) => n.type === 'text')
  const dims = own
  const shapes = hasShape(args)
  walkArgs(args, [], (path, v) => {
    const key = path.at(-1)
    const targets = []
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v)
      for (const [addr, n] of textAt) {
        if (n.content === s) targets.push({ type: 'text', addr })
        else if (typeof v === 'string' && n.content === s.toUpperCase() && s !== s.toUpperCase()) targets.push({ type: 'text', addr, upper: true })
      }
      // A value inside a longer text: "/ 8" carries the limit 8
      if (targets.length === 0 && (typeof v === 'number' || s.length > 1)) {
        for (const [addr, n] of textAt) {
          const i = typeof n.content === 'string' ? n.content.indexOf(s) : -1
          if (i >= 0 && (i === 0 || i + s.length === n.content.length)) targets.push({ type: 'text', addr, pre: n.content.slice(0, i), post: n.content.slice(i + s.length) })
        }
      }
    }
    // A palette name shows as the fill or stroke of a node
    const hex = typeof v === 'string' ? env.TOKENS.palette.light[v]?.toUpperCase() : undefined
    if (hex !== undefined) {
      for (const [addr, n] of own) for (const prop of ['fill', 'stroke']) if (typeof n[prop] === 'string' && (n[prop].toUpperCase() === hex || tokenName(n[prop]) === 'pal-' + v)) targets.push({ type: 'color', addr, prop })
    }
    if (typeof v === 'string' && /^#[0-9A-Fa-f]{6,8}$/.test(v)) {
      for (const [addr, n] of own) for (const prop of ['fill', 'stroke']) if (typeof n[prop] === 'string' && (n[prop].toUpperCase() === v.toUpperCase() || varLight(n[prop], env)?.toUpperCase() === v.toUpperCase())) targets.push({ type: 'literal', addr, prop })
    }
    if (typeof v === 'number' && (key === 'w' || key === 'h')) {
      const prop = key === 'w' ? 'width' : 'height'
      for (const [addr, n] of dims) if (n[prop] === v) targets.push({ type: 'dim', addr, prop })
    } else if (typeof v === 'number' && typeof key === 'number' && targets.length === 0) {
      // A size passed by position: the one node of that width
      const hit = dims.filter(([, n]) => n.width === v)
      if (hit.length === 1) targets.push({ type: 'dim', addr: hit[0][0], prop: 'width' })
    }
    const composite = !isLeaf(v)
    if (!composite || (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)) {
      const found = []
      for (const { addr, call } of nested) {
        walkArgs(call.args, [], (sub, sv) => {
          if (!deepEqual(sv, v)) return
          found.push({ type: 'nested', addr, sub, same: sub.at(-1) === key })
          return false
        })
      }
      // The same key is the likelier twin, a rename (action -> label) only counts when nothing else fits
      targets.push(...(found.some((t) => t.same) ? found.filter((t) => t.same) : found))
    }
    if (targets.length > 0) {
      def.bindings.push({ path, sample: v, targets })
      return composite ? false : undefined
    }
    if (typeof v === 'boolean' && !shapes) def.bindings.push({ path, sample: v, targets: [{ type: 'flag' }] })
    return undefined
  })
  return def.bindings
}

// What a flipped boolean changes against the template: key '#i/j' + property -> value
function flagDiff (def, path, env) {
  const cur = getAt(def.call.args, path)
  const alt = cloneArgs(def.call.args)
  setAt(alt, path, !cur)
  let s
  try { s = env.kit[def.call.fn](...alt) } catch { return null }
  const shape = def.call.fn === 'Workbench' || def.call.fn === 'LoginPage' ? s.frame : def.call.fn === 'Modal' || def.call.fn === 'WizardDialog' ? s.modal : s
  const diff = (pj) => {
    const ops = new Map()
    if (!env.fit(def.tpl, pj, [], ops, true, { cost: 0 })) return null
    const m = new Map()
    for (const [k, p] of ops) for (const [pk, pv] of Object.entries(p)) m.set(k.slice(1) + '|' + pk, pv)
    return m
  }
  const a = diff(shape.toPen('none', false, true))
  const c = diff(def.shape.toPen('none', false, true))
  if (a === null || c === null) return null
  const only = (x, y) => new Map([...x].filter(([k, v]) => !deepEqual(y.get(k), v)))
  const r = { cur: only(c, a), alt: only(a, c) }
  // A slot carries data the lifts read: a flag that only changes children is theirs
  return [...r.cur.keys(), ...r.alt.keys()].some((k) => k.endsWith('|children')) ? null : r
}

function effective (view, def, key) {
  const [addr, prop] = key.split('|')
  const v = view.ov.get(addr)?.props[prop]
  if (v !== undefined) return v
  return prop === 'enabled' ? def.nodes.get(addr)?.enabled !== false : def.nodes.get(addr)?.[prop]
}
const satisfied = (view, def, m) => [...m].every(([k, v]) => deepEqual(effective(view, def, k), v))

// A node is shown when it and its parents are not switched off, by the instance or by the library look
export function shown (view, def, addr) {
  const parts = addr === '' ? [] : addr.split('/')
  for (let i = 0; i <= parts.length; i++) {
    const a = parts.slice(0, i).join('/')
    const en = view.ov.get(a)?.props.enabled
    if (en === false || (en === undefined && def.nodes.get(a)?.enabled === false)) return false
  }
  return true
}

// The call of the nested instance at addr: the one the instance brings, or the library one
export const propOf = (view, addr, prop) => propAt(view, addr, prop)

export function nestedCall (view, def, addr, env) {
  const e = view.ov.get(addr)
  if (e?.node !== undefined) return nodeCall(e.node, env)
  const n = def.nodes.get(addr)
  if (n?.type === 'frame') return nodeCall(n, env)
  return n?.type === 'ref' ? invertView(viewOfTemplate(n), env) : null
}

function nestedValue (view, def, t, env) {
  const sub = nestedCall(view, def, t.addr, env)
  return sub === null ? undefined : getAt(sub.args, t.sub)
}

export function slotAddr (def, name) {
  if (name === '$root') return ''
  for (const [a, n] of def.nodes) if (n.slot !== undefined && n.name === name) return a
  return undefined
}
// Children an instance supplies for a slot; wrap rows that the pen session cut are joined again
export function slotKids (view, def, name) {
  const a = slotAddr(def, name)
  if (a === undefined) return []
  // The placeholder that keeps pen from outlining an empty slot (kit/95-library.js) is not content
  const kids = (a === '' ? view.kids : view.ov.get(a)?.children)?.filter((k) => k.name !== 'slot-empty')
  const wrap = def.nodes.get(a)?.metadata?.type === 'wrap'
  const rows = (kids ?? []).every((k) => k.type === 'frame' && /^row( \d+)?$/.test(k.name) && Array.isArray(k.children))
  return wrap && rows && (kids ?? []).length > 0 ? kids.flatMap((k) => k.children) : kids ?? []
}
export function findAddr (def, test) {
  for (const [a, n] of def.nodes) if (test(n)) return a
  return undefined
}

// An overridden property of the node at addr (the root's own come with the instance)
const propAt = (view, addr, prop) => {
  if (addr === '') return view.props[prop]
  const e = view.ov.get(addr)
  return e?.props[prop] ?? e?.node?.[prop]
}

const caseOf = (upper, view) => {
  const name = view.node?.name ?? ''
  for (let i = 0; i < name.length; i++) if (name.slice(i).toUpperCase() === upper) return name.slice(i)
  return undefined
}

function evalBinding (b, call, view, def, env) {
  let value = b.sample
  let found = false
  for (const t of b.targets) {
    let v
    if (t.type === 'flag') {
      if (def.flags === undefined) def.flags = new Map()
      const k = b.path.join('.')
      if (!def.flags.has(k)) def.flags.set(k, flagDiff(def, b.path, env))
      const fd = def.flags.get(k)
      if (fd === null || (fd.cur.size === 0 && fd.alt.size === 0)) continue
      const cur = fd.cur.size > 0 ? satisfied(view, def, fd.cur) : !satisfied(view, def, fd.alt)
      v = cur ? b.sample : !b.sample
    } else if (!shown(view, def, t.addr)) {
      v = undefined
    } else if (t.type === 'text') {
      let c = view.ov.get(t.addr)?.props.content
      // Uppercase text keeps its case only in the layer name of the instance
      if (t.upper) c = caseOf(c ?? b.sample.toUpperCase(), view) ?? c
      if (c !== undefined && t.pre !== undefined) c = c.startsWith(t.pre) && c.endsWith(t.post) ? c.slice(t.pre.length, c.length - t.post.length) : c
      v = c === undefined ? b.sample : typeof b.sample === 'number' && !Number.isNaN(Number(c)) ? Number(c) : c
    } else if (t.type === 'literal') {
      const c = propAt(view, t.addr, t.prop)
      v = typeof c === 'string' ? env.color(c) : b.sample
    } else if (t.type === 'color') {
      const c = propAt(view, t.addr, t.prop)
      v = (typeof c === 'string' ? palName(c, env) : undefined) ?? b.sample
    } else if (t.type === 'dim') {
      v = propAt(view, t.addr, t.prop) ?? b.sample
    } else v = nestedValue(view, def, t, env)
    if (!found || (deepEqual(value, b.sample) && !deepEqual(v, b.sample))) { value = v; found = true }
  }
  const token = def.sampleTokens?.get(b.path.join('.'))
  if (token !== undefined && value === b.sample) value = env.color('$§' + token)
  if (found) setAt(call.args, b.path, value)
}

// ---- Inverse ----
// Positional size arguments follow the root size of the instance
const SIZE = {
  TopBar: [[0, 'width']], AppRail: [[0, 'height']], Navigator: [[0, 'height']], Sidebar: [[0, 'height']], ColumnHeader: [[3, 'width']], IssueCard: [[1, 'width']],
  KanbanColumn: [[1, 'width'], [2, 'height']], Swatch: [[1, 'width']], DateSeparator: [[1, 'width']], NewMarker: [[0, 'width']], IssueRow: [[1, 'width']],
  IssueGroup: [[1, 'width']], IssueList: [[1, 'width']], IssuePage: [[1, 'width'], [2, 'height']], LoginTabs: [[3, 'width']]
}
const LIFTS = {}
export const registerLifts = (l) => Object.assign(LIFTS, l)

export function invertView (view, env) {
  const atom = invertAtom(view, env)
  if (atom) return { ...atom, view }
  const def = env.defs.get(view.name)
  if (def === undefined || def.call === undefined) return null
  const call = { fn: def.call.fn, args: cloneArgs(def.call.args), view, def }
  for (const b of bindingsOf(def, env)) evalBinding(b, call, view, def, env)
  LIFTS[call.fn]?.(call, view, def, env)
  for (const [i, prop] of SIZE[call.fn] ?? []) if (typeof view.props[prop] === 'number') call.args[i] = view.props[prop]
  return call
}

// A node of a template or of a .pen file that may be an instance
export function nodeCall (node, env) {
  if (node.type === 'frame' && node.name?.startsWith('StatusIcon/')) return drawnStatusIcon(node, env)
  if (node.type !== 'ref') return null
  const view = node.ref.startsWith('§K:') ? viewOfTemplate(node) : env.viewOf(node)
  return view === null ? null : invertView(view, env)
}
