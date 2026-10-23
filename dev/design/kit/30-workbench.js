// Workbench shell (plugins/workbench-resources Workbench.svelte). Geometry, colors and icons are
// measured on the sanity stand at 1920x1080: top bar 36, app rail 68, navigator 280, sidebar 57.

const RAIL_W = 68
const NAV_W = 280
const SIDE_W = 57

// Apps of the rail in stand order; a divider follows "love/office"
kit.RAIL_APPS = [
  { icon: 'notification/notifications', marker: true }, { icon: 'chunter/chunter', marker: true, app: 'chunter' },
  { icon: 'time/calendar' }, { icon: 'love/office', divider: true },
  { icon: 'card/card' }, { icon: 'contact/contactapplication' }, { icon: 'recruit/recruitment' },
  { icon: 'lead/leadapplication' }, { icon: 'inventory/inventory' }, { icon: 'hr/hr' },
  { icon: 'tracker/tracker', app: 'tracker' }, { icon: 'document/documentapplication' }, { icon: 'process/process' },
  { icon: 'drive/driveapplication' }, { icon: 'controlled-documents/documentapplication' },
  { icon: 'training/training-application' }, { icon: 'products/productsApplication' },
  { icon: 'test-management/testManagementApplication' }, { icon: 'survey/application' }
]

const dot = (size, color, border) => {
  const d = penpot.createEllipse()
  d.resize(size, size)
  kit.fill(d, color)
  if (border) kit.stroke(d, border, 2)
  return d
}

// App button of the rail (AppItem.svelte): 36x36, icon 20, red marker for unread
kit.AppItem = (icon, o = {}) => {
  const b = kit.box('AppItem ' + icon, { w: 36, h: 36, radius: 4, fill: o.selected ? T('theme-button-pressed') : null, stroke: o.selected ? T('theme-button-border') : null, clip: false })
  kit.at(b, kit.icon(icon, o.selected ? T('theme-caption-color') : T('theme-navpanel-icons-color'), 20), 8, 8)
  if (o.marker) kit.at(b, dot(7, T('bg-negative-default')), 22, 19)
  return b
}

// Status bar: open tab on the left, workspace tools and clock on the right
kit.TopBar = (w, o = {}) => {
  const bar = kit.box('Top bar', { w, h: 36, fill: T('theme-statusbar-color') })
  const tab = kit.box('tab', { w: 83, h: 28, dir: 'row', gap: 8, pad: [0, 8, 0, 8], align: 'center', hs: 'auto', radius: 4, fill: T('highlight-select'), stroke: T('highlight-select-border') })
  kit.add(tab, kit.icon(o.tabIcon || 'tracker/tracker', T('theme-content-color'), 12), kit.text(o.tab || 'Tracker', { size: 12, weight: 500, lh: 1.5, color: T('theme-content-color') }))
  kit.at(bar, tab, 8, 4)
  kit.at(bar, kit.add(kit.box('new tab', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: 4 }), kit.icon('ui/Add', T('button-tertiary-IconColor'))), 99, 6)
  const R = (x) => w - (1920 - x)
  const limits = kit.box('limits', { w: 28, h: 18, radius: 4, stroke: T('theme-trans-color') })
  kit.at(limits, kit.box('bar', { w: 20, h: 4, radius: 2, fill: T('trans-content-10') }), 4, 4)
  kit.at(limits, kit.box('bar', { w: 20, h: 4, radius: 2, fill: T('trans-content-10') }), 4, 10)
  kit.at(bar, limits, R(1585), 9)
  kit.at(bar, kit.icon('ui/Search', T('theme-dark-color')), R(1629), 10)
  kit.at(bar, kit.icon('media/CamOn', T('theme-dark-color')), R(1659), 10)
  kit.at(bar, kit.icon('recorder/RecordOn', T('theme-content-color')), R(1687), 10)
  kit.at(bar, kit.icon('recorder/Rec', T('theme-content-color'), 22), R(1703), 13)
  kit.at(bar, kit.text(o.city || 'Novosibirsk', { size: 13, color: T('theme-content-color') }), R(1743), 9)
  kit.at(bar, kit.text(o.time || '16:56', { size: 13, color: T('theme-content-color') }), R(1817), 9)
  kit.at(bar, kit.icon('love/BadConnection', T('global-online-color')), R(1868), 10)
  kit.at(bar, kit.icon('ui-internal/Settings', T('theme-dark-color')), R(1898), 10)
  return bar
}

// App rail: workspace logo, menu, apps (40 apart), account avatar at the bottom
kit.AppRail = (h, o = {}) => {
  const rail = kit.box('App rail', { w: RAIL_W, h, fill: T('theme-navpanel-color') })
  rail.borderRadiusTopLeft = 8
  rail.borderRadiusBottomLeft = 8
  const logo = kit.box('workspace', { w: 32, h: 32, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: o.logoColor || '#F6694D' })
  kit.at(rail, kit.add(logo, kit.text(o.workspace || 'S', { size: 14, weight: 500, color: '#FFFFFF' })), 18, 20)
  kit.at(rail, dot(8, T('bg-negative-default')), 48, 12)
  kit.at(rail, kit.add(kit.box('menu', { w: 32, h: 32, dir: 'row', align: 'center', justify: 'center', radius: 4 }), kit.icon('workbench/TopMenu', T('theme-navpanel-icons-color'), 20)), 18, 56)
  let y = 104
  // Measured on the stand: the first app sits 44 below the next, the divider is 8 under the group, the next group 21 below it
  let first = true
  for (const app of (o.apps || kit.RAIL_APPS)) {
    kit.at(rail, kit.AppItem(app.icon, { selected: app.app !== undefined && app.app === (o.app || 'tracker'), marker: app.marker }), 16, y)
    y += first ? 44 : 40
    first = false
    if (app.divider) {
      kit.at(rail, kit.box('divider', { w: 36, h: 1, fill: T('theme-navpanel-divider') }), 16, y + 8)
      y += 21
    }
  }
  kit.at(rail, kit.box('divider', { w: 32, h: 1, fill: T('theme-navpanel-divider') }), 18, h - 77)
  const av = kit.Avatar(o.account || 'AJ', 'Blueberry', 32)
  kit.fill(av, o.accountColor || '#666ECC')
  kit.at(rail, av, 18, h - 48)
  kit.at(rail, dot(10, T('global-online-color'), '#FFFFFF'), 42, h - 24)
  return rail
}

// Navigator row (hulyNavItem): icon 16 and label 14, selected in the accent color
kit.NavItem = (label, o = {}) => {
  const sel = o.selected
  const indent = o.indent ? 22 : 0
  const it = kit.box('NavItem/' + label, { w: o.w || 255, h: 32, dir: 'row', gap: o.object ? 6 : 8, pad: o.object ? [0, 4, 0, 4] : [0, 8, 0, 10 + indent], align: 'center', radius: 6, fill: sel ? T('global-ui-highlight-BackgroundColor') : null })
  const color = sel ? T('global-accent-TextColor') : T('global-primary-TextColor')
  // An object entry (channel) keeps its icon on a 24 px tile
  if (o.icon && o.object) kit.add(it, kit.add(kit.box('tile', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: T('global-ui-BackgroundColor') }), kit.icon(o.icon, color)))
  else if (o.icon) kit.add(it, kit.icon(o.icon, color))
  kit.add(it, kit.text(label, { size: 14, color }))
  if (o.count !== undefined) {
    const sp = kit.box('grow', { w: 1, h: 1 }); kit.add(it, sp); sp.layoutChild.horizontalSizing = 'fill'
    kit.add(it, kit.text(String(o.count), { size: 12, color: T('global-tertiary-TextColor') }))
  }
  return it
}

// Group header of the navigator (hulyNavGroup): chevron, label pill, optional "+" button
kit.NavGroupHeader = (label, o = {}) => {
  const h = kit.box('NavGroup ' + label, { w: 279, h: 42, pad: [0, 0, 0, 0] })
  kit.at(h, kit.add(kit.box('chevron', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4 }), kit.icon('ui/Down', T('global-tertiary-TextColor'))), 18, 11)
  const pill = kit.box('label', { w: 10, h: 20, dir: 'row', pad: [0, 4, 0, 4], align: 'center', hs: 'auto', radius: 4, fill: T('global-ui-BackgroundColor') })
  kit.at(h, kit.add(pill, kit.text(label, { size: 12, weight: 500, lh: 1.33, upper: true, color: T('global-secondary-TextColor') })), 40, 11)
  if (o.add) kit.at(h, kit.add(kit.box('add', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: 4 }), kit.icon('ui/Add', T('button-tertiary-IconColor'))), 237, 9)
  return h
}

// Space (project) header inside a navigator group: icon box, uppercase name, "..." button
kit.NavSpaceHeader = (name, o = {}) => {
  const h = kit.box('NavSpace ' + name, { w: 279, h: 32 })
  const pill = kit.box('label', { w: 10, h: 24, dir: 'row', gap: 6, pad: [0, 6, 0, 0], align: 'center', hs: 'auto', radius: 4, fill: T('global-ui-BackgroundColor') })
  const ib = kit.box('icon', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: T('theme-button-focused'), stroke: T('global-ui-BackgroundColor') })
  kit.add(ib, kit.icon(o.icon || 'tracker/home', P(o.color || 'Porpoise')))
  kit.at(h, kit.add(pill, ib, kit.text(name, { size: 12, weight: 500, lh: 1.33, upper: true, color: T('global-secondary-TextColor') })), 16, 4)
  kit.at(h, kit.add(kit.box('more', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: 4 }), kit.icon('ui/MoreH', T('button-tertiary-IconColor'))), 237, 4)
  return h
}

// Caption of a navigator section (hulyNavGroup noIcon): uppercase label, a pill when highlighted; o.menu adds a dropdown arrow
kit.NavCaption = (label, highlighted, o = {}) => {
  const pill = kit.box('NavCaption ' + label, { w: 10, h: 20, dir: 'row', gap: 4, pad: [0, 4, 0, 4], align: 'center', hs: 'auto', radius: 4, fill: highlighted ? T('global-ui-BackgroundColor') : null })
  const c = highlighted ? T('global-secondary-TextColor') : T('global-tertiary-TextColor')
  kit.add(pill, kit.text(label, { size: 12, weight: 500, lh: 1.33, upper: true, color: c }))
  if (o.menu) kit.add(pill, kit.icon('ui/Down', c, 14))
  return pill
}

// Navigator panel. o.nav items: { item, icon, selected, indent, count } | { divider } |
// { group, add } | { caption, chevron, menu } | { space, icon, color }; o.footer: [{ item, icon }] under the footer line;
// o.tools: icon names of the buttons right of the title
kit.Navigator = (h, o = {}) => {
  const nav = kit.box('Navigator', { w: NAV_W, h, fill: T('theme-navpanel-color') })
  kit.at(nav, kit.box('border', { w: 1, h, fill: T('theme-divider-color') }), 0, 0)
  kit.at(nav, kit.text(o.title || 'Tracker', { size: 20, weight: 700, lh: 1.2, color: T('global-primary-TextColor') }), 21, o.tools ? 16 : 22)
  // Icon buttons at the right of a 56 px title row (the first is a ghost button)
  const tools = o.tools || []
  for (const [i, icon] of tools.entries()) kit.at(nav, kit.Button({ kind: i === 0 ? 'ghost' : 'tertiary', size: 'small', icon }), NAV_W - 12 - 32 * (tools.length - i) - 4 * (tools.length - 1 - i), 12)
  if (o.newLabel !== null) {
    const main = kit.box('New', { w: 227, h: 32, dir: 'row', gap: 6, pad: [0, 12, 0, 12], align: 'center', fill: T('primary-button-default') })
    main.borderRadiusTopLeft = 4
    main.borderRadiusBottomLeft = 4
    kit.add(main, kit.icon('ui/Add', '#FFFFFF'), kit.text(o.newLabel || 'New issue', { size: 13, color: '#FFFFFF' }))
    kit.at(nav, main, 13, 68)
    const drop = kit.box('New menu', { w: 28, h: 32, dir: 'row', align: 'center', justify: 'center', fill: T('primary-button-default') })
    drop.borderRadiusTopRight = 4
    drop.borderRadiusBottomRight = 4
    kit.at(nav, kit.add(drop, kit.icon('ui/Dropdown', '#FFFFFF')), 240, 68)
    kit.at(nav, kit.box('divider', { w: 1, h: 20, fill: '#FFFFFF' }), 239, 74)
  }
  let y = o.tools ? 56 : o.newLabel === null ? 68 : 112
  let prev
  const list = o.nav || []
  let compact = false
  for (const [i, n] of list.entries()) {
    // A compact section keeps 4 px free space under its items
    if (compact && !n.item) { y += 4; compact = false }
    if (n.divider || n.group || (n.caption && !n.noDivider)) y += 12
    if (n.caption) {
      if (!n.noDivider) kit.at(nav, kit.box('divider', { w: NAV_W - 1, h: 1, fill: T('theme-navpanel-divider') }), 1, y)
      // The caption is highlighted when one of its items is selected
      const own = list.slice(i + 1).findIndex((it) => !it.item)
      const hl = list.slice(i + 1, own < 0 ? undefined : i + 1 + own).some((it) => it.selected)
      if (n.chevron) kit.at(nav, kit.add(kit.box('chevron', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4 }), kit.icon('ui/Down', T('global-tertiary-TextColor'))), 18, y + (n.noDivider ? 10 : 11))
      kit.at(nav, kit.NavCaption(n.caption, hl, n), n.chevron ? 40 : 16, y + (n.noDivider ? 10 : 11))
      y += n.noDivider ? 40 : 41
      compact = !!n.compact && !!list[i + 1] && !!list[i + 1].item
    } else if (n.divider) {
      kit.at(nav, kit.box('divider', { w: NAV_W - 1, h: 1, fill: T('theme-navpanel-divider') }), 1, y)
      y += n.tight ? 9 : 13
    } else if (n.group) {
      kit.at(nav, kit.box('divider', { w: NAV_W - 1, h: 1, fill: T('theme-navpanel-divider') }), 1, y)
      kit.at(nav, kit.NavGroupHeader(n.group, n), 0, y)
      y += 49
    } else if (n.space) {
      kit.at(nav, kit.NavSpaceHeader(n.space, n), 0, y - 4)
      y += 32
    } else {
      kit.at(nav, kit.NavItem(n.item, n), 13, y)
      y += 32
    }
    prev = n
  }
  if (compact) y += 4
  if (o.footer) {
    // The line follows the entries (12 px section margin), the footer items sit at the bottom
    kit.at(nav, kit.box('footer line', { w: NAV_W - 1, h: 1, fill: T('theme-navpanel-divider') }), 1, Math.min(y + 12, h - 133))
    o.footer.forEach((n, i) => kit.at(nav, kit.NavItem(n.item, n), 13, h - 115 + i * 32))
  } else if (prev !== undefined) kit.at(nav, kit.box('footer line', { w: NAV_W - 1, h: 1, fill: T('theme-navpanel-divider') }), 1, y + 8)
  return nav
}

// Right sidebar (mini): widget buttons 28x28, 44 apart; o.selected marks the open widget
kit.Sidebar = (h, o = {}) => {
  const side = kit.box('Sidebar', { w: SIDE_W, h, fill: T('theme-navpanel-color') })
  side.borderRadiusTopRight = 8
  side.borderRadiusBottomRight = 8
  let y = 16
  for (const i of (o.widgets || ['calendar/calendar', 'love/office', 'rating/rating', 'view/ai-star'])) {
    const on = i === o.selected
    kit.at(side, kit.add(kit.box('widget ' + i, { w: 28, h: 28, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: on ? T('theme-button-pressed') : null }), kit.icon(i, on ? T('theme-caption-color') : T('theme-navpanel-icons-color'))), 14, y)
    y += 44
  }
  return side
}

// Frame of one workbench element on the page canvas, like the shell but without the rest
kit.Frame = (name, x, y, w, h, o = {}) => {
  const f = kit.box(name, { w, h, fill: o.fill || T('theme-panel-color') })
  f.x = x
  f.y = y
  penpot.root.appendChild(f)
  return f
}

// Shell frame; returns { frame, main, panel } with main = the white content panel.
// o: w h tab tabIcon app title newLabel nav[] (or legacy navItems/sections); panel = { w } opens a
// right panel (chat) next to main, the sidebar widget o.selected is its button
kit.Workbench = (name, x, y, o = {}) => {
  const W = o.w || 1920
  const H = o.h || 1080
  const f = kit.box(name, { w: W, h: H, fill: T('theme-panel-color') })
  f.x = x
  f.y = y
  penpot.root.appendChild(f)
  kit.at(f, kit.TopBar(W, o), 0, 0)
  kit.at(f, kit.box('inner', { w: W - RAIL_W - SIDE_W, h: H - 36, fill: T('theme-navpanel-color') }), RAIL_W, 36)
  kit.at(f, kit.AppRail(H - 36, o), 0, 36)
  let nav = o.nav
  if (nav === undefined) {
    nav = (o.navItems || []).map((it) => ({ item: it.label, ...it }))
    for (const s of (o.sections || [])) {
      nav.push(s.title ? { group: s.title, add: true } : { divider: true })
      for (const it of s.items) nav.push({ item: it.label, ...it, indent: it.indent !== undefined && it.indent > 0 })
    }
  }
  kit.at(f, kit.Navigator(H - 36, { ...o, nav }), RAIL_W, 36)
  const pw = o.panel ? o.panel.w : 0
  const mw = W - RAIL_W - NAV_W - SIDE_W - pw
  const main = kit.box('Main panel', { w: mw, h: H - 36, fill: T('theme-panel-color'), stroke: T('theme-divider-color'), radius: 8 })
  kit.at(f, main, RAIL_W + NAV_W, 36)
  let panel
  // As in the product sidebar: flush with the content panel, square, a divider only before the widget bar
  if (pw > 0) {
    panel = kit.box('Side panel', { w: pw, h: H - 36, fill: T('theme-panel-color') })
    kit.at(f, panel, W - SIDE_W - pw, 36)
    kit.at(f, kit.box('Side panel divider', { w: 1, h: H - 36, fill: T('theme-divider-color') }), W - SIDE_W - 1, 36)
  }
  kit.at(f, kit.Sidebar(H - 36, o), W - SIDE_W, 36)
  return { frame: f, main, panel }
}

// Segmented switcher (packages/ui Switcher, kind subtle): icons or labels
kit.Switcher = (items, selected, o = {}) => {
  const s = kit.box(o.name || 'Switcher', { w: 10, h: 32, dir: 'row', gap: 4, align: 'center', hs: 'auto', radius: 6, fill: T('theme-button-hovered') })
  for (const it of items) {
    const sel = it === selected
    const icon = it.includes('/')
    const b = kit.box('element ' + it, { w: 32, h: 32, dir: 'row', pad: [0, icon ? 0 : 12, 0, icon ? 0 : 12], align: 'center', justify: 'center', hs: icon ? 'fix' : 'auto', radius: 6, fill: sel ? T('global-ui-active-BackgroundColor') : null })
    kit.add(b, icon ? kit.icon(it, sel ? T('global-primary-TextColor') : T('content-color')) : kit.text(it, { size: 14, color: sel ? T('global-primary-TextColor') : T('global-secondary-TextColor') }))
    kit.add(s, b)
  }
  return s
}

// Header of a space view (view-resources SpaceHeader, hulyHeader doubleRow); returns content top.
// o: view (list|board) title titleIcon titleNode actions[] filters[] tabs[] tab
kit.SpaceHeader = (main, o = {}) => {
  const w = main.width
  const secondary = (icon) => kit.add(kit.box('button ' + icon, { w: 32, h: 32, dir: 'row', align: 'center', justify: 'center', radius: 6, fill: T('button-secondary-BackgroundColor'), stroke: T('button-secondary-BorderColor') }), kit.icon(icon, T('theme-caption-color')))
  const row = kit.box('Header row', { w: w - 34, h: 32, dir: 'row', gap: 4, align: 'center', justify: 'space-between' })
  const l = kit.row('left', 4)
  kit.add(l, kit.Switcher(['tracker/list', 'task/kanban', 'tracker/estimation'], o.view === 'list' ? 'tracker/list' : 'task/kanban', { name: 'ViewletSelector' }), secondary('ui/Options'), secondary('view/configure'))
  if (o.titleNode) kit.add(l, kit.spacer(12, 1), o.titleNode)
  else {
    const crumb = kit.row('Breadcrumb', 6)
    const av = kit.box('avatar', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: T('global-ui-BackgroundColor') })
    kit.add(crumb, kit.add(av, kit.icon(o.titleIcon || 'tracker/issues', T('global-secondary-TextColor'))), kit.text(o.title || '', { size: 16, weight: 700, color: T('global-secondary-TextColor') }))
    kit.add(l, kit.spacer(12, 1), crumb)
  }
  const r = kit.row('right', 8)
  kit.add(r, o.actions || [], secondary('ui/MoreH'))
  kit.add(row, l, r)
  kit.at(main, row, 17, 12)
  kit.at(main, kit.box('divider', { w: w - 34, h: 1, fill: T('theme-divider-color') }), 17, 56)
  const row2 = kit.box('Filter row', { w: w - 34, h: 32, dir: 'row', gap: 8, align: 'center', justify: 'space-between' })
  const l2 = kit.row('left', 8)
  const filter = kit.box('Filter', { w: 78, h: 32, dir: 'row', gap: 6, pad: [0, 12, 0, 12], align: 'center', hs: 'auto', radius: 6, fill: T('theme-button-default'), stroke: T('theme-button-border') })
  kit.add(filter, kit.icon('ui/Filter', T('theme-content-color')), kit.text('Filter', { size: 13, color: T('theme-content-color') }))
  const search = kit.box('Search', { w: 32, h: 32, dir: 'row', align: 'center', justify: 'center', radius: 6, fill: T('theme-button-default'), stroke: T('theme-button-border') })
  kit.add(l2, filter, kit.add(search, kit.icon('ui/Search', T('global-primary-TextColor'))), o.filters || [])
  // tabs: [] drops the mode switcher
  kit.add(row2, l2, (o.tabs || ['All', 'Active', 'Backlog']).length > 0 ? kit.Switcher(o.tabs || ['All', 'Active', 'Backlog'], o.tab || 'All', { name: 'Mode tabs' }) : [])
  kit.at(main, row2, 17, 68)
  kit.at(main, kit.box('divider', { w: w - 2, h: 1, fill: T('theme-divider-color') }), 1, 112)
  return 113
}

// Quick filter pill shown in the filter row
kit.QuickFilter = (label, on) => {
  const b = kit.box('QuickFilter/' + label, { w: 10, h: 28, dir: 'row', pad: [0, 10, 0, 10], align: 'center', hs: 'auto', radius: 14, stroke: on ? T('primary-button-default') : T('theme-button-border'), fill: on ? T('accent-color-light') : null })
  return kit.add(b, kit.text(label, { size: 13, color: on ? T('primary-button-default') : T('theme-content-color') }))
}
