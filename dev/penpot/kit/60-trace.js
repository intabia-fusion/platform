// Each generated shape keeps a fingerprint of what the script drew, so kit.diffAll can find
// manual edits made in Penpot and an agent can move them into the scripts (docs/penpot.md).

const NS = 'intabia'
const round = (v) => Math.round(Number(v) * 100) / 100
// svg icons are generated groups; their inner paths are not compared one by one
const isLeafGroup = (s) => s.type === 'group' || s.type === 'svg-raw'

kit.fingerprint = (s) => {
  const f = { t: s.type, n: s.name }
  if (s.type === 'text') {
    f.c = s.characters
    f.fs = s.fontSize
    f.fw = s.fontWeight
  }
  if (Array.isArray(s.fills)) f.f = s.fills.map((x) => `${x.fillColor ?? ''}:${round(x.fillOpacity ?? 1)}`).join(',')
  if (Array.isArray(s.strokes)) f.s = s.strokes.map((x) => `${x.strokeColor}:${round(x.strokeOpacity ?? 1)}:${x.strokeWidth}`).join(',')
  if (s.borderRadius) f.r = s.borderRadius
  if (s.hidden) f.h = 1
  if (s.flex) f.l = [s.flex.dir, s.flex.rowGap, s.flex.columnGap, s.flex.topPadding, s.flex.rightPadding, s.flex.bottomPadding, s.flex.leftPadding, s.flex.alignItems, s.flex.justifyContent].join(',')
  // Size is compared only where neither the shape nor its parent layout decides it
  const own = s.type === 'board' ? s.flex : undefined
  const fixW = (s.type === 'board' || s.type === 'rectangle' || s.type === 'ellipse') && (!own || own.horizontalSizing === 'fix') && s.layoutChild?.horizontalSizing !== 'fill'
  const fixH = (s.type === 'board' || s.type === 'rectangle' || s.type === 'ellipse') && (!own || own.verticalSizing === 'fix') && s.layoutChild?.verticalSizing !== 'fill'
  if (fixW || fixH) f.wh = [fixW ? Math.round(s.width) : null, fixH ? Math.round(s.height) : null]
  // Position matters only where the parent does not lay children out
  if (s.parent && s.parent.type === 'board' && !s.parent.flex && !s.parent.grid) f.xy = [Math.round(s.parentX), Math.round(s.parentY)]
  if (s.children && !isLeafGroup(s)) f.k = s.children.map((c) => c.name)
  return f
}

function walk (shape, fn, path = []) {
  for (const c of shape.children ?? []) {
    const p = [...path, c.name]
    fn(c, p)
    if (!isLeafGroup(c)) walk(c, fn, p)
  }
}

// Called by kit.settle at the end of a build
kit.stamp = (page) => {
  page.setSharedPluginData(NS, 'src', JSON.stringify(kit.source ?? []))
  const stamp = (s) => s.setSharedPluginData(NS, 'gen', JSON.stringify(kit.fingerprint(s)))
  // Boards kept from an earlier script of the page are already stamped
  for (const top of page.root.children) {
    if (top.getSharedPluginData(NS, 'gen')) continue
    stamp(top)
    if (!isLeafGroup(top)) walk(top, stamp)
  }
}

// Changes against the fingerprints: changed / added / removed shapes and pages nobody generated.
// Comments are read by penpot.mjs over RPC: the plugin comments API hung the editor tab.
kit.diffAll = () => {
  const out = []
  for (const { id } of penpotUtils.getPages()) {
    const page = penpotUtils.getPageById(id)
    const srcRaw = page.getSharedPluginData(NS, 'src')
    if (!srcRaw) {
      out.push({ page: page.name, kind: 'page-added', structure: penpotUtils.shapeStructure(page.root, 3) })
      continue
    }
    const src = JSON.parse(srcRaw)
    walk(page.root, (s, path) => {
      const genRaw = s.getSharedPluginData(NS, 'gen')
      if (!genRaw) {
        // Report only the top of an added subtree
        if (s.parent && s.parent.getSharedPluginData(NS, 'gen') === '' && s.parent.type !== 'page' && s.parent.id !== page.root.id) return
        out.push({ page: page.name, src, path, kind: 'added', id: s.id, structure: penpotUtils.shapeStructure(s, 2), css: penpot.generateStyle([s], { type: 'css', withChildren: true }).slice(0, 4000) })
        return
      }
      const gen = JSON.parse(genRaw)
      const now = kit.fingerprint(s)
      const changes = {}
      for (const k of new Set([...Object.keys(gen), ...Object.keys(now)])) {
        if (k === 'k') continue
        if (JSON.stringify(gen[k]) !== JSON.stringify(now[k])) changes[k] = [gen[k], now[k]]
      }
      if (gen.k) {
        const left = [...(now.k ?? [])]
        const removed = gen.k.filter((n) => { const i = left.indexOf(n); if (i < 0) return true; left.splice(i, 1); return false })
        if (removed.length > 0) out.push({ page: page.name, src, path, kind: 'removed-children', id: s.id, removed })
      }
      if (Object.keys(changes).length > 0) out.push({ page: page.name, src, path, kind: 'changed', id: s.id, changes })
    })
  }
  return out
}

// Names from the top frame down to the shape, for comment threads bound to a frame
kit.pathsOf = (ids) => Object.fromEntries(ids.map((id) => {
  const names = []
  for (let sh = penpotUtils.findShapeById(id); sh && sh.parent; sh = sh.parent) names.unshift(sh.name)
  return [id, names]
}))

// Deepest shape under a comment pin, so a comment says what it points at, not only the frame
kit.shapesAt = (pins) => pins.map(({ pageId, x, y }) => {
  const page = penpotUtils.getPageById(pageId)
  if (!page) return []
  let best = []
  walk(page.root, (s, path) => {
    const b = s.bounds
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height && path.length >= best.length) best = path
  })
  return best
})
