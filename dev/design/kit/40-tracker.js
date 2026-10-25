// Tracker pieces from tracker-resources issues/KanbanView.svelte and packages/kanban.
// Sizes and colors were checked against the sanity stand (sanity-ws, DefaultProject).

// Status palette name per category (models/task/src/index.ts); a status may override it with its own color
kit.statusPalette = (cat, color) => color || kit.CATEGORY[cat]

// Card of a board in four densities (detailed, normal, compact, dense), 234px wide in a board column.
// d: id cat color(palette) title assignee[initials, palette] priority sub due overdue component milestone
//    labels[[name, palette]] est(text, "13h") accent(color) parent density estLabel att com(counters of a detailed card)
//    productIcons(the icons of the product card: layers, signpost, orange due date)
//    hover dragged(the drop place) lifted(in hand) focus('inset' as today: a rule border hides it | 'ring' outside the card)
// The 'ring' needs an outline, which Penpot and pen do not have: only the Storybook card draws it.
kit.IssueCard = (d, w = 234) => {
  const density = d.density || 'detailed'
  const [py, px] = { detailed: [12, 14], normal: [10, 12], compact: [8, 10], dense: [6, 10] }[density]
  const gap = { detailed: 8, normal: 8, compact: 6, dense: 4 }[density]
  const inner = w - 2 * px - 2
  const dark = T('theme-dark-color')
  const inset = d.focus === 'inset' && !d.accent
  // A focused card keeps its background: the ring already marks it
  const fill = d.dragged ? T('accent-bg-color') : d.hover && !d.focus ? T('highlight-hover') : T('theme-popup-color')
  const card = kit.box('IssueCard ' + d.id, { w, h: 40, dir: 'column', gap, pad: [py, px, py, px], vs: 'auto', fill, stroke: d.accent || (inset ? T('primary-edit-border-color') : T('theme-divider-color')), strokeW: d.accent || inset ? 2 : 1, radius: 8 })
  const lift = d.lifted ? [{ style: 'drop-shadow', offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: { color: '#000000', opacity: 0.15 } }] : []
  card.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 1, blur: 3, spread: 0, color: { color: '#000000', opacity: 0.06 } }, ...lift]
  const avatar = () => d.assignee ? kit.Avatar(d.assignee[0], d.assignee[1], 20, true) : kit.AvatarEmpty(20)
  const txt = (s, size, color, o = {}) => kit.text(s, { size, color, ...o })
  const pill = (name, content) => kit.add(kit.box(name, { w: 10, h: 20, dir: 'row', gap: 6, pad: [3, 8, 3, 8], align: 'center', hs: 'auto', vs: 'auto', radius: 12, fill: T('theme-popup-color'), stroke: T('theme-button-border') }), content)
  const dueColor = d.overdue ? T('theme-state-negative-color') : dark
  const ic = d.productIcons
    ? { sub: 'tracker/sub-issue', due: 'calendar', component: 'tracker/component', milestone: 'tracker/milestone' }
    : { sub: 'subissues', due: 'calendar', component: 'component', milestone: 'milestone' }
  const dueIcon = d.productIcons && !d.overdue ? T('theme-warning-color') : dueColor
  if (density === 'dense') {
    const row = kit.box('row', { w: inner, h: 20, dir: 'row', gap: 6, align: 'center', vs: 'auto' })
    const room = inner - 16 - 20 - 18 - kit.textWidth(d.id, 12)
    let title = d.title
    while (title.length > 1 && kit.textWidth(title, 13) > room) title = title.slice(0, -1)
    if (title !== d.title) title = title.trimEnd() + '…'
    kit.add(row, kit.StatusIcon(d.cat, 16, d.color), txt(d.id, 12, T('theme-darker-color')), txt(title, 13, T('theme-caption-color'), { name: 'title' }), avatar())
    return kit.add(card, row)
  }
  if (density === 'compact') {
    const row = kit.box('title row', { w: inner, h: 20, dir: 'row', gap: 6, vs: 'auto', align: 'start' })
    kit.add(row, kit.StatusIcon(d.cat, 16, d.color), txt(d.title, 13, T('theme-caption-color'), { weight: 500, w: inner - 16 - 20 - 12, name: 'title' }), avatar())
    const meta = kit.box('meta', { w: inner, h: 20, dir: 'row', gap: 8, align: 'center', hs: 'auto', vs: 'auto' })
    kit.add(meta, txt(d.id, 12, T('theme-darker-color')), kit.PriorityIcon(d.priority || 'none'))
    if (d.sub) kit.add(meta, kit.icon(ic.sub, dark, 14))
    if (d.due) kit.add(meta, kit.icon(ic.due, dueIcon, 14))
    if (d.component) kit.add(meta, kit.icon(ic.component, dark, 14))
    if (d.milestone) kit.add(meta, kit.icon(ic.milestone, dark, 14))
    if (d.est) kit.add(meta, txt(d.est, 12, T('theme-darker-color')))
    return kit.add(card, row, meta)
  }
  const top = kit.box('top', { w: inner, h: 20, dir: 'row', align: 'center', justify: 'space-between', vs: 'auto' })
  const left = kit.row('left', 4)
  kit.add(left, txt(d.id, 12, dark, { name: 'id' }))
  if (d.parent) kit.add(left, txt('› ' + d.parent, 12, T('theme-darker-color'), { name: 'parent' }))
  kit.add(top, left, avatar())
  const title = kit.box('title row', { w: inner, h: 20, dir: 'row', gap: 8, vs: 'auto', align: 'start' })
  kit.add(title, kit.StatusIcon(d.cat, 16, d.color), txt(d.title, 14, T('theme-caption-color'), { weight: 500, w: inner - 24, name: 'title' }))
  const chips = kit.box('chips', { w: inner, h: 20, dir: 'row', gap: 6, wrap: true, vs: 'auto', align: 'start' })
  kit.add(chips, pill('priority', kit.PriorityIcon(d.priority || 'none')))
  if (d.sub) kit.add(chips, pill('sub-issues', [kit.icon(ic.sub, dark, 14), txt(d.sub, 12, dark)]))
  if (d.due) kit.add(chips, pill('due date', [kit.icon(ic.due, dueIcon, 14), txt(d.due, 12, dueColor)]))
  if (d.component) kit.add(chips, pill('component', [kit.icon(ic.component, dark, 14), txt(d.component, 12, dark)]))
  if (d.milestone) kit.add(chips, pill('milestone', [kit.icon(ic.milestone, dark, 14), txt(d.milestone, 12, dark)]))
  if (density === 'detailed') for (const [name, pal] of (d.labels || [])) kit.add(chips, pill('label', [kit.ellipse(8, P(pal), 'dot'), txt(name, 12, dark)]))
  else if (d.est) kit.add(chips, pill('est', txt(d.est, 12, dark)))
  kit.add(card, top, title, chips)
  if (density === 'detailed' && (d.att || d.com)) {
    const foot = kit.box('footer', { w: inner, h: 15, dir: 'row', align: 'center', justify: 'space-between', vs: 'auto' })
    const count = (icon, n) => kit.add(kit.row('counter', 4), kit.icon(icon, T('theme-darker-color'), 14), txt(String(n), 12, T('theme-darker-color')))
    kit.add(foot, d.est ? txt((d.estLabel || 'Оценка') + ' ' + d.est, 12, T('theme-darker-color'), { name: 'footer' }) : kit.spacer(1, 1))
    kit.add(foot, kit.add(kit.row('counters', 10), d.att ? count('clip', d.att) : [], d.com ? count('comment', d.com) : []))
    kit.add(card, foot)
  } else if (density === 'detailed' && d.est) kit.add(card, txt((d.estLabel || 'Оценка') + ' ' + d.est, 12, T('theme-darker-color'), { name: 'footer' }))
  return card
}

// Column header: tinted with the status palette background, name in its title color, text centered.
// o: tools(bool, hover state) limit over(the limit is red) color(palette name) action(label of a button at the right)
kit.ColumnHeader = (name, cat, count, w = 294, o = {}) => {
  const pal = kit.statusPalette(cat, o.color)
  const h = kit.box('ColumnHeader ' + name, { w, h: 40, dir: 'row', pad: [0, o.tools ? 4 : 8, 0, 20], align: 'center', justify: 'space-between', fill: PB(pal), stroke: T('theme-divider-color'), radius: 4 })
  const l = kit.row('title', 8)
  if (cat) kit.add(l, kit.StatusIcon(cat, 14, pal))
  kit.add(l, kit.text(name, { size: 14, weight: 500, color: PT(pal) }), kit.text(String(count), { size: 14, color: T('theme-dark-color') }))
  if (o.limit) kit.add(l, kit.text('/ ' + o.limit, { size: 14, color: o.over ? T('theme-state-negative-color') : T('theme-darker-color') }))
  kit.add(h, l)
  if (o.action) kit.add(h, kit.Button({ kind: 'secondary', size: 'extra-small', icon: o.actionIcon, label: o.action, name: 'ColumnAction' }))
  if (o.tools) kit.add(h, kit.add(kit.row('tools (hover)', 4), ['chevronR', 'merge', 'plus'].map((i) => kit.IconButton(i, { kind: 'ghost', size: 'small' }))))
  return h
}

// Column (panel-container, 20rem) with header, optional status chips and the cards on the grey column background.
// col: name cat color count cards[] statuses[[name,cat]] limit over tools density
kit.KanbanColumn = (col, w, h) => {
  const inner = w - 26
  const c = kit.box('Column ' + col.name, { w, h, dir: 'column', gap: 8, pad: [0, 13, 0, 13] })
  // The spacer keeps the child order of the library column; cards start 17px under the header
  kit.add(c, kit.ColumnHeader(col.name, col.cat, col.count, inner, col), kit.spacer(inner, 1))
  if (col.statuses) {
    const st = kit.box('statuses', { w: inner, h: 20, dir: 'row', gap: 4, pad: [0, 2, 0, 2], wrap: true, vs: 'auto' })
    kit.add(c, kit.add(st, col.statuses.map(([n, cat]) => kit.StatusChip(n, cat))))
  }
  const cards = (col.cards || []).map((d) => kit.IssueCard({ density: col.density, ...d }, inner - 16))
  if (cards.length > 0) kit.add(c, kit.add(kit.box('cards', { w: inner, h: 10, dir: 'column', gap: 8, pad: [8, 8, 8, 8], vs: 'auto', fill: T('theme-kanban-card-bg-color'), radius: 8, clip: false }), cards))
  return c
}

// Progress circle (ui ProgressCircle, size small): 16px ring with a filled share
kit.ProgressCircle = (value, max, size = 16) => {
  const c = size / 2
  const r = c - 2
  const share = max > 0 ? Math.min(1, value / max) : 0
  const col = String(T('theme-dark-color')).slice(0, 7)
  const a = share * Math.PI * 2
  const arc = share >= 1
    ? `<circle cx="${c}" cy="${c}" r="${r - 1}" fill="${col}"/>`
    : share > 0 ? `<path d="M${c} ${c} L${c} ${c - r + 1} A${r - 1} ${r - 1} 0 ${share > 0.5 ? 1 : 0} 1 ${c + (r - 1) * Math.sin(a)} ${c - (r - 1) * Math.cos(a)} Z" fill="${col}"/>` : ''
  return kit.svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${col}" stroke-opacity="0.5" stroke-width="1.5"/>${arc}</svg>`, 'ProgressCircle')
}

// Pill of a list row (antiButton kind="list" size="small"): icon and label of an attribute
kit.ListChip = (content, o = {}) => {
  const b = kit.box(o.name || 'ListChip', { w: 28, h: 28, dir: 'row', gap: 6, pad: [0, 8, 0, 8], align: 'center', hs: 'auto', radius: 24, fill: T('theme-list-button-color'), stroke: T('theme-button-border') })
  return kit.add(b, content)
}

// Advance widths of IBM Plex Sans (the product font) per 100px for ASCII 32..126, measured on the stand;
// neither Penpot nor pen exposes text width to a script, so the list columns are sized from this estimate
const PLEX = [24,28,42,71,60,93,69,24,34,34,45,60,27,40,27,38,60,60,60,60,60,60,60,60,60,60,29,29,60,60,60,48,89,64,65,62,67,58,56,70,71,40,51,63,50,81,71,71,61,71,64,58,57,68,61,89,61,59,58,32,38,32,60,57,60,53,58,50,58,55,32,53,57,25,25,53,27,87,57,56,58,58,37,49,35,57,49,77,51,50,46,34,31,34,60]
kit.textWidth = (s, size) => Math.ceil([...String(s)].reduce((sum, ch) => sum + (PLEX[ch.charCodeAt(0) - 32] ?? 55), 0) * size / 100)

// Fixed columns of a list row, one width per column key shared by every row of the list (view-resources FixedColumn):
// id, reported, estimation, created, modified
kit.IssueColumns = (issues) => {
  const max = (f) => Math.max(0, ...issues.map(f))
  return {
    id: max((d) => kit.textWidth(d.id, 14)),
    rep: max((d) => kit.textWidth((d.rep || 0) + 'h', 13)),
    est: max((d) => 24 + kit.textWidth(d.est || '0h', 13)),
    created: max((d) => kit.textWidth(d.created || '', 12)),
    modified: max((d) => kit.textWidth(d.modified || '', 12))
  }
}

// List row (view-resources ListItem with the tracker issueConfig): 44px, 1px divider under it.
// d: id cat color title priority assignee[initials, palette] sub component milestone labels[[name, palette]]
//    due overdue att com est rep created modified
// o: last, cols (kit.IssueColumns of the whole list; of the row alone when absent)
kit.IssueRow = (d, w = 1481, o = {}) => {
  const half = T('theme-halfcontent-color')
  const cols = o.cols ?? kit.IssueColumns([d])
  const wrap = kit.box('IssueRow ' + d.id, { w, h: 44, dir: 'column', fill: T('theme-list-row-color') })
  const row = kit.box('row', { w, h: o.last ? 44 : 43, dir: 'row', gap: 4, pad: [0, 24, 0, 12], align: 'center' })
  const fixed = (name, bw, h, ...kids) => kit.add(kit.box(name, { w: bw, h, dir: 'row', align: 'center' }), kids)
  const divider = () => kit.add(kit.box('divider', { w: 21, h: 24, dir: 'row', pad: [0, 6, 0, 14] }), kit.box('line', { w: 1, h: 24, fill: T('theme-list-divider-color') }))
  kit.add(row, kit.add(kit.box('check', { w: 16, h: 16, dir: 'row', radius: 4, stroke: T('theme-checkbox-border') })), kit.spacer(4, 1))
  kit.add(row, fixed('priority', 16, 16, kit.PriorityIcon(d.priority || 'none')))
  kit.add(row, fixed('id', cols.id, 18, kit.text(d.id, { size: 14, color: half })))
  kit.add(row, kit.add(kit.box('status', { w: 30, h: 16, dir: 'row', pad: [0, 0, 0, 14] }), kit.StatusIcon(d.cat, 16, d.color)))
  kit.add(row, kit.text(d.title, { size: 14, color: T('theme-caption-color'), name: 'title' }))
  if (d.sub) kit.add(row, kit.Chip([kit.icon('subissues', undefined, 14), kit.text(d.sub, { size: 12, color: T('theme-content-color') })], { name: 'sub-issues' }))
  if (d.com) kit.add(row, kit.add(kit.row('comments', 3), kit.icon('comment', undefined, 14), kit.text(String(d.com), { size: 13, color: T('theme-dark-color') })))
  if (d.att) kit.add(row, kit.add(kit.row('attachments', 3), kit.icon('clip', undefined, 14), kit.text(String(d.att), { size: 13, color: T('theme-dark-color') })))
  const g = kit.box('grow', { w: 1, h: 1 })
  kit.add(row, g)
  g.layoutChild.horizontalSizing = 'fill'
  for (const [name, pal] of (d.labels || [])) {
    const dot = kit.box('dot', { w: 8, h: 8, radius: 4, fill: P(pal) })
    kit.add(row, kit.add(kit.box('Label ' + name, { w: 10, h: 28, dir: 'row', gap: 6, pad: [0, 8, 0, 8], align: 'center', hs: 'auto', radius: 24, fill: T('theme-button-default'), stroke: T('theme-button-border') }), dot, kit.text(name, { size: 14, color: T('theme-caption-color') })))
  }
  const chip = (ic, label, color) => kit.ListChip([kit.icon(ic, half, 16), kit.text(label, { size: 13, color: color || half })], { name: 'ListChip/' + ic })
  if (d.milestone) kit.add(row, chip('milestone', d.milestone))
  if (d.component) kit.add(row, chip('component', d.component))
  if (d.due) kit.add(row, chip('calendar', d.due, d.overdue ? T('theme-state-negative-color') : undefined))
  kit.add(row, divider(), fixed('col reported', cols.rep, 18, kit.text((d.rep || 0) + 'h', { size: 13, color: half, name: 'reported' })), divider())
  kit.add(row, kit.add(kit.box('estimation', { w: cols.est, h: 18, dir: 'row', gap: 8, align: 'center' }), parseFloat(d.est) > 0 ? kit.ProgressCircle(d.rep || 0, parseFloat(d.est)) : kit.spacer(16, 16), kit.text(d.est || '0h', { size: 13, color: half })))
  kit.add(row, divider(), fixed('col created', cols.created, 18, kit.text(d.created || '', { size: 12, color: T('theme-dark-color'), name: 'created' })), divider(), fixed('col modified', cols.modified, 18, kit.text(d.modified || '', { size: 12, color: T('theme-dark-color'), name: 'modified' })))
  kit.add(row, d.assignee ? kit.Avatar(d.assignee[0], d.assignee[1], 24) : kit.AvatarEmpty(24))
  kit.add(wrap, row)
  if (!o.last) kit.add(wrap, kit.box('border', { w, h: 1, fill: T('theme-divider-color') }))
  return wrap
}

// Group of a list: tinted header (status palette) over its rows, 1px outer border
// g: name cat color estimation issues[]
kit.IssueGroup = (g, w = 1481, o = {}) => {
  const pal = kit.statusPalette(g.cat, g.color)
  const box = kit.box('Group ' + g.name, { w, h: 44, dir: 'column', vs: 'auto', stroke: T('theme-list-border-color'), radius: 4 })
  const head = kit.box('categoryHeader', { w, h: 44, dir: 'row', pad: [0, 112, 0, 12], align: 'center', justify: 'space-between', fill: PB(pal), radius: 4 })
  const l = kit.row('title', 0)
  const title = PT(pal)
  const chev = kit.box('chevron', { w: 28, h: 16, dir: 'row', pad: [0, 12, 0, 0] })
  // Rows present: the collapse arrow; no issues: a 4px dot instead
  if (g.issues.length > 0) kit.add(chev, kit.icon('kit/CaretDownFill', T('theme-caption-color'), 16))
  else kit.add(chev, kit.add(kit.box('dot', { w: 16, h: 16, dir: 'row', align: 'center', justify: 'center' }), kit.box('dot', { w: 4, h: 4, radius: 2, fill: T('theme-dark-color') })))
  kit.add(l, chev, kit.StatusIcon(g.cat, 16, g.color))
  kit.add(l, kit.spacer(8, 1), kit.text(g.name, { size: 14, weight: 500, color: title }), kit.spacer(8, 1), kit.text(String(g.issues.length), { size: 14, color: T('theme-dark-color') }))
  kit.add(head, l, kit.add(kit.box('estimation', { w: 48, h: 24, dir: 'row', pad: [0, 0, 0, 8], align: 'center' }), kit.text(g.estimation || '0h', { size: 14, color: title, name: 'estimation' })))
  kit.add(box, head)
  const cols = o.cols ?? kit.IssueColumns(g.issues)
  g.issues.forEach((d, i) => kit.add(box, kit.IssueRow(d, w - 2, { last: i === g.issues.length - 1, cols })))
  return box
}

kit.IssueList = (groups, w = 1481) => {
  const list = kit.box('Issue list', { w, h: 10, dir: 'column', gap: 8, vs: 'auto' })
  const cols = kit.IssueColumns(groups.flatMap((g) => g.issues))
  return kit.add(list, groups.map((g) => kit.IssueGroup(g, w, { cols })))
}

// Issue page (EditIssue in a popup Panel), 1515x967: header, main column, 400px properties aside.
// d: id cat color title priority assignee[initials, palette, name] component milestone est rep project creator[initials, palette, name]
//    description subIssues[] activity[{ time, text, strong }] created
kit.IssuePage = (d, w = 1515, h = 967) => {
  const page = kit.box('Issue page ' + d.id, { w, h, fill: T('theme-panel-color'), stroke: T('theme-divider-color'), radius: 8 })
  const put = (el, x, y) => kit.at(page, el, x, y)
  const sec = T('global-secondary-TextColor')
  const dark = T('theme-dark-color')
  const ibtn = (name, o = {}) => kit.add(kit.box('button ' + name, { w: 32, h: 32, dir: 'row', align: 'center', justify: 'center', radius: 6, fill: o.on ? T('theme-button-default') : null }), kit.icon(name, o.color || sec, 20))
  const txt = (s, size, color, o = {}) => kit.text(s, { size, color, ...o })
  // Header
  put(ibtn('kit/Cross'), 17, 12)
  put(kit.box('divider', { w: 1, h: 32, fill: T('theme-divider-color') }), 61, 12)
  put(kit.add(kit.row('project', 8), kit.icon('kit/HouseFill', dark, 16), txt(d.project || 'Default', 14, T('theme-caption-color'))), 78, 19)
  put(txt('›', 14, T('theme-caption-color')), 158, 19)
  put(txt(d.id, 14, T('theme-caption-color')), 174, 19)
  let hx = 1245
  put(ibtn('kit/Sparkle'), hx, 12)
  put(kit.add(kit.box('reactions', { w: 36, h: 32, dir: 'row', align: 'center', justify: 'center' }), kit.icon('kit/Star', sec, 20)), hx + 40, 12)
  put(ibtn('kit/Link'), 1329, 12)
  put(ibtn('kit/ArrowInSquare'), 1369, 12)
  put(ibtn('kit/DotsHorizontal'), 1409, 12)
  put(kit.box('aside divider', { w: 1, h: 20, fill: T('global-ui-BorderColor') }), 1453, 18)
  put(ibtn('kit/ArrowInSquare', { on: true, color: T('primary-button-default') }), 1466, 12)
  put(kit.box('header border', { w: w - 2, h: 1, fill: T('theme-divider-color') }), 1, 56)
  put(kit.box('separator', { w: 1, h: h - 58, fill: T('theme-divider-color') }), 1113, 57)
  // Main column: x 61.., 992 wide, y from 57
  put(ibtn('kit/ArrowsOutLineHorizontal'), 1067, 89)
  put(txt(d.title, 20, T('theme-caption-color'), { name: 'title' }), 61, 89)
  put(txt(d.description || 'Add description...', 14, d.description ? T('theme-content-color') : dark, { name: 'description', w: 992 }), 61, 155)
  const tools = [['kit/Paperclip', 61], ['kit/Camera', 99], ['|', 137], ['kit/TableCells', 144], ['|', 182], ['kit/At', 189], ['kit/Smiley', 227], ['|', 265], ['kit/BubblePlus', 272]]
  for (const [n, x] of tools) put(n === '|' ? kit.box('divider', { w: 1, h: 24, fill: T('theme-list-divider-color') }) : ibtn(n), x, n === '|' ? 195 : 191)
  let y = 250
  const subCols = kit.IssueColumns(d.subIssues || [])
  for (const s of (d.subIssues || [])) { put(kit.IssueRow(s, 992, { last: false, cols: subCols }), 61, y); y += 44 }
  y += 24
  const add = kit.add(kit.box('Add sub-issue', { w: 157, h: 32, dir: 'row', gap: 8, pad: [0, 12, 0, 12], align: 'center' }), kit.icon('kit/Plus', T('theme-content-color'), 16), txt('Add sub-issue', 13, T('theme-content-color')), kit.icon('kit/ChevronDown', T('theme-content-color'), 16))
  put(add, 61, y)
  y += 60
  // Activity
  put(kit.icon('kit/ChartSquare', T('theme-content-color'), 16), 61, y + 12)
  put(txt('Activity', 16, T('theme-caption-color')), 85, y + 9)
  put(kit.icon('kit/SlidersHorizontal', T('theme-content-color'), 16), 1017, y + 12)
  put(kit.box('activity divider', { w: 992, h: 1, fill: T('theme-divider-color') }), 61, y + 40)
  y += 39
  const who = d.creator || ['AJ', 'Blueberry', 'Appleseed John']
  put(kit.Avatar(who[0], who[1], 40), 82, y + 13)
  put(kit.add(kit.row('author', 4), txt(who[2], 14, sec, { weight: 500 }), txt(d.created || '', 12, sec)), 138, y + 10)
  // The title is a link: primary color
  put(kit.add(kit.row('new issue', 8), kit.icon('kit/CheckSquare', T('theme-caption-color'), 16), kit.add(kit.row('text', 0), txt('New issue: ', 14, T('theme-caption-color')), txt(d.title, 14, T('primary-button-default')))), 138, y + 33)
  y += 62
  for (const a of (d.activity || [])) {
    put(txt(a.time, 12, T('theme-caption-color')), 98, y + 11)
    put(kit.add(kit.row('update', 8), kit.icon('kit/PencilLine', T('theme-caption-color'), 16), kit.add(kit.row('text', 4), txt(a.text, 14, T('theme-caption-color')), a.strong ? txt(a.strong, 14, T('theme-caption-color'), { weight: 500 }) : [])), 138, y + 9)
    y += 37
  }
  y += 2
  put(kit.add(kit.box('comment box', { w: 992, h: 88, dir: 'column', stroke: T('theme-button-border'), radius: 6 }), kit.add(kit.box('input', { w: 990, h: 44, dir: 'row', pad: [10, 12, 0, 12] }), txt('Start typing...', 14, dark))), 61, y)
  const ctools = ['kit/Paperclip', 'kit/Camera', '|', 'kit/Mic', '|', 'kit/At', 'kit/Smiley', '|', 'kit/BubblePlus']
  let cx = 73
  for (const n of ctools) { if (n === '|') { put(kit.box('divider', { w: 1, h: 24, fill: T('theme-list-divider-color') }), cx, y + 53); cx += 7 } else { put(ibtn(n), cx, y + 49); cx += 38 } }
  put(ibtn('text-editor/Send', { color: T('theme-halfcontent-color') }), 1007, y + 49)
  // Aside: x 1115.., rows of 36 (label 128 | value 192 at x+144), sections divided by a line
  const ax = 1115
  const row = (ry, label, value, hh = 32) => { put(txt(label, 14, dark), ax + 32, ry + (hh - 18.5) / 2); put(value, ax + 176, ry) }
  const val = (content, hh = 32) => kit.add(kit.box('value', { w: 192, h: hh, dir: 'row', gap: 8, pad: [0, 12, 0, 12], align: 'center' }), content)
  const line = (ly) => put(kit.box('divider', { w: 400, h: 1, fill: T('theme-divider-color') }), ax, ly)
  const prio = { none: 'No priority', urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }[d.priority || 'none']
  row(73, 'Status', val([kit.StatusIcon(d.cat, 16, d.color), txt(d.statusName || '', 13, T('theme-content-color'))]))
  row(109, 'Priority', val([kit.PriorityIcon(d.priority || 'none'), txt(prio, 13, T('theme-content-color'))]))
  row(145, 'Created by', val([kit.Avatar(who[0], who[1], 20), txt(who[2], 13, dark)]))
  row(181, 'Assignee', val(d.assignee ? [kit.Avatar(d.assignee[0], d.assignee[1], 20), txt(d.assignee[2] || '', 13, T('theme-content-color'))] : [kit.icon('kit/PersonCircle', dark, 16), txt('Assignee', 13, dark)]))
  row(217, 'Labels', kit.add(kit.box('Add label', { w: 100, h: 32, dir: 'row', gap: 4, pad: [0, 10, 0, 8], align: 'center', radius: 16 }), kit.icon('kit/Tag', T('theme-content-color'), 16), txt('Add label', 14, T('theme-content-color'))))
  line(268)
  row(289, 'Task type', val([kit.icon('kit/CheckSquare', dark, 16), txt('Issue', 13, dark)]))
  row(325, 'Component', val([kit.icon('kit/Diamond', T('theme-content-color'), 16), txt(d.component || 'Component', 13, d.component ? T('theme-content-color') : dark)]))
  row(361, 'Milestone', val([kit.icon('kit/Signpost', d.milestone ? T('theme-content-color') : T('theme-halfcontent-color'), 16), txt(d.milestone || 'Milestone', 13, d.milestone ? T('theme-content-color') : dark)]))
  line(412)
  row(435, 'Estimation', val(txt((d.est || '0h'), 13, T('theme-content-color')), 28), 28)
  row(469, 'Spent time', val([txt((d.rep || 0) + 'h', 13, T('theme-content-color')), kit.icon('kit/Plus', dark, 16)], 36), 36)
  line(524)
  row(552, 'Remaining time', val(txt((parseFloat(d.est) || 0) - (d.rep || 0) + 'h', 14, T('theme-caption-color')), 18), 18)
  line(596)
  row(617, 'Collaborators', val([kit.Avatar(who[0], who[1], 20), txt(who[2], 13, T('theme-content-color'))], 36), 36)
  line(672)
  row(693, 'Repository', val([txt('Repository', 13, T('theme-content-color')), kit.icon('kit/ChevronDown', T('theme-halfcontent-color'), 12)]))
  line(744)
  put(txt('State History:', 14, T('theme-caption-color')), ax + 32, 771)
  put(kit.add(kit.row('state', 8), kit.StatusIcon(d.cat, 16, d.color), txt(d.statusName || '', 14, T('theme-caption-color'))), ax + 32, 807)
  put(txt(d.created || '', 14, T('theme-caption-color')), ax + 190, 807)
  return page
}

// Create issue dialog (CreateIssue in a presentation Card), 720x391, shown over a 20% dim.
// o: project status(cat) statusName
kit.NewIssuePopup = (o = {}) => {
  const card = kit.box('New issue popup', { w: 720, h: 391, fill: T('theme-popup-color'), radius: 8 })
  card.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 0, blur: 8, spread: 0, color: { color: '#000000', opacity: 0.2 } }]
  const put = (el, x, y) => kit.at(card, el, x, y)
  const dark = T('theme-dark-color')
  const content = T('theme-content-color')
  const btn = (name, w, h, r, kids, o2 = {}) => kit.add(kit.box(name, { w, h, dir: 'row', gap: 6, pad: [0, 12, 0, 12], align: 'center', radius: r, fill: o2.fill === undefined ? T('theme-button-default') : o2.fill, stroke: o2.noBorder ? null : T('theme-button-border') }), kids)
  const label = (s, color) => kit.text(s, { size: 13, color: color || content })
  // Header
  put(btn('project', 90.4, 28, 6, [kit.icon('kit/HouseFill', content, 16), label(o.project || 'Default')]), 24, 24)
  put(btn('template', 98.2, 28, 6, [label('No template', dark)]), 122.4, 24)
  put(kit.icon('kit/ChevronRightLarge', dark, 16), 228.6, 30)
  put(kit.text('New issue', { size: 14, color: T('global-primary-TextColor') }), 252.6, 27.5)
  put(btn('type', 160, 28, 6, [kit.icon('kit/CheckSquare', content, 16), label('Issue'), kit.spacer(60, 1), kit.icon('kit/ChevronDown', content, 16)]), 324.9, 24)
  put(kit.add(kit.box('ai', { w: 32, h: 32, dir: 'row', align: 'center', justify: 'center', radius: 6 }), kit.icon('kit/Sparkle', T('primary-button-default'), 20)), 620, 22)
  put(kit.add(kit.box('close', { w: 28, h: 28, dir: 'row', align: 'center', justify: 'center', radius: 6 }), kit.icon('kit/Cross', dark, 20)), 668, 24)
  // Content
  put(kit.text('Issue title', { size: 20, color: T('theme-trans-color'), name: 'title' }), 36, 96)
  put(kit.text('Add description...', { size: 14, color: dark, name: 'description' }), 36, 155)
  // Attribute pool: 36px buttons, 8px apart
  const pool = (x, y, w, name, kids) => put(btn(name, w, 36, 6, kids), x, y)
  const half = T('theme-halfcontent-color')
  pool(24, 219, 93.5, 'status', [kit.StatusIcon(o.cat || 'backlog', 13, o.color), label(o.statusName || 'Backlog')])
  pool(125.5, 219, 109.5, 'priority', [kit.PriorityIcon('none'), label('No priority')])
  pool(243, 219, 100.7, 'assignee', [kit.icon('kit/PersonCircle', dark, 16), label('Assignee', dark)])
  pool(351.7, 219, 86, 'labels', [kit.icon('kit/Tag', half, 16), label('Labels', dark)])
  pool(445.6, 219, 133.9, 'component', [kit.icon('kit/Diamond', half, 16), label('No component', dark)])
  pool(24, 263, 63.2, 'estimation', [kit.icon('kit/CircleHalfFill', half, 16), label('0h', dark)])
  pool(95.2, 263, 105, 'milestone', [kit.icon('kit/Signpost', half, 16), label('Milestone', dark)])
  pool(208.2, 263, 104.4, 'due date', [kit.icon('kit/Calendar', dark, 16), label('Due date', dark)])
  pool(320.7, 263, 152.2, 'parent', [kit.icon('tracker/parent-issue', half, 16), label('Set parent issue…', dark)])
  // Footer
  put(kit.box('footer border', { w: 720, h: 1, fill: T('theme-button-border') }), 0, 323)
  put(kit.add(kit.box('attach', { w: 36, h: 36, dir: 'row', align: 'center', justify: 'center', radius: 6 }), kit.icon('kit/Paperclip', content, 16)), 24, 339.5)
  put(kit.add(kit.box('Create issue', { w: 95.9, h: 36, dir: 'row', pad: [0, 12, 0, 12], align: 'center', fill: T('primary-button-default') + '1F' }), kit.text('Create issue', { size: 13, color: content })), 572.1, 339.5)
  put(kit.add(kit.box('Create menu', { w: 28, h: 36, dir: 'row', align: 'center', justify: 'center', fill: T('primary-button-default') + '1F' }), kit.icon('kit/ChevronDown', content, 16)), 668, 339.5)
  return card
}
