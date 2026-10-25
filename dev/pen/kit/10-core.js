// Pen backend of the Penpot kit (dev/design/kit/10-core.js): same names and signatures, but shapes are plain
// objects that serialize to .pen nodes. Runs in Node inside the script scope; `host` comes from build.mjs.
// The other kit files (20-atoms ... 50-settings) are the Penpot ones, read from dev/design/kit unchanged.

const kit = {
  mode: 'light',
  // The pen layout engine measures text itself, nothing to wait for
  settle: async () => {}
}

// Theme color by CSS custom property name; a String carrying the token, bound to the pen variable
function T (name) {
  const v = TOKENS.colors[kit.mode][name]
  if (v === undefined) throw new Error(`Unknown color token: ${name}`)
  host.tokens.add(name)
  const s = new String(v) // eslint-disable-line no-new-wrappers
  s.token = name
  return s
}
function D (name) {
  const v = TOKENS.dimensions[name]
  if (v === undefined) throw new Error(`Unknown dimension token: ${name}`)
  return v
}

// Pen value of a color: variable placeholder (resolved in the session) or plain hex
// Palette backgrounds are a left-to-right gradient to the end variable: flat in light, fading into the panel in dark
const gradientOf = (token) => ({ type: 'gradient', gradientType: 'linear', rotation: 270, colors: [{ color: '$§' + token, position: 0 }, { color: '$§palbge-' + token.slice(6), position: 1 }] })
const colorOf = (c) => (c === null || c === undefined || c === false ? undefined : c.token !== undefined ? (c.token.startsWith('palbg-') ? gradientOf(c.token) : '$§' + c.token) : String(c))
const FLEX = { 'space-between': 'space_between', 'space-around': 'space_around' }

// A shape is a pen node under construction. Sizes and positions are what the script declared:
// the pen layout engine decides the rest.
kit.Shape = class {
  constructor (type, name) {
    this.type = type
    this.name = name
    this.parent = null
    this.children = []
    this.x = 0
    this.y = 0
    this.w = 10
    this.h = 10
    this.hs = 'fix'
    this.vs = 'fix'
    this.id = 's' + (++host.seq)
  }

  get width () { if (this.hs === 'auto') throw new Error('width of a content-sized shape: ' + this.name); return this.w }
  get height () { if (this.vs === 'auto') throw new Error('height of a content-sized shape: ' + this.name); return this.h }
  resize (w, h) { this.w = w; this.h = h }
  get layoutChild () {
    const s = this
    return { set horizontalSizing (v) { s.hs = v }, set verticalSizing (v) { s.vs = v } }
  }

  set shadows (list) {
    this.effect = list.map((s) => ({ type: 'shadow', shadowType: 'outer', offset: { x: s.offsetX, y: s.offsetY }, blur: s.blur, color: s.color.color + Math.round(s.color.opacity * 255).toString(16).padStart(2, '0').toUpperCase() }))
  }

  corner (i, r) { this.radii = this.radii || [this.radius || 0, this.radius || 0, this.radius || 0, this.radius || 0]; this.radii[i] = r }
  set borderRadiusTopLeft (r) { this.corner(0, r) }
  set borderRadiusTopRight (r) { this.corner(1, r) }
  set borderRadiusBottomRight (r) { this.corner(2, r) }
  set borderRadiusBottomLeft (r) { this.corner(3, r) }

  size (axis) {
    const mode = axis === 'w' ? this.hs : this.vs
    // Fit and fill need a flex layout; a shape without one keeps its declared size
    if (mode === 'auto' && this.layout !== 'none' && this.type === 'frame') return 'fit_content'
    if (mode === 'fill') return 'fill_container'
    return this[axis]
  }

  // plain: this node is drawn as is (the library definition of a component), its children may still become instances
  toPen (parentLayout, top, plain) {
    if (this.comp !== undefined && !plain) {
      const r = host.instantiate(this, parentLayout, top)
      if (r !== null) return r
    }
    const n = { type: this.type, name: this.name }
    if (this.type === 'raw') Object.assign(n, this.node, { name: this.name })
    else if (this.type === 'text') {
      Object.assign(n, this.node)
    } else {
      n.width = this.size('w')
      n.height = this.size('h')
    }
    if (this.type === 'frame') {
      n.layout = this.layout
      if (this.layout !== 'none') {
        if (this.gap) n.gap = this.gap
        if (this.pad && this.pad.some((v) => v)) n.padding = this.pad
        if (this.align && this.align !== 'start') n.alignItems = this.align
        if (this.justify && this.justify !== 'start') n.justifyContent = FLEX[this.justify] || this.justify
      }
      if (this.clip) n.clip = true
      if (this.wrap) n.metadata = { type: 'wrap' }
    }
    if (this.reusable) n.reusable = true
    if (this.f !== undefined) n.fill = this.f
    if (this.stroke !== undefined) Object.assign(n, { stroke: this.stroke, strokeWidth: this.strokeW, strokeAlignment: 'inner' })
    if (this.radii) n.cornerRadius = this.radii
    else if (this.radius) n.cornerRadius = this.radius
    if (this.effect) n.effect = this.effect
    if (this.type === 'ref' && this.descendants) n.descendants = this.descendants
    if (parentLayout === 'none' || top) { n.x = this.x; n.y = this.y }
    if (this.children.length > 0) n.children = this.children.map((c) => c.toPen(this.layout))
    return n
  }
}

// Raw pen node (icons, refs): size and position are those of the node
kit.pen = (node) => {
  const s = new kit.Shape('raw', node.name)
  s.node = node
  if (typeof node.width === 'number') s.w = node.width
  if (typeof node.height === 'number') s.h = node.height
  return s
}

// Dashed strokes do not exist in pen: strokeStyle is ignored, the stroke stays solid
kit.fill = (shape, c) => { shape.f = c ? colorOf(c) : null; if (shape.f === null) delete shape.f; return shape }
kit.stroke = (shape, c, w = 1) => { shape.stroke = colorOf(c); shape.strokeW = w; return shape }

// Board, optionally with flex layout.
// o: w h fill stroke radius dir gap pad[t,r,b,l] align justify wrap hs vs clip
kit.box = (name, o = {}) => {
  const b = new kit.Shape('frame', name)
  b.w = o.w || 10
  b.h = o.h || 10
  b.layout = o.dir ? (o.dir === 'row' ? 'horizontal' : 'vertical') : 'none'
  kit.fill(b, o.fill)
  if (o.radius) b.radius = o.radius
  if (o.stroke) kit.stroke(b, o.stroke, o.strokeW || 1)
  if (o.dir) {
    b.gap = o.gap
    b.pad = o.pad
    b.align = o.align
    b.justify = o.justify
    b.wrap = o.wrap
    b.hs = o.hs || 'fix'
    b.vs = o.vs || 'fix'
  }
  b.clip = o.clip !== false
  return b
}
kit.row = (name, gap = 0, o = {}) => kit.box(name, { dir: 'row', gap, align: 'center', hs: 'auto', vs: 'auto', ...o })
kit.col = (name, gap = 0, o = {}) => kit.box(name, { dir: 'column', gap, hs: 'auto', vs: 'auto', ...o })

kit.ellipse = (size, color, name = 'Ellipse') => {
  const e = new kit.Shape('ellipse', name)
  e.w = size
  e.h = size
  return kit.fill(e, color)
}

kit.text = (chars, o = {}) => {
  if (chars === '') return kit.spacer(1, 1)
  const t = new kit.Shape('text', o.name || chars.slice(0, 40))
  t.node = {
    content: o.upper ? chars.toUpperCase() : chars,
    fontFamily: 'IBM Plex Sans',
    fontSize: o.size || 14,
    fontWeight: String(o.weight || 400),
    lineHeight: o.lh || 1.25,
    ...(o.w ? { textGrowth: 'fixed-width', width: o.w } : {}),
    ...(o.align ? { textAlign: o.align } : {})
  }
  return kit.fill(t, o.color || T('theme-caption-color'))
}

kit.add = (parent, ...kids) => {
  // A frame with a sink takes what is added to it into that child (the overlay of a Workbench)
  parent = parent.sink || parent
  for (const k of kids.flat(Infinity)) {
    if (!k) continue
    if (k.parent) k.parent.children.splice(k.parent.children.indexOf(k), 1)
    k.parent = parent
    parent.children.push(k)
  }
  return parent
}

// Absolute placement inside a parent board without layout (coordinates are relative to the parent)
kit.at = (parent, s, x, y) => { kit.add(parent, s); s.x = x; s.y = y; return s }

// Repo icon by name "kit/<Key>", "<ns>/<id>" or a short hand-drawn one: an instance of the library component `icon/<name>`
// (the geometry lives there once), the color and size are overrides
kit.icon = (name, color, size = 16) => {
  const i = ICONS[name]
  if (i === undefined) throw new Error(`Unknown icon: ${name}`)
  host.icons.add(name)
  const c = colorOf(color || T('theme-dark-color'))
  const [, , vw, vh] = i.vb
  const paint = i.sw !== undefined ? { stroke: c, strokeWidth: Math.round(i.sw * size / vw * 100) / 100 } : { fill: c }
  return kit.pen({ type: 'ref', ref: '§K:Icon/' + name, name: 'icon/' + name, width: size, height: Math.round(size * vh / vw * 100) / 100, ...paint })
}

kit.spacer = (w, h) => kit.box('spacer', { w, h })
kit.divider = (w, h = 1) => kit.box('divider', { w, h, fill: T('theme-divider-color') })

// Pages: pen has one canvas, so a page is a group of screens that build.mjs stacks under a title
kit.page = async (name, o = {}) => {
  if (!o.keep || !host.pages.has(name)) host.pages.set(name, [])
  host.page = host.pages.get(name)
  return host.page
}

// o: hide[] index paths of parts that are off in the library look; slots[] names of containers whose children the instance supplies ('$root' = the component itself)
kit.component = (name, s, o = {}) => { s.name = name; s.reusable = true; s.lib = o; host.components.push(s); return s }

const penpot = { root: { appendChild: (f) => host.page.push(f) }, createEllipse: () => kit.ellipse(10) }
