// Runs inside `pen interactive`, prepended to every execute call by build.mjs (functions do not survive
// between calls, globals do). TREES, ALIAS, OUT and PNG are placed above this text by the caller.
// '$§name' in colors is a variable of the library (alias prefix), '§K:name' in `ref` a library component,
// '#i/j' as a key of `descendants` is the child index path inside the referenced component.
T0 = Date.now()
K = typeof K === 'undefined' ? {} : K
CT = typeof CT === 'undefined' ? {} : CT
ALIAS = typeof ALIAS === 'undefined' ? (Object.keys(GetVariables().variables).find((k) => k.endsWith(':pal-Cloud')) || '').split(':')[0] : ALIAS
// pen cannot visit into an instance that has children of its own
Get((n, c) => {
  if (n.reusable && K[n.name] === undefined) K[n.name] = n.id
  if (n.type === 'ref') c.skipChildren()
})
const treeOf = (id) => (CT[id] = CT[id] || Get(id, { depth: 60 }))
const idPath = (compId, key) => {
  let node = treeOf(compId)
  const ids = []
  for (const i of key.slice(1).split('/')) {
    node = node.children[+i]
    ids.push(node.id)
  }
  return ids.join('/')
}
const resolve = (n) => {
  if (typeof n.ref === 'string' && n.ref.startsWith('§K:')) n.ref = K[n.ref.slice(3)]
  if (n.descendants) {
    const out = {}
    for (const [k, v] of Object.entries(n.descendants)) out[k.startsWith('#') ? idPath(n.ref, k) : k] = resolve(v)
    n.descendants = out
  }
  for (const c of n.children || []) resolve(c)
  return n
}
// pen reads padding back as a number, [vertical, horizontal] or [top, right, bottom, left]
const pad = (p) => (!Array.isArray(p) ? [p || 0, p || 0, p || 0, p || 0] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p)
const widthOf = (id) => (Get(id, (n, c) => { c.skipChildren(); return c.bounds.width }) || [])[0]
const findById = (tree, id) => {
  if (tree.id === id) return tree
  for (const c of tree.children || []) {
    const r = findById(c, id)
    if (r) return r
  }
  return undefined
}

// Wrap containers of a screen: plain frames and slots of instances (their children are real nodes)
const wrapJobs = (rootId) => {
  const jobs = []
  const walk = (n) => {
    // Definitions keep their slots in one row, only instances wrap
    if (n.reusable) return
    if (n.type === 'frame' && n.metadata && n.metadata.type === 'wrap') {
      jobs.push({ path: n.id, w: widthOf(n.id), gap: n.gap || 0, pad: pad(n.padding), al: n.alignItems, kids: (n.children || []).map((c) => c.id) })
    }
    if (n.type === 'ref') {
      for (const [k, v] of Object.entries(n.descendants || {})) {
        if (!v.children) continue
        const comp = findById(treeOf(n.ref), k.split('/').pop())
        if (comp && comp.metadata && comp.metadata.type === 'wrap') {
          const num = (x) => (typeof x === 'number' ? x : undefined)
          jobs.push({ path: n.id + '/' + k, w: num(v.width !== undefined ? v.width : comp.width), gap: (v.gap !== undefined ? v.gap : comp.gap) || 0, pad: pad(v.padding !== undefined ? v.padding : comp.padding), al: v.alignItems !== undefined ? v.alignItems : comp.alignItems, kids: v.children.map((c) => c.id) })
        }
        for (const c of v.children) walk(c)
      }
    }
    for (const c of n.children || []) walk(c)
  }
  walk(Get(rootId, { depth: 200 }))
  return jobs
}
// Flex layout has no wrapping: a container marked `wrap` is cut into rows where its children overflow
const wrapFlow = (rootId) => {
  let cut = 0
  for (const w of wrapJobs(rootId).reverse()) {
    if (w.w === undefined) continue
    const inner = w.w - w.pad[1] - w.pad[3]
    const rows = [[]]
    let used = 0
    for (const id of w.kids) {
      const kw = widthOf(id) || 0
      const cur = rows[rows.length - 1]
      if (cur.length > 0 && used + w.gap + kw > inner + 0.5) { rows.push([]); used = 0 }
      used += (rows[rows.length - 1].length > 0 ? w.gap : 0) + kw
      rows[rows.length - 1].push(id)
    }
    if (rows.length > 1) {
      cut++
      Update(w.path, { layout: 'vertical', alignItems: 'start' })
      for (const r of rows) {
        const row = Insert(w.path, { type: 'frame', name: 'row', layout: 'horizontal', gap: w.gap, ...(w.al ? { alignItems: w.al } : {}) })
        for (const id of r) Move(id, row)
      }
    }
  }
  return cut
}

// '§T:' prefixes a theme axis of the library (the import renames it to <alias>:mode)
const tree = (json) => resolve(JSON.parse(json.split('$§').join('$' + (ALIAS ? ALIAS + ':' : '')).split('§T:').join(ALIAS ? ALIAS + ':' : '')))
// Library: a frame per category, a labelled cell per component (the components go into their cells)
if (LIB) {
  ROOT = Insert(document, { type: 'frame', name: 'Library', x: 0, y: 0, layout: 'vertical', gap: 96, padding: 48, fill: '#FFFFFF' })
  CELL = {}
  for (const cat of LIB) {
    const f = Insert(ROOT, { type: 'frame', name: cat.name, layout: 'vertical', gap: 32 })
    Insert(f, { type: 'text', name: 'title', content: cat.name, fontFamily: 'IBM Plex Sans', fontSize: 40, fontWeight: '700', fill: '#1A1A1A' })
    const list = Insert(f, { type: 'frame', name: 'components', layout: 'horizontal', gap: 48, width: 2400, alignItems: 'start', metadata: { type: 'wrap' } })
    for (const name of cat.names) {
      const cell = Insert(list, { type: 'frame', name: 'cell', layout: 'vertical', gap: 8 })
      Insert(cell, { type: 'text', name: 'label', content: name, fontFamily: 'IBM Plex Sans', fontSize: 11, fill: '#777777' })
      CELL[name] = cell
    }
  }
}
ids = []
// Components of the library may refer to the ones inserted before them
TREES.forEach((json, i) => {
  const t = tree(json)
  const id = Insert(INTO[i] ? CELL[INTO[i]] : document, t)
  if (t.reusable) K[t.name] = id
  ids.push(id)
})
if (INTO.length > 0) ids = [ROOT]
cuts = 0
for (const id of ids) cuts += wrapFlow(id)
Print('INSERT', Date.now() - T0, 'wrapped', cuts)
if (PNG) {
  Export(INTO.length > 0 ? ids : ids.slice(1), 'png', OUT, { scale: 1 })
  Print('EXPORT', Date.now() - T0)
}
