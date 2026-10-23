// Library components. A kit function that is tagged here still draws its shape in place; when the screen
// is serialized, the shape becomes an instance (`ref`) of the library variant that needs the fewest overrides.

const SKIP = new Set(['children', 'descendants', 'name', 'id', 'slot', 'reusable', 'enabled', 'metadata'])
// A property that is absent in the instance goes back to this value; other absent properties rule the variant out
const RESET = { fill: '#00000000', stroke: '#00000000', cornerRadius: 0, gap: 0, padding: 0, alignItems: 'start', justifyContent: 'start', clip: false, textAlign: 'left' }
const STROKE_PARTS = new Set(['strokeWidth', 'strokeAlignment'])
// pen outlines an empty slot in the PNG export; a slot with an invisible child is not outlined
const filled = (kids) => (kids.length > 0 ? kids : [{ type: 'rectangle', name: 'slot-empty', width: 1, height: 1, enabled: false }])

const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x))
const same = (a, b) => a === b || stable(a) === stable(b)
// Atoms are alike for the alignment of children: a status icon may be an instance or a drawn frame
const ATOMS = new Set(['StatusIcon', 'PriorityIcon'])
const seg = (n) => String(n.name).split(/[\s/]/)[0]
const isAtom = (n) => n.type === 'ref' || ATOMS.has(seg(n))
const stem = (n) => (n.type === 'text' ? 'text' : isAtom(n) ? 'atom:' + seg(n) : n.type + ':' + seg(n))

function propsOf (t, n, root) {
  const o = {}
  for (const k of new Set([...Object.keys(t), ...Object.keys(n)])) {
    if (SKIP.has(k) || (root && (k === 'x' || k === 'y')) || same(t[k], n[k])) continue
    if (n[k] !== undefined) o[k] = n[k]
    else if (STROKE_PARTS.has(k)) continue
    else if (k in RESET) o[k] = RESET[k]
    else return null
  }
  return o
}

// Pairs the children of the definition (A) with the children of the shape (B), in order, by their keys
function pairs (A, B) {
  const ka = A.map(stem)
  const kb = B.map(stem)
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0))
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  const out = []
  let i = 0
  let j = 0
  while (i < A.length && j < B.length) {
    if (ka[i] === kb[j] && dp[i][j] === dp[i + 1][j + 1] + 1) {
      out.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return out
}

// Collects overrides of the shape n over the definition t into ops (child index path, then properties); false: no match
function fit (t, n, path, ops, root, st) {
  const key = '#' + path.join('/')
  const off = t.enabled === false
  if (!root && (isAtom(t) || isAtom(n) || t.type !== n.type)) {
    if (t.type === 'ref' && n.type === 'ref' && same(t.ref, n.ref) && same(t.descendants, n.descendants) && same(t.children, n.children)) {
      const p = propsOf(t, n, false)
      if (p === null) return false
      if (off) p.enabled = true
      if (Object.keys(p).length) { ops.set(key, p); st.cost += Object.keys(p).length }
      return true
    }
    if (t.type === n.type && same({ ...t, name: 0, enabled: 0 }, { ...n, name: 0, enabled: 0 })) {
      if (off) ops.set(key, { enabled: true })
      return true
    }
    ops.set(key, off ? { ...n, enabled: true } : { ...n })
    st.cost += 8
    return true
  }
  const p = propsOf(t, n, root)
  if (p === null) return false
  if (off) { p.enabled = true; st.cost += 3 }
  st.cost += Object.keys(p).length
  if (t.slot) {
    if (root) st.children = filled(n.children || [])
    else p.children = filled(n.children || [])
  } else if (!fitChildren(t.children || [], n.children || [], path, ops, st)) return false
  if (!root && Object.keys(p).length) ops.set(key, p)
  if (root) st.props = p
  return true
}

function fitChildren (A, B, path, ops, st) {
  const matched = new Set()
  const taken = new Set()
  for (const [i, j] of pairs(A, B)) {
    matched.add(i)
    taken.add(j)
    if (!fit(A[i], B[j], [...path, i], ops, false, st)) return false
  }
  if (taken.size !== B.length) return false
  A.forEach((a, i) => {
    if (!matched.has(i) && a.enabled !== false) { ops.set('#' + [...path, i].join('/'), { enabled: false }); st.cost += 3 }
  })
  return true
}

kit.Shape.prototype.toLib = function (top) {
  const n = this.toPen('none', top, true)
  const o = this.lib || {}
  const nodeAt = (p) => p.split('/').reduce((c, i) => c.children[+i], n)
  for (const p of o.hide || []) nodeAt(p).enabled = false
  const mark = (c, name) => {
    if (c.type === 'frame' && c.name === name) c.slot = []
    for (const k of c.children || []) mark(k, name)
  }
  for (const name of o.slots || []) {
    if (name === '$root') n.slot = []
    else mark(n, name)
  }
  return n
}

host.stats = host.stats || {}
host.instantiate = (s, parentLayout, top) => {
  const pj = s.toPen(parentLayout, top, true)
  let best = null
  for (const v of host.components) {
    if (v.comp !== s.comp || v === s) continue
    v.tpl = v.tpl || v.toLib(false)
    const ops = new Map()
    const st = { cost: 0 }
    if (!fit(v.tpl, pj, [], ops, true, st)) continue
    // A catch-all variant (penalty) only wins when no other one fits
    st.cost += (v.lib && v.lib.penalty) || 0
    if (best === null || st.cost < best.st.cost) best = { v, ops, st }
  }
  const stat = (host.stats[s.comp] = host.stats[s.comp] || { instances: 0, drawn: 0 })
  if (best === null) { stat.drawn++; return pj }
  stat.instances++
  const r = { type: 'ref', ref: '§K:' + best.v.name, name: pj.name }
  if (pj.x !== undefined) { r.x = pj.x; r.y = pj.y }
  Object.assign(r, best.st.props)
  if (best.st.children) r.children = best.st.children
  if (best.ops.size) r.descendants = Object.fromEntries(best.ops)
  return r
}

// Tag the kit functions that are library components, library/ui-kit.js names and defines them
for (const fn of ['Button', 'Switcher', 'Menu', 'Input', 'Checkbox', 'Radio', 'Toggle', 'StatusChip', 'Count', 'Notice', 'Chip', 'QuickFilter', 'FilterChip', 'Swatch',
  'IssueCard', 'ColumnHeader', 'KanbanColumn', 'SectionTitle', 'FormRow', 'Table', 'NavItem', 'NavGroupHeader', 'NavSpaceHeader',
  'TopBar', 'AppRail', 'Sidebar', 'Navigator', 'Workbench', 'Label', 'ClassicButton', 'Modal', 'EditBox', 'GridRow', 'NavCaption',
  'DateSeparator', 'NewMarker', 'Message', 'MessageInput', 'IssueRow', 'IssueGroup', 'IssueList', 'IssuePage', 'NewIssuePopup']) {
  const f = kit[fn]
  const tagged = (...a) => {
    const r = f(...a)
    const s = fn === 'Workbench' ? r.frame : fn === 'Modal' ? r.modal : r
    s.comp = fn
    // The call that made the shape: import.mjs reads the library samples back from it
    s.call = { fn, args: a }
    return r
  }
  kit[fn] = tagged
}
