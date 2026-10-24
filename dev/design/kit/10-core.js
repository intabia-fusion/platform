// Drawing primitives over the Penpot Plugin API. Every kit file is concatenated before a screen
// script by `penpot.mjs run`, so declarations here are visible to screens as plain identifiers.

const kit = {
  mode: 'light',
  font: penpot.fonts.findByName('IBM Plex Sans'),
  // Flex sizing is reset when a board is appended to a flex parent; kit.add re-applies it.
  sizing: new Map()
}

// Theme color by CSS custom property name without the leading `--`, e.g. T('theme-bg-color').
// Returns a String carrying the token name, so fills can be bound to the Penpot token.
function T (name) {
  const v = TOKENS.colors[kit.mode][name]
  if (v === undefined) throw new Error(`Unknown color token: ${name}`)
  const s = new String(v) // eslint-disable-line no-new-wrappers
  s.token = name
  return s
}

// Color tokens of the current file (built by library/ui-kit.js); empty in files without them
kit.tokens = new Map()
for (const set of penpot.library.local.tokens.sets) {
  if (set.name === 'mode/' + kit.mode) for (const t of set.tokens) kit.tokens.set(t.name, t)
}
const bindToken = (shape, c, prop) => {
  const t = c && c.token !== undefined ? kit.tokens.get(c.token) : undefined
  if (t !== undefined) shape.applyToken(t, [prop])
}
// Dimension token in px, e.g. D('spacing-1') === 8
function D (name) {
  const v = TOKENS.dimensions[name]
  if (v === undefined) throw new Error(`Unknown dimension token: ${name}`)
  return v
}

function fillOf (c) {
  return c.length === 9 ? { fillColor: c.slice(0, 7), fillOpacity: parseInt(c.slice(7), 16) / 255 } : { fillColor: c, fillOpacity: 1 }
}

kit.fill = (shape, c) => {
  shape.fills = c ? [fillOf(String(c))] : []
  bindToken(shape, c, 'fill')
  return shape
}
kit.stroke = (shape, c, w = 1, style = 'solid') => {
  const f = fillOf(String(c))
  shape.strokes = [{ strokeColor: f.fillColor, strokeOpacity: f.fillOpacity, strokeWidth: w, strokeAlignment: 'inner', strokeStyle: style }]
  bindToken(shape, c, 'strokeColor')
  return shape
}

// Board, optionally with flex layout.
// o: w h fill stroke radius dir gap pad[t,r,b,l] align justify wrap hs vs clip
kit.box = (name, o = {}) => {
  const b = penpot.createBoard()
  b.name = name
  b.resize(o.w || 10, o.h || 10)
  kit.fill(b, o.fill)
  if (o.radius) b.borderRadius = o.radius
  if (o.stroke) kit.stroke(b, o.stroke, o.strokeW || 1, o.strokeStyle)
  if (o.dir) {
    const f = b.addFlexLayout()
    // Every plugin write costs time proportional to the shapes on the page, so defaults are not written
    if (o.dir !== 'row') f.dir = o.dir
    if (o.gap) { f.rowGap = o.gap; f.columnGap = o.gap }
    const p = o.pad || [0, 0, 0, 0]
    if (p[0]) f.topPadding = p[0]
    if (p[1]) f.rightPadding = p[1]
    if (p[2]) f.bottomPadding = p[2]
    if (p[3]) f.leftPadding = p[3]
    if (o.align && o.align !== 'start') f.alignItems = o.align
    if (o.justify && o.justify !== 'start') f.justifyContent = o.justify
    if (o.wrap) f.wrap = 'wrap'
    if (o.hs && o.hs !== 'fix') f.horizontalSizing = o.hs
    if (o.vs && o.vs !== 'fix') f.verticalSizing = o.vs
    kit.sizing.set(b.id, [o.hs || 'fix', o.vs || 'fix'])
  }
  if (o.clip === false) b.clipContent = false
  return b
}

// Row/column without own fill, sized by content
kit.row = (name, gap = 0, o = {}) => kit.box(name, { dir: 'row', gap, align: 'center', hs: 'auto', vs: 'auto', ...o })
kit.col = (name, gap = 0, o = {}) => kit.box(name, { dir: 'column', gap, hs: 'auto', vs: 'auto', ...o })

kit.ellipse = (size, color, name = 'Ellipse') => {
  const e = penpot.createEllipse()
  e.resize(size, size)
  e.name = name
  return kit.fill(e, color)
}

kit.text = (chars, o = {}) => {
  // createText returns null for an empty string
  if (chars === '') return kit.spacer(1, 1)
  const t = penpot.createText(chars)
  const v = kit.font.variants.find((it) => String(it.fontWeight) === String(o.weight || 400) && it.fontStyle !== 'italic') || kit.font.variants[0]
  kit.font.applyToText(t, v)
  t.fontSize = String(o.size || 14)
  t.lineHeight = String(o.lh || 1.25)
  kit.fill(t, o.color || T('theme-caption-color'))
  if (o.upper) t.textTransform = 'uppercase'
  if (o.w) { t.resize(o.w, t.height); t.growType = 'auto-height' } else t.growType = 'auto-width'
  if (o.align) t.align = o.align
  t.name = o.name || chars.slice(0, 40)
  return t
}

kit.add = (parent, ...kids) => {
  for (const k of kids.flat(Infinity)) {
    if (!k) continue
    parent.appendChild(k)
    kit.nAdd = (kit.nAdd || 0) + 1; if (kit.nAdd % 100 === 0) kit.marks = (kit.marks || '') + `${kit.nAdd}@${Date.now() - kit.t0} ` // TMPDBG
    const sz = kit.sizing.get(k.id)
    if (sz && k.flex) {
      if (sz[0] !== 'fix') k.flex.horizontalSizing = sz[0]
      if (sz[1] !== 'fix') k.flex.verticalSizing = sz[1]
    }
  }
  return parent
}

// Absolute placement relative to a parent board without layout
kit.at = (parent, s, x, y) => { parent.appendChild(s); s.x = parent.x + x; s.y = parent.y + y; return s }

kit.svg = (markup, name) => {
  const g = penpot.createShapeFromSvg(markup)
  if (g) g.name = name || 'icon'
  return g
}

// Icon by repository name "<ns>/<id>" (sprites and Svelte icons, see penpot.mjs buildIcons);
// short names are the hand-drawn stroke icons in kit.I
kit.icon = (name, color, size = 16) => {
  const c = String(color || T('theme-dark-color'))
  const hex = c.slice(0, 7)
  const op = fillOf(c).fillOpacity
  const repo = typeof ICONS !== 'undefined' ? ICONS[name] : undefined
  if (repo !== undefined) {
    const body = repo.body.replace(/currentColor/g, hex).replace(/<path (?![^>]*fill-rule)/g, '<path fill-rule="evenodd" ')
    const [, , vw, vh] = repo.viewBox.split(/[\s,]+/).map(Number)
    const h = Math.round(size * vh / vw)
    // Penpot's SVG import loses subpath winding, evenodd keeps outline icons hollow
    const g = kit.svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}" viewBox="${repo.viewBox}" fill="${hex}" fill-opacity="${op}" fill-rule="evenodd">${body}</svg>`, 'icon/' + name)
    // The import sizes the group by the viewBox, not by width/height
    if (g && (Math.round(g.width) !== size || Math.round(g.height) !== h)) g.resize(size, h)
    return g
  }
  if (kit.I[name] === undefined) throw new Error(`Unknown icon: ${name}`)
  return kit.svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="${hex}" stroke-opacity="${op}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${kit.I[name]}</svg>`, 'icon/' + name)
}

kit.spacer = (w, h) => kit.box('spacer', { w, h })
kit.divider = (w, h = 1) => kit.box('divider', { w, h, fill: T('theme-divider-color') })

kit.I = {
  calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  component: '<path d="M8 2l2.5 2.5L8 7 5.5 4.5zM8 9l2.5 2.5L8 14l-2.5-2.5zM4.5 5.5L7 8l-2.5 2.5L2 8zM11.5 5.5L14 8l-2.5 2.5L9 8z"/>',
  milestone: '<path d="M3 14V2.5h8l-1.5 3 1.5 3H3"/>',
  clip: '<path d="M10.5 5L6 9.5a1.4 1.4 0 0 0 2 2L13 6.5a2.8 2.8 0 0 0-4-4L4 7.5a4.2 4.2 0 0 0 6 6l3.5-3.5"/>',
  comment: '<path d="M2.5 3.5h11v7.5h-6L4.5 13.5V11h-2z"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
  subissues: '<path d="M4 2.5v8.5h7M4 6.5h7"/><circle cx="12" cy="6.5" r="1"/><circle cx="12" cy="11" r="1"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  chevronR: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  chevronD: '<path d="M3.5 6L8 10.5 12.5 6"/>',
  chevronL: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  merge: '<path d="M3 3h4v10H3zM9 3h4v10H9z"/>',
  more: '<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>',
  list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5"/>',
  board: '<rect x="2" y="2.5" width="3.5" height="11" rx="1"/><rect x="7" y="2.5" width="3.5" height="7" rx="1"/><path d="M12 2.5h2v5h-2z"/>',
  timeline: '<circle cx="8" cy="8" r="5.5"/><path d="M8 8l3-3"/>',
  sort: '<path d="M4 3v10M2 11l2 2 2-2M8 4h6M8 7h4.5M8 10h3"/>',
  sliders: '<path d="M2.5 5h11M2.5 11h11"/><circle cx="6" cy="5" r="1.6"/><circle cx="10" cy="11" r="1.6"/>',
  filter: '<path d="M2.5 3h11L9.2 8.3V13l-2.4-1.2V8.3z"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  check: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 8l2 2 3.5-4"/>',
  tick: '<path d="M3.5 8.5l3 3 6-7"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  drag: '<circle cx="6" cy="4" r=".8"/><circle cx="10" cy="4" r=".8"/><circle cx="6" cy="8" r=".8"/><circle cx="10" cy="8" r=".8"/><circle cx="6" cy="12" r=".8"/><circle cx="10" cy="12" r=".8"/>',
  star: '<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  warn: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11v.3"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  users: '<circle cx="6" cy="5.5" r="2.3"/><path d="M2 13c.4-2.4 2-3.6 4-3.6s3.6 1.2 4 3.6M10.5 3.5a2.2 2.2 0 0 1 0 4.2M12 9.6c1.2.5 1.9 1.6 2.1 3.4"/>',
  person: '<circle cx="8" cy="8" r="6.5" stroke-dasharray="2 1.5"/><circle cx="8" cy="6.5" r="2"/><path d="M4.5 12c.8-1.6 2-2.3 3.5-2.3s2.7.7 3.5 2.3"/>',
  palette: '<path d="M8 2a6 6 0 1 0 0 12c1 0 1.3-.8.9-1.5-.5-.8 0-1.8 1-1.8H12a2 2 0 0 0 2-2C14 5 11.3 2 8 2z"/><circle cx="5" cy="7" r=".8"/><circle cx="7.5" cy="4.8" r=".8"/><circle cx="10.5" cy="5.5" r=".8"/>',
  layout: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 6h11M6 6v7.5"/>',
  lanes: '<path d="M2 4.5h12M2 8h12M2 11.5h12"/>'
}

// Opens (creating if needed) a page by name and removes its content (o.keep: a later script of the same page)
kit.page = async (name, o = {}) => {
  kit.t0 = Date.now(); const tp = Date.now() // TMPDBG
  let page = penpotUtils.getPageByName(name)
  if (!page) { page = penpot.createPage(); page.name = name }
  penpot.openPage(page)
  // Text is measured only on the page shown in the editor, so build after the switch lands
  for (let i = 0; i < 50 && penpot.currentPage.id !== page.id; i++) await new Promise((resolve) => setTimeout(resolve, 100))
  await new Promise((resolve) => setTimeout(resolve, 1000))
  storage.TIMES = `page=${Date.now() - tp}; ` // TMPDBG
  if (!o.keep) for (const s of [...penpot.root.children]) s.remove()
  // A new file starts with an empty "Page 1"
  const blank = penpotUtils.getPageByName('Page 1')
  if (blank && blank.id !== page.id && blank.root.children.length === 0) blank.remove()
  return page
}

// Penpot measures auto-sized text only for shapes it has rendered, so show everything once and wait
kit.settle = async (ms = 4000) => {
  const t0 = Date.now() // TMPDBG
  let n = 0; const ty = {}; const cnt = (s) => { for (const c of s.children || []) { n++; ty[c.type] = (ty[c.type] || 0) + 1; cnt(c) } }; cnt(penpot.root); storage.TIMES = (storage.TIMES || '') + JSON.stringify(ty) // TMPDBG
  penpot.viewport.zoomToFitAll()
  await new Promise((resolve) => setTimeout(resolve, ms))
  const t1 = Date.now() // TMPDBG
  kit.stamp(penpot.currentPage)
  storage.TIMES = (storage.TIMES || '') + (kit.marks || '') + `shapes=${n} sinceStart=${t0 - (kit.t0 || t0)} wait=${t1 - t0} stamp=${Date.now() - t1}; ` // TMPDBG
}
