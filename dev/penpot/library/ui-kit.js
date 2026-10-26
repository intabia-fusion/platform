// Rebuilds the "Intabia UI Kit" library: theme tokens (Mode/Light, Mode/Dark) and components
// with variants made by the kit functions. Run it with the UI Kit file connected, see docs/penpot.md.

const catalog = penpot.library.local.tokens
const step = async () => new Promise((resolve) => setTimeout(resolve, 0))

// ---- Tokens ------------------------------------------------------------------
// Updates sets in place: removing a set and re-adding one with the same name in one run fails
function syncSet (name, entries, active) {
  const set = catalog.sets.find((it) => it.name === name) ?? catalog.addSet({ name, active })
  const have = new Map(set.tokens.map((t) => [t.name, t]))
  for (const [tname, type, value] of entries) {
    const t = have.get(tname)
    if (t === undefined) set.addToken({ type, name: tname, value })
    else if (t.value !== value) t.value = value
    have.delete(tname)
  }
  for (const t of have.values()) t.remove()
  return set
}

async function syncTokens () {
  const dimType = (name) => name.startsWith('spacing-') ? 'spacing' : name.endsWith('BorderRadius') ? 'borderRadius' : name.endsWith('-Size') || name.endsWith('-width') ? 'sizing' : 'dimension'
  const core = syncSet('core', Object.entries(TOKENS.dimensions).map(([n, px]) => [n, dimType(n), String(px)]), true)
  const sets = {}
  for (const mode of ['light', 'dark']) {
    const colors = Object.entries(TOKENS.colors[mode]).map(([n, hex]) => [n, 'color', hex.toLowerCase()])
    const palette = Object.entries(TOKENS.palette[mode]).map(([n, hex]) => ['palette-' + n, 'color', hex.toLowerCase()])
    sets[mode] = syncSet('mode/' + mode, [...colors, ...palette], mode === 'light')
    await step()
  }
  for (const mode of ['light', 'dark']) {
    const name = mode === 'light' ? 'Light' : 'Dark'
    let theme = catalog.themes.find((t) => t.group === 'Mode' && t.name === name)
    if (theme === undefined) {
      theme = catalog.addTheme({ group: 'Mode', name })
      theme.addSet(core)
      theme.addSet(sets[mode])
    }
    if (mode === 'light' && !theme.active) theme.toggleActive()
  }
  kit.tokens = new Map(sets.light.tokens.map((t) => [t.name, t]))
  return { core: core.tokens.length, light: sets.light.tokens.length, dark: sets.dark.tokens.length }
}

// ---- Components ----------------------------------------------------------------
// Each group becomes a variant container; build(props) returns the main shape for one variant.
const groups = [
  { name: 'Button', cat: 'Actions', props: { Kind: ['primary', 'secondary', 'tertiary', 'ghost', 'negative', 'brand'], Size: ['large', 'medium', 'small', 'extra-small'] },
    build: (p) => kit.Button({ kind: p.Kind, size: p.Size, icon: 'plus', label: 'Button' }) },
  { name: 'IconButton', cat: 'Actions', props: { Kind: ['secondary', 'ghost', 'tertiary'], Size: ['medium', 'small', 'extra-small'] },
    build: (p) => kit.IconButton('gear', { kind: p.Kind, size: p.Size }) },
  { name: 'StatusIcon', cat: 'Status', props: { Category: ['backlog', 'todo', 'active', 'won', 'lost'] },
    build: (p) => kit.add(kit.box('s', { w: 14, h: 14, dir: 'row' }), kit.StatusIcon(p.Category)) },
  { name: 'PriorityIcon', cat: 'Status', props: { Priority: ['none', 'urgent', 'high', 'medium', 'low'] },
    build: (p) => kit.add(kit.box('p', { w: 14, h: 14, dir: 'row' }), kit.PriorityIcon(p.Priority)) },
  { name: 'Avatar', cat: 'People', props: { Size: ['20', '24', '32', '40'] }, build: (p) => kit.Avatar('АБ', 'Blueberry', Number(p.Size)) },
  { name: 'Chip', cat: 'Tags and filters', props: { Content: ['icon', 'icon+text'] },
    build: (p) => kit.Chip(p.Content === 'icon' ? [kit.icon('component', undefined, 14)] : [kit.icon('component', undefined, 14), kit.text('Component', { size: 12, color: T('theme-content-color') })]) },
  { name: 'Label', cat: 'Tags and filters', props: { Color: ['Sky', 'Houseplant', 'Orange', 'Lavander'] }, build: (p) => kit.Label('label', p.Color) },
  { name: 'StatusChip', cat: 'Status', props: { Category: ['backlog', 'todo', 'active', 'won', 'lost'], Size: ['small', 'row'] },
    build: (p) => p.Size === 'small' ? kit.StatusChip('Status', p.Category) : kit.StatusChip('Status', p.Category, { count: 12, drag: true, w: 216, h: 32, size: 13, fill: T('theme-popup-color'), stroke: T('theme-button-border') }) },
  { name: 'Checkbox', cat: 'Forms', props: { Checked: ['true', 'false'] }, build: (p) => kit.Checkbox(p.Checked === 'true', 'Checkbox') },
  { name: 'Toggle', cat: 'Forms', props: { On: ['true', 'false'] }, build: (p) => kit.Toggle(p.On === 'true', 'Toggle') },
  { name: 'Radio', cat: 'Forms', props: { Selected: ['true', 'false'] }, build: (p) => kit.Radio(p.Selected === 'true', 'Option') },
  { name: 'Input', cat: 'Forms', props: { State: ['empty', 'filled', 'error', 'select'] },
    build: (p) => kit.Input({ w: 240, placeholder: 'Placeholder', value: p.State === 'empty' ? undefined : 'Value', error: p.State === 'error', menu: p.State === 'select' }) },
  { name: 'Notice', cat: 'Status', props: { Kind: ['warning', 'info', 'negative'] }, build: (p) => kit.Notice('Notice text', p.Kind) },
  { name: 'QuickFilter', cat: 'Tags and filters', props: { On: ['false', 'true'] }, build: (p) => kit.QuickFilter('Quick filter', p.On === 'true') },
  { name: 'FilterChip', cat: 'Tags and filters', props: {}, build: () => kit.FilterChip('Attribute', 'is', 'Value') },
  { name: 'TopBar', cat: 'Workbench', props: {}, build: () => kit.TopBar(1920) },
  { name: 'AppItem', cat: 'Workbench', props: { State: ['default', 'selected', 'marker'] }, build: (p) => kit.AppItem('kit/CheckSquare', { selected: p.State === 'selected', marker: p.State === 'marker' }) },
  { name: 'AppRail', cat: 'Workbench', props: {}, build: () => kit.AppRail(1044) },
  { name: 'NavItem', cat: 'Workbench', props: { State: ['default', 'selected'], Level: ['0', '1'] }, build: (p) => kit.NavItem('Navigator item', { icon: 'tracker/issues', selected: p.State === 'selected', indent: p.Level === '1' }) },
  { name: 'NavGroupHeader', cat: 'Workbench', props: { Add: ['true', 'false'] }, build: (p) => kit.NavGroupHeader('Your projects', { add: p.Add === 'true' }) },
  { name: 'NavSpaceHeader', cat: 'Workbench', props: {}, build: () => kit.NavSpaceHeader('Default') },
  { name: 'Navigator', cat: 'Workbench', props: {}, build: () => kit.Navigator(1044, { nav: [{ item: 'My issues', icon: 'tracker/myissues' }, { item: 'All issues', icon: 'tracker/issues' }, { divider: true }, { item: 'All projects', icon: 'tracker/list' }, { group: 'Your projects', add: true }, { space: 'Default' }, { item: 'Issues', icon: 'tracker/issues', selected: true, indent: true }] }) },
  { name: 'Sidebar', cat: 'Workbench', props: {}, build: () => kit.Sidebar(1044) },
  { name: 'Switcher', cat: 'Workbench', props: { Content: ['icons', 'labels'] }, build: (p) => p.Content === 'icons' ? kit.Switcher(['tracker/list', 'task/kanban', 'tracker/estimation'], 'task/kanban') : kit.Switcher(['All', 'Active', 'Backlog'], 'All') },
  { name: 'SpaceHeader', cat: 'Workbench', props: {}, build: () => { const m = kit.box('SpaceHeader', { w: 1515, h: 113, fill: '#FFFFFF' }); penpot.root.appendChild(m); kit.SpaceHeader(m, { view: 'board', title: 'Issues' }); return m } },
  { name: 'Workbench', cat: 'Workbench', props: {}, build: () => kit.Workbench('Workbench', 0, 0, { nav: [{ item: 'My issues', icon: 'tracker/myissues' }, { item: 'All issues', icon: 'tracker/issues', selected: true }] }).frame },
  { name: 'ColumnHeader', cat: 'Tracker', props: { State: ['default', 'hover', 'over-limit'] },
    build: (p) => kit.ColumnHeader('Column', 'active', 12, 296, { tools: p.State === 'hover', limit: p.State === 'over-limit' ? 10 : undefined, over: p.State === 'over-limit' }) },
  { name: 'IssueCard', cat: 'Tracker', props: { Variant: ['full', 'minimal', 'accent'] },
    build: (p) => kit.IssueCard(p.Variant === 'minimal'
      ? { id: 'TSK-1', cat: 'todo', title: 'Issue title', priority: 'medium' }
      : { id: 'TSK-1', cat: 'active', title: 'Issue title that wraps to the second line of the card', priority: 'high', assignee: ['АБ', 'Blueberry'], sub: '2/5', due: '30 окт', component: 'Component', milestone: 'Milestone', labels: [['label', 'Sky']], est: '4h', att: 1, com: 2, accent: p.Variant === 'accent' ? TOKENS.palette.light.Orange : undefined }, 296) }
]

function combos (props) {
  return Object.entries(props).reduce((acc, [k, vals]) => acc.flatMap((a) => vals.map((v) => ({ ...a, [k]: v }))), [{}])
}

// Penpot stacks variants with a fixed 34px step whatever their width, so they are laid out here:
// rows by the first property, columns by the second, cells sized by the widest/tallest variant.
function layoutVariants (container, items, props) {
  const PAD = 24
  const GAP = 16
  const [rowKey, colKey] = Object.keys(props)
  const rows = props[rowKey]
  const cols = colKey !== undefined ? props[colKey] : [undefined]
  const cell = (r, c) => items.find((it) => it.properties[rowKey] === r && (c === undefined || it.properties[colKey] === c))
  const colW = cols.map((c) => Math.max(...rows.map((r) => cell(r, c)?.shape.width ?? 0)))
  const rowH = rows.map((r) => Math.max(...cols.map((c) => cell(r, c)?.shape.height ?? 0)))
  // One property: a single row, wrapped when it gets too wide
  if (colKey === undefined && rows.length > 1) {
    let x = PAD
    for (const it of items) {
      penpotUtils.setParentXY(it.shape, x, PAD)
      x += it.shape.width + GAP
    }
    container.resize(x - GAP + PAD, Math.max(...items.map((it) => it.shape.height)) + 2 * PAD)
    return
  }
  let y = PAD
  rows.forEach((r, ri) => {
    let x = PAD
    cols.forEach((c, ci) => {
      const it = cell(r, c)
      if (it !== undefined) penpotUtils.setParentXY(it.shape, x, y + (rowH[ri] - it.shape.height) / 2)
      x += colW[ci] + GAP
    })
    y += rowH[ri] + GAP
  })
  container.resize(PAD + colW.reduce((a, b) => a + b + GAP, 0) - GAP + PAD, y - GAP + PAD)
}

// Component categories: a canvas page each and the path that groups them in the Assets panel
const CATEGORIES = ['Workbench', 'Actions', 'Forms', 'Status', 'Tags and filters', 'People', 'Tracker']

async function buildComponents () {
  const lib = penpot.library.local
  const made = []
  for (const cat of CATEGORIES) {
    await kit.page(cat)
    let y = 0
    for (const g of groups.filter((it) => it.cat === cat)) {
      const items = []
      for (const p of combos(g.props)) {
        const shape = g.build(p)
        shape.name = g.name
        penpot.root.appendChild(shape)
        shape.x = 0
        shape.y = y
        const comp = lib.createComponent([shape])
        comp.name = g.name
        comp.path = cat
        items.push({ shape: comp.mainInstance(), properties: p })
        await step()
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
      // A variant container needs at least two components
      if (items.length === 1) {
        y += items[0].shape.height + 64
        made.push(`${cat} / ${g.name}`)
        continue
      }
      try {
        const container = penpotUtils.createVariantContainer(items)
        container.name = g.name
        container.x = 0
        container.y = y
        layoutVariants(container, items, g.props)
        for (const c of lib.components.filter((it) => it.name === g.name)) c.path = cat
        y += container.height + 64
        made.push(`${cat} / ${g.name}`)
      } catch (e) {
        made.push(`${cat} / ${g.name}: ${String(e).slice(0, 200)}`)
        y += 200
      }
    }
    await kit.settle(1500)
  }
  return made
}

const tokens = await syncTokens()
const made = await buildComponents()
// Page left from an earlier layout of this file
for (const name of ['Components', 'Navigation']) penpotUtils.getPageByName(name)?.remove()
return { tokens, components: made }
