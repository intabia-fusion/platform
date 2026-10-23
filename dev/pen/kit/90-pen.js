// Atoms drawn with pen primitives instead of the Penpot SVG import, and kit parts reshaped for pen:
// containers with variable content get a frame of their own that becomes a slot of the library component.
// The default atom look is an instance (`ref`) of a library component (library/ui-kit.js), other sizes and
// colors are drawn in place. '§K:<name>' in `ref` and '$§<name>' in colors are resolved in the pen session.

const fillRef = (name, o = {}) => kit.pen({ type: 'ref', ref: '§K:' + name, name, ...o })
const PV = (name) => '$§pal-' + name

// Dashed ring as short arcs, pen strokes have no dash pattern
const ringSteps = (n, r, c) => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI
    const a1 = a0 + (2 / 3.6) / r
    d += `M${(c + r * Math.sin(a0)).toFixed(2)} ${(c - r * Math.cos(a0)).toFixed(2)}A${r} ${r} 0 0 1 ${(c + r * Math.sin(a1)).toFixed(2)} ${(c - r * Math.cos(a1)).toFixed(2)}`
  }
  return d
}
const shape = (name, d, size, o) => ({ type: 'path', name, geometry: d, viewBox: [0, 0, size, size], width: size, height: size, x: 0, y: 0, ...o })

kit.StatusIcon = (cat, size = 14, palette, inline = false) => {
  const own = kit.CATEGORY[cat]
  if (!inline && size === 14 && (palette === undefined || palette === own)) return fillRef('Status/StatusIcon/' + cat)
  const col = PV(palette || own)
  const r = size / 2 - 1
  const m = size / 2
  const kids = [cat === 'backlog'
    ? shape('ring', ringSteps(10, r, m), size, { stroke: col, strokeWidth: 1.5, strokeLinecap: 'butt' })
    : { type: 'ellipse', name: 'ring', x: 1, y: 1, width: 2 * r, height: 2 * r, stroke: col, strokeWidth: 1.5, strokeAlignment: 'center' }]
  const disc = { type: 'ellipse', name: 'disc', x: 1, y: 1, width: 2 * r, height: 2 * r, fill: col }
  if (cat === 'active') kids.push(shape('wedge', `M${m} ${m}L${m} 3A${r - 2} ${r - 2} 0 0 1 ${size - 3} ${m}Z`, size, { fill: col }))
  if (cat === 'won') kids.push(disc, shape('check', `M${m - 3} ${m + 0.2}L${m - 0.8} ${m + 2.4}L${m + 3} ${m - 2}`, size, { stroke: '#FFFFFF', strokeWidth: 1.5 }))
  if (cat === 'lost') kids.push(disc, shape('cross', `M${m - 2} ${m - 2}L${m + 2} ${m + 2}M${m + 2} ${m - 2}L${m - 2} ${m + 2}`, size, { stroke: '#FFFFFF', strokeWidth: 1.5 }))
  return kit.pen({ type: 'frame', name: 'StatusIcon/' + cat, layout: 'none', width: size, height: size, children: kids })
}

kit.PriorityIcon = (level, inline = false) => {
  if (!inline) return fillRef('Status/PriorityIcon/' + level)
  const col = { urgent: PV('Orange'), high: PV('Sunshine'), medium: PV('Ocean'), low: PV('Cloud') }[level]
  const lit = { urgent: 3, high: 3, medium: 2, low: 1, none: 0 }[level]
  // Unlit bars follow the product icon: the text color at 0.3 opacity, so they stay visible in dark
  const dim = colorOf(T('theme-caption-color'))
  let kids = [0, 1, 2].map((i) => ({ type: 'rectangle', name: 'bar', x: 2 + i * 4, y: 9 - i * 3, width: 2.4, height: 3 + i * 3, cornerRadius: 0.6, fill: i < lit ? col : dim, ...(i < lit ? {} : { opacity: 0.3 }) }))
  if (level === 'urgent') {
    kids = [{ type: 'rectangle', name: 'box', x: 1, y: 1, width: 12, height: 12, cornerRadius: 3, fill: col },
      { type: 'rectangle', name: 'stem', x: 6.2, y: 3.5, width: 1.6, height: 4.5, fill: '#FFFFFF' },
      { type: 'rectangle', name: 'dot', x: 6.2, y: 9, width: 1.6, height: 1.6, fill: '#FFFFFF' }]
  }
  if (level === 'none') kids = [{ type: 'rectangle', name: 'dash', x: 3, y: 6.4, width: 8, height: 1.2, fill: dim, opacity: 0.6 }]
  return kit.pen({ type: 'frame', name: 'PriorityIcon/' + level, layout: 'none', width: 14, height: 14, children: kids })
}

// The 20px avatars come from the library; other sizes are the same instance resized
kit.Avatar = (initials, paletteName = 'Blueberry', size = 20, round = false) => fillRef('People/Avatar', {
  name: 'Avatar/' + size, width: size, height: size, cornerRadius: round ? size / 2 : Math.round(size * 0.2), fill: colorOf(P(paletteName)),
  descendants: { initials: { content: initials, fontSize: Math.max(8, Math.round(size * 0.42)) } }
})
kit.AvatarEmpty = (size = 20) => fillRef('People/Avatar/empty', { name: 'Avatar/empty', width: size, height: size, cornerRadius: Math.round(size * 0.2) })

// The tab and the "new tab" button flow in a row, the Penpot kit puts the button at a fixed x and a long title runs over it
const penpotTopBar = kit.TopBar
kit.TopBar = (w, o = {}) => {
  const bar = penpotTopBar(w, o)
  const tab = bar.children.find((c) => c.name === 'tab')
  const plus = bar.children.find((c) => c.name === 'new tab')
  const row = kit.box('tabs', { dir: 'row', gap: 8, align: 'center', hs: 'auto', vs: 'auto', clip: false })
  tab.hs = 'auto'
  kit.add(row, tab, plus)
  kit.at(bar, row, 8, 4)
  return bar
}

// A multi-line field wraps its text; the Penpot field keeps one line and cuts a long value
const penpotInput = kit.Input
kit.Input = (o = {}) => {
  if (!(o.h > 32)) return penpotInput(o)
  const c = kit.col('Input', 4)
  if (o.label) kit.add(c, kit.text(o.label, { size: 12, color: T('theme-dark-color') }))
  const b = kit.box('field', { w: o.w || 240, h: o.h, dir: 'row', pad: [8, 10, 8, 10], align: 'start', radius: 6, fill: T('input-BackgroundColor'), stroke: o.error ? T('input-error-BorderColor') : T('input-BorderColor') })
  kit.add(b, kit.text(o.value || o.placeholder || '', { size: 14, color: o.value ? T('input-TextColor') : T('input-PlaceholderColor'), w: (o.w || 240) - 20 }))
  return kit.add(c, b)
}

// Card parts span the card, so only its width changes between sizes; the wrap rows keep a number for the row cut
const penpotIssueCard = kit.IssueCard
kit.IssueCard = (d, w = 294) => {
  const card = penpotIssueCard(d, w)
  for (const c of card.children) if (c.name !== 'card-labels' && c.name !== 'labels') c.hs = 'fill'
  card.children[1].children[0].node.width = 'fill_container'
  return card
}

// Cards sit in their own frame: the slot of the column
const penpotKanbanColumn = kit.KanbanColumn
kit.KanbanColumn = (col, w, h) => {
  const c = penpotKanbanColumn(col, w, h)
  const cards = kit.box('cards', { w: w - 26, h: 10, dir: 'column', gap: 8, vs: 'auto', clip: false })
  kit.add(cards, c.children.slice(col.statuses ? 3 : 2))
  return kit.add(c, cards)
}

// Navigator entries are placed by x and y: they move into one frame at 0,0, the slot of the component
const penpotNavigator = kit.Navigator
kit.Navigator = (h, o = {}) => {
  const nav = penpotNavigator(h, o)
  const items = kit.box('items', { w: nav.w, h, clip: false })
  // After the border and the title come the tool buttons and the three parts of the New button
  kit.add(items, nav.children.slice(2 + (o.tools || []).length + (o.newLabel !== null ? 3 : 0)))
  kit.at(nav, items, 0, 0)
  return nav
}

// The layout and the header fill the panel they get: one frame over the panel is the component
const penpotSettingsLayout = kit.SettingsLayout
kit.SettingsLayout = (main, o = {}) => {
  const frame = kit.box('Settings', { w: main.width, h: main.height, clip: false })
  frame.comp = 'SettingsLayout'
  frame.call = { fn: 'SettingsLayout', args: [main, o] }
  const content = penpotSettingsLayout(frame, o)
  kit.at(main, frame, 0, 0)
  return content
}

const penpotSpaceHeader = kit.SpaceHeader
kit.SpaceHeader = (main, o = {}) => {
  const frame = kit.box('Space header', { w: main.width, h: 113, clip: false })
  frame.comp = 'SpaceHeader'
  frame.call = { fn: 'SpaceHeader', args: [main, o] }
  const top = penpotSpaceHeader(frame, o)
  frame.children.find((c) => c.name === 'Filter row').children[0].name = 'filters'
  kit.at(main, frame, 0, 0)
  return top
}

// The control is the slot of the row
const penpotFormRow = kit.FormRow
kit.FormRow = (label, control, o = {}) => {
  const row = penpotFormRow(label, control, o)
  const slot = kit.box('control', { dir: 'row', hs: 'auto', vs: 'auto', clip: false })
  kit.add(slot, control)
  return kit.add(row, slot)
}

// Header cells and body rows are the two slots of the table
const penpotTable = kit.Table
kit.Table = (cols, rows, o = {}) => {
  const table = penpotTable(cols, rows, o)
  const body = kit.box('body', { w: table.w, h: 10, dir: 'column', vs: 'auto', clip: false })
  kit.add(body, table.children.slice(1))
  return kit.add(table, body)
}

// Ring with a filled share; drawn with pen primitives (the Penpot kit imports an SVG)
kit.ProgressCircle = (value, max, size = 16) => {
  const c = size / 2
  const r = c - 2
  const share = max > 0 ? Math.min(1, value / max) : 0
  const col = colorOf(T('theme-dark-color'))
  const a = share * Math.PI * 2
  const kids = [{ type: 'ellipse', name: 'ring', x: 2, y: 2, width: 2 * r, height: 2 * r, stroke: col, strokeWidth: 1.5, strokeAlignment: 'center', opacity: 0.5 }]
  if (share >= 1) kids.push({ type: 'ellipse', name: 'fill', x: 3, y: 3, width: 2 * (r - 1), height: 2 * (r - 1), fill: col })
  else if (share > 0) kids.push(shape('fill', `M${c} ${c}L${c} ${c - r + 1}A${r - 1} ${r - 1} 0 ${share > 0.5 ? 1 : 0} 1 ${c + (r - 1) * Math.sin(a)} ${c - (r - 1) * Math.cos(a)}Z`, size, { fill: col }))
  return kit.pen({ type: 'frame', name: 'ProgressCircle', layout: 'none', width: size, height: size, children: kids })
}

// The header fills the panel width: one frame over the panel is the component
const penpotPanelHeader = kit.PanelHeader
kit.PanelHeader = (main, o = {}) => {
  const frame = kit.box('Panel header', { w: main.width, h: 57, clip: false })
  frame.comp = 'PanelHeader'
  frame.call = { fn: 'PanelHeader', args: [main, o] }
  const top = penpotPanelHeader(frame, o)
  kit.at(main, frame, 0, 0)
  return top
}

// The rows of a group are the slot, its header stays in the component
const penpotIssueGroup = kit.IssueGroup
kit.IssueGroup = (g, w = 1481, o = {}) => {
  const box = penpotIssueGroup(g, w, o)
  const rows = kit.box('rows', { w: w - 2, h: 10, dir: 'column', vs: 'auto', clip: false })
  kit.add(rows, box.children.slice(1))
  return kit.add(box, rows)
}

// Whatever a screen adds to the shell itself (dim, dialog) lands in an overlay, the slot of the component;
// without any, the shell has no overlay (pen outlines an empty slot)
const penpotWorkbench = kit.Workbench
kit.Workbench = (name, x, y, o = {}) => {
  const r = penpotWorkbench(name, x, y, o)
  const f = r.frame
  let overlay
  Object.defineProperty(f, 'sink', {
    get: () => {
      if (overlay === undefined) {
        overlay = kit.box('overlay', { w: f.w, h: f.h, clip: false })
        f.children.push(overlay)
        overlay.parent = f
      }
      return overlay
    }
  })
  return r
}

// The project, the separator and the id sit at fixed x in the Penpot kit; a long project name runs over them
const penpotIssuePage = kit.IssuePage
kit.IssuePage = (d, w, h) => {
  const page = penpotIssuePage(d, w, h)
  const crumbs = page.children.filter((c) => c.y === 19 && c.x >= 78 && c.x <= 174)
  const row = kit.row('breadcrumb', 8)
  kit.add(row, crumbs)
  kit.at(page, row, 78, 19)
  return page
}

// Buttons of the dialog sit at fixed x with fixed widths: the pen text is wider and gets cut or overlaps.
// The header and the two attribute rows flow instead, buttons size to their content.
const penpotNewIssuePopup = kit.NewIssuePopup
kit.NewIssuePopup = (o = {}) => {
  const card = penpotNewIssuePopup(o)
  const flow = (name, kids, x, y, h) => {
    const row = kit.box(name, { dir: 'row', gap: 8, align: 'center', hs: 'auto', vs: 'auto', clip: false })
    for (const k of kids) if (k.layout === 'horizontal') k.hs = 'auto'
    kit.add(row, kids)
    kit.at(card, row, x, y)
  }
  const at = (test) => card.children.filter(test)
  flow('header', at((c) => c.y < 60 && c.x < 400), 24, 24)
  flow('attributes', at((c) => c.y === 219), 24, 219)
  flow('attributes 2', at((c) => c.y === 263), 24, 263)
  return card
}
