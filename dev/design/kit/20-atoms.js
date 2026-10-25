// Atoms. Names, kinds and sizes follow @hcengineering/ui/kit (docs/ui-components/ui-kit.md).

// Palette colors carry the pen variable name (pal-, palbg-, palt-) like T() does for theme colors
const palToken = (v, token) => {
  const s = new String(v) // eslint-disable-line no-new-wrappers
  s.token = token
  return s
}
const P = (name) => palToken(TOKENS.palette[kit.mode][name], 'pal-' + name)
const PB = (name) => palToken(TOKENS.paletteBackground[kit.mode][name], 'palbg-' + name)
const PT = (name) => palToken(TOKENS.paletteTitle[kit.mode][name], 'palt-' + name)

// color-mix(in srgb, c pct%, c2 | transparent) of the ui/kit styles as a token of its own:
// registered in TOKENS for both themes, so pen binds a variable and the dark theme follows
const TM = (c, pct, c2) => {
  const name = `${c.token}-${pct}-${c2 === undefined ? 'clear' : c2.token}`
  const valueOf = (t, mode) => (t.startsWith('pal-') ? TOKENS.palette[mode][t.slice(4)] : TOKENS.colors[mode][t] ?? TOKENS.colors.light[t])
  const rgba = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 9 ? parseInt(h.slice(7), 16) / 255 : 1)
  for (const mode of ['light', 'dark']) {
    if (TOKENS.colors[mode][name] !== undefined) continue
    const a = rgba(valueOf(c.token, mode))
    const b = c2 === undefined ? [0, 0, 0, 0] : rgba(valueOf(c2.token, mode))
    const p = pct / 100
    const alpha = a[3] * p + b[3] * (1 - p)
    const hex = (v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()
    const ch = (i) => hex((a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / alpha)
    TOKENS.colors[mode][name] = '#' + ch(0) + ch(1) + ch(2) + (alpha < 1 ? hex(alpha * 255) : '')
  }
  return T(name)
}

// Button: kind primary|secondary|tertiary|ghost|negative, size large|medium|small|extra-small
kit.Button = (o = {}) => {
  const kind = o.kind || 'secondary'
  const size = o.size || 'medium'
  const K = {
    primary: { bg: T('button-primary-BackgroundColor'), border: T('button-primary-BorderColor'), label: T('button-accent-LabelColor'), icon: T('button-accent-IconColor') },
    secondary: { bg: T('button-secondary-BackgroundColor'), border: T('button-secondary-BorderColor'), label: T('button-subtle-LabelColor'), icon: T('button-subtle-IconColor') },
    tertiary: { bg: null, border: null, label: T('button-tertiary-LabelColor'), icon: T('button-tertiary-icon-IconColor') },
    ghost: { bg: null, border: null, label: T('global-primary-TextColor'), icon: T('global-secondary-TextColor') },
    negative: { bg: T('button-negative-BackgroundColor'), border: T('button-negative-BorderColor'), label: T('button-negative-LabelColor'), icon: T('button-negative-IconColor') },
    brand: { bg: T('primary-button-default'), border: null, label: '#FFFFFF', icon: '#FFFFFF' },
    positive: { bg: T('button-positive-BackgroundColor'), border: T('button-positive-BorderColor'), label: T('button-positive-LabelColor'), icon: T('button-positive-IconColor') }
  }[kind]
  const H = { large: D('global-large-Size'), medium: D('global-medium-Size'), small: D('global-small-Size'), 'extra-small': D('global-extra-small-Size') }[size]
  const R = { large: D('medium-BorderRadius'), medium: D('medium-BorderRadius'), small: D('small-BorderRadius'), 'extra-small': D('extra-small-BorderRadius') }[size]
  const big = size === 'large' || size === 'medium'
  const iconOnly = !o.label
  const padX = iconOnly ? 0 : big ? D('spacing-2') : D('spacing-1')
  const b = kit.box(o.name || `Button/${kind}/${size}`, {
    w: H, h: H, dir: 'row', gap: big ? D('spacing-1') : D('spacing-0_5'), pad: [0, padX, 0, padX],
    align: 'center', justify: 'center', hs: iconOnly ? 'fix' : 'auto', radius: R, fill: o.pressed ? T('button-secondary-active-BackgroundColor') : K.bg, stroke: K.border
  })
  if (o.icon) kit.add(b, kit.icon(o.icon, o.iconColor || K.icon, 16))
  if (o.label) kit.add(b, kit.text(o.label, { size: 14, weight: 500, lh: 1.15, color: K.label }))
  if (o.menu) kit.add(b, kit.icon('chevronD', K.icon, 14))
  return b
}
kit.IconButton = (icon, o = {}) => kit.Button({ ...o, icon, label: undefined, name: o.name || 'IconButton/' + icon })

// Status icon by category: backlog (UnStarted) | todo (ToDo) | active | won | lost;
// palette overrides the category color for statuses with their own color
kit.CATEGORY = { backlog: 'Cloud', todo: 'Porpoise', active: 'Cerulean', won: 'Grass', lost: 'Coin' }
kit.StatusIcon = (cat, size = 14, palette) => {
  const c = P(palette || kit.CATEGORY[cat])
  const r = size / 2 - 1
  const m = size / 2
  let inner = ''
  if (cat === 'active') inner = `<path d="M${m} ${m} L${m} 3 A${r - 2} ${r - 2} 0 0 1 ${size - 3} ${m} Z" fill="${c}"/>`
  if (cat === 'won') inner = `<circle cx="${m}" cy="${m}" r="${r}" fill="${c}"/><path d="M${m - 3} ${m + 0.2} L${m - 0.8} ${m + 2.4} L${m + 3} ${m - 2}" stroke="#fff" stroke-width="1.5" fill="none"/>`
  if (cat === 'lost') inner = `<circle cx="${m}" cy="${m}" r="${r}" fill="${c}"/><path d="M${m - 2} ${m - 2} L${m + 2} ${m + 2} M${m + 2} ${m - 2} L${m - 2} ${m + 2}" stroke="#fff" stroke-width="1.5"/>`
  const dash = cat === 'backlog' ? 'stroke-dasharray="2 1.6"' : ''
  return kit.svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${c}" stroke-width="1.5" ${dash}/>${inner}</svg>`, 'StatusIcon/' + cat)
}

// Priority icon: none | urgent | high | medium | low.
// Colors: IssuePriorityColor in tracker-resources utils.ts
kit.PriorityIcon = (level) => {
  const col = { none: P('Blueberry'), urgent: P('Orange'), high: P('Sunshine'), medium: P('Ocean'), low: P('Cloud') }[level]
  const bars = { urgent: 3, high: 3, medium: 2, low: 1, none: 0 }[level]
  let s = ''
  if (level === 'urgent') s = `<rect x="1" y="1" width="12" height="12" rx="3" fill="${col}"/><rect x="6.2" y="3.5" width="1.6" height="4.5" fill="#fff"/><rect x="6.2" y="9" width="1.6" height="1.6" fill="#fff"/>`
  else if (level === 'none') s = '<path d="M3 7h8" stroke="#00000099" stroke-width="1.2"/>'
  else for (let i = 0; i < 3; i++) s += `<rect x="${2 + i * 4}" y="${9 - i * 3}" width="2.4" height="${3 + i * 3}" rx="0.6" fill="${i < bars ? col : '#0000002E'}"/>`
  return kit.svg(`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">${s}</svg>`, 'PriorityIcon/' + level)
}

// Avatar: hulyAvatar-container, roundedRect (radius 20%) unless round
kit.Avatar = (initials, paletteName = 'Blueberry', size = 20, round = false) => {
  const b = kit.box('Avatar/' + size, { w: size, h: size, dir: 'row', align: 'center', justify: 'center', radius: round ? size / 2 : Math.round(size * 0.2), fill: P(paletteName) })
  kit.add(b, kit.text(initials, { size: Math.max(8, Math.round(size * 0.42)), weight: 500, color: '#FFFFFF' }))
  return b
}
// No assignee: hulyAvatar roundedRect with a person icon on the accent tint (measured on the stand)
kit.AvatarEmpty = (size = 20) => {
  const b = kit.box('Avatar/empty', { w: size, h: size, dir: 'row', align: 'center', justify: 'center', radius: Math.round(size * 0.2), fill: T('theme-button-default') })
  return kit.add(b, kit.icon('kit/PersonCircle', T('theme-dark-color'), Math.round(size * 0.6)))
}

// Attribute editor button on cards: antiButton kind="link-bordered" size="small" (measured on the stand)
kit.Chip = (content, o = {}) => {
  const px = o.pad ?? 6
  const b = kit.box(o.name || 'Chip', { w: 28, h: 28, dir: 'row', gap: 4, pad: [0, px, 0, px], align: 'center', hs: 'auto', stroke: T('theme-button-border'), radius: 6, fill: T('theme-link-button-color') })
  return kit.add(b, content)
}

// Label (tags.component.LabelsPresenter)
kit.Label = (name, paletteName = 'Sky') => {
  const l = kit.box('Label', { w: 10, h: 20, dir: 'row', gap: 4, pad: [0, 6, 0, 6], align: 'center', hs: 'auto', radius: 10, stroke: T('theme-button-border') })
  const dot = penpot.createEllipse()
  dot.resize(8, 8)
  kit.fill(dot, P(paletteName))
  return kit.add(l, dot, kit.text(name, { size: 11, color: T('theme-content-color') }))
}

kit.Count = (n, o = {}) => {
  const b = kit.box('Count', { w: 10, h: 20, dir: 'row', pad: [0, 6, 0, 6], align: 'center', hs: 'auto', radius: 10, fill: o.fill || T('theme-button-hovered') })
  return kit.add(b, kit.text(String(n), { size: 12, color: o.color || T('theme-dark-color') }))
}

// Status chip: icon + name, used where statuses are listed or mapped
kit.StatusChip = (name, cat, o = {}) => {
  const b = kit.box('StatusChip/' + name, { w: 10, h: o.h || 20, dir: 'row', gap: 4, pad: [0, 6, 0, 4], align: 'center', hs: o.w ? 'fix' : 'auto', radius: 4, fill: o.fill || T('theme-button-hovered'), stroke: o.stroke })
  if (o.w) b.resize(o.w, o.h || 20)
  if (o.drag) kit.add(b, kit.icon('drag', T('theme-darker-color'), 14))
  kit.add(b, kit.StatusIcon(cat, 12), kit.text(name, { size: o.size || 11, color: T('theme-content-color') }))
  if (o.count !== undefined) kit.add(b, kit.text(String(o.count), { size: o.size || 11, color: T('theme-darker-color') }))
  return b
}

// Item of a list control: 'Label' or [label, icon, badge]
const kitItem = (it) => (Array.isArray(it) ? { label: it[0], icon: it[1], badge: it[2] } : { label: it })

// ui/kit Tabs: sections of one screen, an accent line under the selected one.
// items: label | [label, icon]; o: size(medium|small)
kit.Tabs = (items, selected, o = {}) => {
  const small = o.size === 'small'
  const H = small ? D('global-medium-Size') : D('global-large-Size')
  const t = kit.row('Tabs', small ? D('spacing-2') : D('spacing-3'), { align: 'start' })
  for (const raw of items) {
    const it = kitItem(raw)
    const sel = it.label === selected
    const tab = kit.box('tab ' + it.label, { w: 10, h: H, dir: 'column', align: 'center', justify: 'end', hs: 'auto', clip: false })
    const c = sel ? T('global-primary-TextColor') : T('global-secondary-TextColor')
    const content = kit.box('content', { w: 10, h: H - 2, dir: 'row', gap: D('spacing-0_75'), align: 'center', hs: 'auto' })
    if (it.icon) kit.add(content, kit.icon(it.icon, c, 16))
    kit.add(content, kit.text(it.label, { size: 14, weight: 500, lh: 16 / 14, color: c }))
    const line = kit.box('underline', { w: 10, h: 2, fill: sel ? T('kit-button-primary-BackgroundColor') : null })
    kit.add(tab, content, line)
    line.layoutChild.horizontalSizing = 'fill'
    kit.add(t, tab)
  }
  return t
}

// Text input (ModernEditbox look): label above, value/placeholder inside
kit.Input = (o = {}) => {
  const w = o.w || 240
  const c = kit.col('Input', 4)
  if (o.label) kit.add(c, kit.text(o.label, { size: 12, color: T('theme-dark-color') }))
  const b = kit.box('field', { w, h: o.h || 32, dir: 'row', gap: 6, pad: [0, 10, 0, 10], align: 'center', radius: 6, fill: T('input-BackgroundColor'), stroke: o.error ? T('input-error-BorderColor') : T('input-BorderColor') })
  if (o.icon) kit.add(b, kit.icon(o.icon, T('theme-dark-color')))
  kit.add(b, kit.text(o.value || o.placeholder || '', { size: 14, color: o.value ? T('input-TextColor') : T('input-PlaceholderColor') }))
  if (o.menu) { const sp = kit.box('grow', { w: 1, h: 1 }); kit.add(b, sp); sp.layoutChild.horizontalSizing = 'fill'; kit.add(b, kit.icon('chevronD', T('theme-dark-color'), 14)) }
  return kit.add(c, b)
}

// Colors of a selection control (ui/kit Checkbox, Radio) by kind: fill when on, mark
const selectorKind = (kind) => ({
  primary: [T('selector-active-BackgroundColor'), T('selector-IconColor')],
  brand: [T('button-brand-BackgroundColor'), T('button-accent-IconColor')],
  positive: [T('button-positive-BackgroundColor'), T('button-positive-IconColor')],
  negative: [T('button-negative-BackgroundColor'), T('button-negative-IconColor')],
  neutral: [null, T('global-tertiary-TextColor')]
}[kind || 'primary'])

// ui/kit Checkbox: the border takes the kind color, a disabled one has no fill.
// o: indeterminate size(medium|small) kind shape(round) disabled error
kit.Checkbox = (checked, label, o = {}) => {
  const small = o.size === 'small'
  const box = small ? D('spacing-1_75') : D('spacing-2')
  const line = small ? D('spacing-2') : D('spacing-2_5')
  let [color, mark] = selectorKind(o.kind)
  let border = color || mark
  if (o.disabled) [color, mark, border] = [null, T('global-disabled-TextColor'), T('global-disabled-TextColor')]
  if (o.error) border = T('global-error-TextColor')
  const on = checked || o.indeterminate
  const empty = o.disabled || o.kind === 'neutral' ? null : T('selector-BackgroundColor')
  const r = kit.row('Checkbox', small ? D('spacing-0_75') : D('spacing-1'), { align: 'start' })
  const control = kit.box('control', { w: box, h: line, dir: 'row', align: 'center' })
  const b = kit.box('box', {
    w: box, h: box, dir: 'row', align: 'center', justify: 'center', radius: o.shape === 'round' ? box / 2 : D('extra-small-BorderRadius'),
    fill: on ? color : empty, stroke: on && !o.error ? color || border : border
  })
  if (o.indeterminate) kit.add(b, kit.box('dash', { w: Math.round(box / 2), h: 2, radius: 1, fill: mark }))
  else if (checked) kit.add(b, kit.icon('tick', mark, Math.round(box * 0.75)))
  kit.add(r, kit.add(control, b))
  const font = small ? 12 : 14
  if (label) kit.add(r, kit.text(label, { size: font, lh: line / font, color: o.disabled ? T('global-disabled-TextColor') : T('global-primary-TextColor') }))
  return r
}

// ui/kit Toggle. o: size(large|medium|small|extra-small) kind(brand|primary|positive|negative) description
// labelPosition(start: the label before the switch) disabled
kit.Toggle = (on, label, o = {}) => {
  const size = o.size || 'medium'
  const [w, h, t, line] = { large: [48, 24, 14, 24], medium: [40, 20, 10, 20], small: [32, 16, 8, 20], 'extra-small': [28, 14, 6, 16] }[size]
  const onColor = { brand: T('theme-toggle-on-bg-color'), primary: T('kit-button-primary-BackgroundColor'), positive: T('button-positive-BackgroundColor'), negative: T('button-negative-BackgroundColor') }[o.kind || 'brand']
  const track = o.disabled ? (on ? T('global-disabled-TextColor') : T('button-disabled-BackgroundColor')) : on ? onColor : T('theme-toggle-bg-color')
  const thumb = o.disabled && !on ? T('global-disabled-TextColor') : on ? T('theme-toggle-on-sw-color') : T('theme-toggle-sw-color')
  const r = kit.row('Toggle', size === 'extra-small' ? D('spacing-0_75') : D('spacing-1'), { align: 'start' })
  const control = kit.box('control', { w, h: line, dir: 'row', align: 'center' })
  const p = (h - t) / 2
  const tr = kit.box('track', { w, h, dir: 'row', pad: [p, p, p, p], align: 'center', justify: on ? 'end' : 'start', radius: h / 2, fill: track })
  kit.add(control, kit.add(tr, kit.ellipse(t, thumb, 'thumb')))
  if (!label) return kit.add(r, control)
  const font = size === 'extra-small' ? 12 : 14
  const text = kit.col('text', 0)
  kit.add(text, kit.text(label, { size: font, lh: line / font, color: o.disabled ? T('global-disabled-TextColor') : T('global-primary-TextColor') }))
  if (o.description) kit.add(text, kit.text(o.description, { size: 12, lh: 16 / 12, color: o.disabled ? T('global-disabled-TextColor') : T('global-secondary-TextColor') }))
  return o.labelPosition === 'start' ? kit.add(r, text, control) : kit.add(r, control, text)
}

// ui/kit Menu: rows 40 px (58 with a description), headings as a label between lines.
// items: { label icon color(palette) description hint selected accent hover } | { header } | '-'; o: w name
kit.Menu = (items, o = {}) => {
  const w = o.w || 260
  const m = kit.box(o.name || 'Menu', { w, h: 10, dir: 'column', gap: 2, pad: [9, 9, 9, 9], vs: 'auto', radius: D('small-BorderRadius'), fill: T('theme-popup-color'), stroke: T('theme-popup-divider') })
  m.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 8, blur: 12, spread: 0, color: { color: '#0E131E', opacity: 0.12 } }]
  const rowW = w - 18
  // With icons in the menu every row keeps the icon column
  const withIcons = items.some((it) => it.icon || it.color)
  for (const it of items) {
    if (it === '-') { kit.add(m, kit.box('divider', { w: rowW, h: 1, fill: T('theme-popup-divider') })); continue }
    if (it.header) {
      const h = kit.box('header', { w: rowW, h: 24, dir: 'row', gap: 8, pad: [8, 8, 4, 8], align: 'center' })
      const line = () => kit.box('line', { w: 10, h: 1, fill: T('theme-popup-divider') })
      const [l1, l2] = [line(), line()]
      kit.add(h, l1, kit.text(it.header, { size: 10, weight: 500, lh: 1.2, color: T('global-tertiary-TextColor'), upper: true }), l2)
      l1.layoutChild.horizontalSizing = 'fill'
      l2.layoutChild.horizontalSizing = 'fill'
      kit.add(m, h)
      continue
    }
    const row = kit.box('item/' + it.label, { w: rowW, h: it.description ? 58 : 40, dir: 'row', gap: 8, pad: [10, 8, 10, 8], align: it.description ? 'start' : 'center', radius: D('extra-small-BorderRadius'), fill: it.hover ? T('theme-popup-hover') : null })
    if (it.color) kit.add(row, kit.box('swatch', { w: 14, h: 14, radius: 3, fill: P(it.color) }))
    else if (it.icon) kit.add(row, kit.icon(it.icon, T('global-primary-TextColor')))
    else if (withIcons) kit.add(row, kit.spacer(16, 16))
    const labels = kit.col('labels', 2)
    kit.add(labels, kit.text(it.label, { size: 14, lh: 20 / 14, color: it.accent ? T('primary-button-default') : T('global-primary-TextColor') }))
    if (it.description) kit.add(labels, kit.text(it.description, { size: 12, lh: 16 / 12, color: T('global-secondary-TextColor') }))
    kit.add(row, labels)
    labels.layoutChild.horizontalSizing = 'fill'
    if (it.hint) kit.add(row, kit.text(it.hint, { size: 12, lh: 20 / 12, color: T('global-secondary-TextColor') }))
    if (it.selected) kit.add(row, kit.icon('tick', T('global-primary-TextColor')))
    kit.add(m, row)
  }
  return m
}

// Inline notice: kind warning|info|negative
kit.Notice = (text, kind = 'warning', o = {}) => {
  const K = {
    warning: { bg: TOKENS.palette.light.Sunshine + '1F', border: P('Sunshine') + '66', fg: '#8A5300' },
    info: { bg: T('theme-state-primary-background-color'), border: T('theme-state-primary-border-color'), fg: T('theme-state-primary-color') },
    negative: { bg: T('theme-state-negative-background-color'), border: T('theme-state-negative-border-color'), fg: T('theme-state-negative-color') }
  }[kind]
  const b = kit.box('Notice/' + kind, { w: o.w || 10, h: 10, dir: 'row', gap: 8, pad: [6, 10, 6, 10], align: 'center', hs: o.w ? 'fix' : 'auto', vs: 'auto', radius: o.pill ? 14 : 6, fill: K.bg, stroke: K.border })
  return kit.add(b, kit.icon(kind === 'info' ? 'eye' : 'warn', K.fg), kit.text(text, { size: 12, color: K.fg, w: o.w ? o.w - 44 : undefined }))
}
