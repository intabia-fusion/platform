// Settings layout inside the main panel: header with back link, vertical tabs, content column.

// o: back title tabs[] tab actions[] close (X button at the right); subtabs[] subtab subLead (a second level of
// tabs above the content); returns content board (flex column) to fill
kit.SettingsLayout = (main, o = {}) => {
  const w = main.width
  const head = kit.box('Settings header', { w, h: 56, dir: 'row', pad: [0, 16, 0, 16], align: 'center', justify: 'space-between' })
  const l = kit.row('left', 8)
  if (o.back) kit.add(l, kit.Button({ kind: 'ghost', size: 'small', icon: 'chevronL', label: o.back }), kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') }))
  kit.add(l, kit.text(o.title || '', { size: 16, weight: 600 }))
  kit.add(head, l, kit.add(kit.row('right', 8), o.actions || [], o.close ? kit.IconButton('x', { kind: 'ghost', size: 'small', name: 'Close settings' }) : []))
  kit.at(main, head, 0, 0)
  kit.at(main, kit.divider(w), 0, 56)
  const tabs = kit.box('Settings tabs', { w: 232, h: main.height - 57, dir: 'column', gap: 2, pad: [16, 12, 0, 12] })
  for (const t of o.tabs || []) {
    const [label, icon] = Array.isArray(t) ? t : [t]
    kit.add(tabs, kit.NavItem(label, { icon, selected: label === o.tab, w: 208 }))
  }
  kit.at(main, tabs, 0, 57)
  kit.at(main, kit.box('divider', { w: 1, h: main.height - 57, fill: T('theme-divider-color') }), 232, 57)
  let top = 57
  if (o.subtabs) {
    const row = kit.box('Settings subtabs', { w: w - 233, h: 48, dir: 'row', gap: 12, pad: [0, 32, 0, 32], align: 'center' })
    if (o.subLead) kit.add(row, o.subLead, kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') }))
    kit.add(row, kit.Switcher(o.subtabs, o.subtab, { name: 'Settings subtabs switcher' }))
    kit.at(main, row, 233, top)
    kit.at(main, kit.box('divider', { w: w - 233, h: 1, fill: T('theme-divider-color') }), 233, top + 48)
    top += 49
  }
  const content = kit.box('Settings content', { w: w - 233, h: main.height - top, dir: 'column', gap: 16, pad: [24, 32, 24, 32] })
  kit.at(main, content, 233, top)
  return content
}

kit.SectionTitle = (title, hint, w) => {
  const c = kit.col('Section ' + title, 4)
  kit.add(c, kit.text(title, { size: 16, weight: 600 }))
  if (hint) kit.add(c, kit.text(hint, { size: 13, color: T('theme-dark-color'), w }))
  return c
}

// Label on the left, control on the right
kit.FormRow = (label, control, o = {}) => {
  const r = kit.box('Row ' + label, { w: o.w || 720, h: 32, dir: 'row', gap: 16, align: o.alignTop ? 'start' : 'center', vs: 'auto' })
  const lc = kit.col('label', 2)
  kit.add(lc, kit.text(label, { size: 14, color: T('theme-content-color'), w: o.labelW || 220 }))
  if (o.hint) kit.add(lc, kit.text(o.hint, { size: 12, color: T('theme-darker-color'), w: o.labelW || 220 }))
  return kit.add(r, lc, control)
}

// Filter condition chip as in FilterBar: attribute / operator / value / remove
kit.FilterChip = (attr, op, value) => {
  const b = kit.box('FilterChip/' + attr, { w: 10, h: 28, dir: 'row', align: 'center', hs: 'auto', radius: 6, stroke: T('theme-button-border') })
  const part = (t, c, last) => {
    const p = kit.box('part', { w: 10, h: 28, dir: 'row', pad: [0, 8, 0, 8], align: 'center', hs: 'auto', fill: T('theme-button-default') })
    if (!last) kit.stroke(p, T('theme-divider-color'))
    return kit.add(p, kit.text(t, { size: 13, color: c }))
  }
  kit.add(b, part(attr, T('theme-caption-color')), part(op, T('theme-dark-color')), part(value, T('theme-caption-color')))
  const x = kit.box('remove', { w: 26, h: 28, dir: 'row', align: 'center', justify: 'center' })
  return kit.add(b, kit.add(x, kit.icon('x', T('theme-darker-color'), 12)))
}

// Simple table: cols[{title, w}], rows[[node|string ...]]
kit.Table = (cols, rows, o = {}) => {
  const w = cols.reduce((s, c) => s + c.w, 0)
  const t = kit.box(o.name || 'Table', { w, h: 10, dir: 'column', vs: 'auto', radius: 8, stroke: T('theme-divider-color') })
  const head = kit.box('head', { w, h: 36, dir: 'row', align: 'center', fill: T('theme-list-row-color') })
  for (const c of cols) {
    const cell = kit.box('th', { w: c.w, h: 36, dir: 'row', pad: [0, 12, 0, 12], align: 'center' })
    kit.add(head, kit.add(cell, kit.text(c.title, { size: 12, weight: 500, color: T('theme-dark-color') })))
  }
  kit.add(t, head)
  for (const r of rows) {
    kit.add(t, kit.divider(w))
    const row = kit.box('row', { w, h: 44, dir: 'row', align: 'center', vs: 'auto' })
    r.forEach((v, i) => {
      const cell = kit.box('td', { w: cols[i].w, h: 44, dir: 'row', gap: 6, pad: [6, 12, 6, 12], align: 'center', wrap: true, vs: 'auto' })
      kit.add(row, kit.add(cell, typeof v === 'string' ? kit.text(v, { size: 14 }) : v))
    })
    kit.add(t, row)
  }
  return t
}

kit.Radio = (on, label, hint) => {
  const r = kit.box('Radio ' + label, { w: 10, h: 20, dir: 'row', gap: 8, align: 'start', hs: 'auto', vs: 'auto' })
  const dot = kit.box('dot', { w: 16, h: 16, dir: 'row', align: 'center', justify: 'center', radius: 8, stroke: on ? T('primary-button-default') : T('theme-button-border'), strokeW: on ? 5 : 1 })
  const c = kit.col('text', 2)
  kit.add(c, kit.text(label, { size: 14 }))
  if (hint) kit.add(c, kit.text(hint, { size: 12, color: T('theme-darker-color') }))
  return kit.add(r, dot, c)
}

kit.Swatch = (color, size = 20) => kit.box('Swatch', { w: size, h: size, radius: 4, fill: color, stroke: T('theme-button-border') })

// Header of a content panel (hulyHeader with a large breadcrumb); returns the content top.
// o: title icon actions[] divided (a divider before the actions)
kit.PanelHeader = (main, o = {}) => {
  const w = main.width
  const head = kit.box('Panel header', { w, h: 56, dir: 'row', pad: [0, 16, 0, 16], align: 'center', justify: 'space-between' })
  const crumb = kit.box('Breadcrumb', { w: 10, h: 29, dir: 'row', gap: 6, pad: [0, 8, 0, 8], align: 'center', hs: 'auto' })
  if (o.icon) {
    const av = kit.box('avatar', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: T('global-ui-BackgroundColor') })
    kit.add(crumb, kit.add(av, kit.icon(o.icon, T('global-secondary-TextColor'))))
  }
  kit.add(crumb, kit.text(o.title || '', { size: 16, weight: 700, lh: 1.3125, color: T('global-secondary-TextColor') }))
  const actions = kit.add(kit.row('actions', 8), o.actions || [])
  // The divider keeps 16 px on both sides
  kit.add(head, crumb, o.divided ? kit.add(kit.row('right', 16), kit.box('divider', { w: 1, h: 32, fill: T('theme-divider-color') }), actions) : actions)
  kit.at(main, head, 0, 0)
  kit.at(main, kit.divider(w), 0, 56)
  return 57
}

// Button of settings and form pages (antiButton): kind regular | primary | dangerous | ghost | icon, size small 28 | medium 32 | large 36.
// o: kind size icon iconSize label disabled menu content (nodes instead of icon and label)
kit.ClassicButton = (o = {}) => {
  const kind = o.kind || 'regular'
  const size = o.size || 'medium'
  const H = { small: 28, medium: 32, large: 36 }[size]
  const K = {
    regular: { bg: T('theme-button-default'), border: T('theme-button-border'), label: T('theme-content-color'), icon: T('theme-dark-color') },
    primary: o.disabled ? { bg: T('primary-button-disabled'), border: null, label: T('primary-button-disabled-color'), icon: T('primary-button-disabled-color') } : { bg: T('primary-button-default'), border: T('primary-button-border'), label: '#FFFFFF', icon: '#FFFFFF' },
    dangerous: { bg: T('dangerous-bg-color'), border: T('dangerous-bg-color'), label: '#FFFFFF', icon: '#FFFFFF' },
    ghost: { bg: null, border: null, label: T('theme-content-color'), icon: T('theme-content-color') },
    icon: { bg: null, border: null, label: T('theme-content-color'), icon: T('theme-dark-color') }
  }[kind]
  // antiButton:disabled: border off, label and icon at theme-darker-color; regular also gets the disabled fill
  if (o.disabled && kind !== 'primary') Object.assign(K, { border: null, label: T('theme-darker-color'), icon: T('theme-darker-color') }, kind === 'regular' ? { bg: T('theme-button-disabled') } : {})
  const iconOnly = !o.label && !o.content
  const b = kit.box(o.name || `ClassicButton/${kind}/${size}`, { w: H, h: H, dir: 'row', gap: o.menu ? 8 : 6, pad: [0, iconOnly ? 0 : 12, 0, iconOnly ? 0 : 12], align: 'center', justify: 'center', hs: iconOnly ? 'fix' : 'auto', radius: 6, fill: K.bg, stroke: K.border })
  if (o.content) kit.add(b, o.content)
  if (o.icon) kit.add(b, kit.icon(o.icon, K.icon, o.iconSize || 16))
  if (o.label) kit.add(b, kit.text(o.label, { size: 13, lh: 1.3125, color: K.label }))
  if (o.menu) kit.add(b, kit.icon('ui/Down', K.icon, 16))
  return b
}

// Property row of a form (antiGrid-row): 240 px label column with an optional hint, control on the right.
// o: w hint alignTop padded (12 px cell padding, for inputs) last (no gap under the row)
kit.GridRow = (label, control, o = {}) => {
  const r = kit.box('Row ' + label, { w: o.w || 550, h: 10, dir: 'row', pad: [0, 0, o.last ? 0 : 8, 0], align: o.alignTop ? 'start' : 'center', vs: 'auto' })
  const head = kit.box('label', { w: 240, h: 10, dir: 'column', pad: o.alignTop ? [12, 16, 0, 0] : [4, 16, 4, 0], vs: 'auto' })
  kit.add(head, kit.text(label, { size: 14, lh: 1.3125, color: T('theme-caption-color'), w: 224 }))
  if (o.hint) kit.add(head, kit.text(o.hint, { size: 12, lh: 1.3125, color: T('theme-halfcontent-color'), w: 224 }))
  const pad = o.padded ? 12 : 4
  const cell = kit.box('control', { w: (o.w || 550) - 240, h: 10, dir: 'row', pad: [pad, 0, pad, 0], align: 'center', hs: o.padded ? 'fix' : 'auto', vs: 'auto' })
  return kit.add(r, head, kit.add(cell, control))
}

// Borderless input of the settings pages and forms (EditBox). o: kind ghost-large (bordered title, 16/500) |
// large-style (20 px) | editbox (14 px), w
kit.EditBox = (value, o = {}) => {
  const kind = o.kind || 'ghost-large'
  const ghost = kind === 'ghost-large'
  const size = ghost ? 16 : kind === 'large-style' ? 20 : 14
  const b = kit.box('EditBox', { w: o.w || 256, h: ghost ? 36 : size === 20 ? 26 : 19, dir: 'row', pad: [0, ghost ? 8 : 0, 0, ghost ? 8 : 0], align: 'center', radius: 6, stroke: ghost ? T('theme-divider-color') : null })
  return kit.add(b, kit.text(value, { size, weight: ghost ? 500 : 400, lh: 1.3125, color: T('theme-caption-color') }))
}

// Popup dialog (hulyModal type-popup): header with title and close, body, footer with Cancel / Save.
// Returns { modal, body }: add the content to body, place modal with kit.at. o: w okLabel
kit.Modal = (title, o = {}) => {
  const w = o.w || 600
  const modal = kit.box('Modal ' + title, { w, h: 10, dir: 'column', pad: [1, 1, 1, 1], vs: 'auto', radius: 16, fill: T('theme-panel-color'), stroke: T('theme-button-border') })
  modal.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 24, blur: 24, spread: 4, color: { color: '#0E131E', opacity: 0.12 } }]
  const head = kit.box('header', { w: w - 2, h: 56, dir: 'row', pad: [0, 16, 0, 16], align: 'center', justify: 'space-between' })
  kit.add(head, kit.text(title, { size: 12, weight: 500, lh: 1.33, upper: true, color: T('global-secondary-TextColor') }), kit.IconButton('x', { kind: 'tertiary', size: 'small', name: 'Close' }))
  const body = kit.box('body', { w: w - 2, h: 10, dir: 'column', pad: [16, 24, 32, 24], vs: 'auto' })
  const foot = kit.box('footer', { w: w - 2, h: 64, dir: 'row', gap: 8, pad: [12, 12, 12, 12], align: 'center', justify: 'end' })
  kit.add(foot, kit.Button({ kind: 'secondary', size: 'medium', label: 'Cancel' }), kit.Button({ kind: 'primary', size: 'medium', label: o.okLabel || 'Save' }))
  kit.add(modal, head, kit.divider(w - 2), body, kit.divider(w - 2), foot)
  return { modal, body }
}
