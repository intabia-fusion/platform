// @hcengineering/ui/kit components for new designs, geometry and tokens of the product styles.
// Kit* names: the plain name belongs to an older kit component (StatusIcon, Chip, NavItem, NavGroup).

// Height, radius and side padding of the kit sizes (buttons and fields share them)
const KIT_SIZE = {
  large: { h: D('global-large-Size'), r: D('medium-BorderRadius'), pad: D('spacing-2'), gap: D('spacing-1'), font: 14 },
  medium: { h: D('global-medium-Size'), r: D('medium-BorderRadius'), pad: D('spacing-2'), gap: D('spacing-1'), font: 14 },
  small: { h: D('global-small-Size'), r: D('small-BorderRadius'), pad: D('spacing-1'), gap: D('spacing-0_5'), font: 14 },
  'extra-small': { h: D('global-extra-small-Size'), r: D('extra-small-BorderRadius'), pad: D('spacing-1'), gap: D('spacing-0_5'), font: 12 }
}
const grow = (parent, node) => {
  kit.add(parent, node)
  node.layoutChild.horizontalSizing = 'fill'
  return node
}
// An icon in the 20 px box the kit buttons give it
const iconSlot = (icon, color, size = 16) => kit.add(kit.box('icon', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center' }), kit.icon(icon, color, size))

// ---- Forms ----

// TextInput. o: kind(secondary|ghost|subtle) size value placeholder label icon clearable error disabled heading w
kit.TextInput = (o = {}) => {
  const kind = o.kind || 'secondary'
  const size = o.size || 'small'
  const s = KIT_SIZE[size]
  const pad = { large: D('spacing-2'), medium: D('spacing-2'), small: D('spacing-1_5'), 'extra-small': D('spacing-1') }[size]
  const [font, weight, lh] = o.heading ? { large: [24, 500, 32], medium: [20, 400, 28], small: [16, 500, 24] }[size] ?? [16, 500, 24] : size === 'extra-small' ? [12, 400, 16] : [14, 400, 20]
  const filled = kind === 'secondary'
  // A ghost or subtle field stands flush with the content; an error outlines it with the padding of a filled one
  const flush = !filled && !o.error
  const c = kit.col('TextInput', D('spacing-0_5'))
  if (o.label) kit.add(c, kit.text(o.label, { size: 12, weight: 500, lh: 16 / 12, color: T('global-primary-TextColor') }))
  const f = kit.box('field', {
    w: o.w || 240, h: s.h, dir: 'row', gap: D('spacing-0_75'), pad: [0, flush ? 0 : pad, 0, flush ? 0 : pad], align: 'center', radius: s.r,
    fill: o.disabled && filled ? T('button-disabled-BackgroundColor') : filled ? T('input-BackgroundColor') : null,
    stroke: o.error ? T('input-error-BorderColor') : filled && !o.disabled ? T('input-BorderColor') : null
  })
  if (o.icon) kit.add(f, kit.icon(o.icon, o.disabled ? T('button-disabled-IconColor') : T('global-secondary-TextColor'), 16))
  const text = o.value || o.placeholder || ''
  const color = o.disabled ? T('button-disabled-LabelColor') : o.value ? T('global-primary-TextColor') : T('global-secondary-TextColor')
  kit.add(f, kit.text(text, { size: font, weight, lh: lh / font, color }))
  grow(f, kit.box('grow', { w: 1, h: 1 }))
  if (o.clearable && o.value) kit.add(f, iconSlot('kit/Cross', T('global-secondary-TextColor'), 14))
  return kit.add(c, f)
}

// TextArea. o: kind(secondary|ghost|subtle) size(small|medium) value placeholder rows error disabled w
kit.TextArea = (o = {}) => {
  const kind = o.kind || 'secondary'
  const [font, lh] = o.size === 'medium' ? [16, 24] : [14, 20]
  const filled = kind === 'secondary'
  const [px, py] = filled || o.error ? [D('spacing-1_5'), D('spacing-0_75')] : [0, 0]
  const w = o.w || 320
  const b = kit.box('TextArea', {
    w, h: (o.rows || 3) * lh + 2 * py, dir: 'column', pad: [py, px, py, px], radius: D('small-BorderRadius'),
    fill: o.disabled && filled ? T('button-disabled-BackgroundColor') : filled ? T('input-BackgroundColor') : null,
    stroke: o.error ? T('input-error-BorderColor') : filled && !o.disabled ? T('input-BorderColor') : null
  })
  const color = o.disabled ? T('button-disabled-LabelColor') : o.value ? T('global-primary-TextColor') : T('global-secondary-TextColor')
  return kit.add(b, kit.text(o.value || o.placeholder || '', { size: font, lh: lh / font, color, w: w - 2 * px }))
}

// Colors of the kit buttons a select button is made of: fill, border, value, icon
const selectKind = (kind, o) => {
  if (o.disabled) return { bg: T('button-disabled-BackgroundColor'), border: null, label: T('button-disabled-LabelColor'), icon: T('button-disabled-IconColor') }
  return {
    secondary: { bg: o.pressed ? T('kit-button-secondary-active-BackgroundColor') : T('kit-button-secondary-BackgroundColor'), border: T('kit-button-secondary-BorderColor'), label: T('kit-button-subtle-LabelColor'), icon: T('kit-button-subtle-IconColor') },
    ghost: { bg: o.pressed ? T('button-tertiary-active-BackgroundColor') : null, border: null, label: T('global-secondary-TextColor'), icon: T('global-secondary-TextColor') },
    primary: { bg: T('kit-button-primary-BackgroundColor'), border: T('kit-button-secondary-BorderColor'), label: T('kit-button-primary-LabelColor'), icon: T('kit-button-primary-IconColor') },
    brand: { bg: T('button-brand-BackgroundColor'), border: null, label: T('button-accent-LabelColor'), icon: T('button-accent-IconColor') },
    chip: { bg: T('theme-list-button-color'), border: T('theme-button-border'), label: T('theme-content-color'), icon: T('theme-halfcontent-color') }
  }[kind]
}

// SelectButton: the trigger of a selector, the value at weight 400. o: kind(secondary|ghost|primary|brand|chip)
// size label(value) placeholder icon chevron pressed disabled w (full width: the chevron at the end)
// field (secondary in a form: the fill and border of the text fields)
kit.SelectButton = (o = {}) => {
  const kind = o.kind || 'secondary'
  const s = kind === 'chip' ? { h: 28, r: 14, pad: D('spacing-1'), gap: D('spacing-0_5'), font: 14 } : KIT_SIZE[o.size || 'small']
  const K = selectKind(kind, o)
  if (o.field && kind === 'secondary' && !o.disabled) Object.assign(K, { bg: T('input-BackgroundColor'), border: T('input-BorderColor'), label: T('global-primary-TextColor') })
  const empty = !o.label
  const accent = kind === 'primary' || kind === 'brand'
  const b = kit.box(o.name || 'SelectButton', { w: o.w || s.h, h: s.h, dir: 'row', gap: s.gap, pad: [0, s.pad, 0, s.pad], align: 'center', hs: o.w ? 'fix' : 'auto', radius: s.r, fill: K.bg, stroke: K.border })
  const muted = empty && !accent && !o.disabled ? T('global-secondary-TextColor') : undefined
  if (o.icon) kit.add(b, iconSlot(o.icon, muted || K.icon))
  kit.add(b, kit.text(o.label || o.placeholder || '', { size: s.font, lh: 16 / s.font, color: muted || K.label }))
  if (o.w) grow(b, kit.box('grow', { w: 1, h: 1 }))
  if (o.chevron) kit.add(b, iconSlot('kit/CaretDownFill', muted || K.icon))
  return b
}

// Dropdown (closed): a SelectButton with the chevron, picked values joined by a dot. o: values[] placeholder icon kind size chevron w
kit.Dropdown = (o = {}) => kit.SelectButton({ ...o, chevron: o.chevron ?? true, label: (o.values || []).join(' · ') || undefined })

// SearchInput: a TextInput with the magnifier; collapsed - a square button. o: kind(secondary|ghost) size value placeholder collapsed w
kit.SearchInput = (o = {}) => {
  if (o.collapsed) return kit.Button({ kind: 'secondary', size: o.size || 'small', icon: 'kit/Search', name: 'SearchInput/collapsed' })
  return kit.TextInput({ kind: o.kind, size: o.size, value: o.value, placeholder: o.placeholder ?? 'Search', icon: 'kit/Search', clearable: true, w: o.w })
}

// ---- Settings ----

// SettingRow: caption in caps on the left, the control on the right, a line under the row.
// o: hint (info button) stacked (caption above) details[] (nodes under the row) first (no gap above) w
// kind 'column' (a settings page: caption in a 220 px column, the hint text under it, no line), fill (the control takes the rest)
kit.SettingRow = (label, control, o = {}) => {
  const w = o.w || 560
  if (o.kind === 'column') {
    const r = kit.box('SettingRow ' + label, { w, h: 10, dir: 'row', gap: D('spacing-2'), align: 'center', vs: 'auto', clip: false })
    const caption = kit.col('caption', 2, { w: 220, hs: 'fix' })
    kit.add(caption, kit.text(label, { size: 14, lh: 1.3, color: T('theme-content-color') }))
    if (typeof o.hint === 'string') kit.add(caption, kit.text(o.hint, { size: 12, lh: 1.3, color: T('theme-darker-color'), w: 220 }))
    const cw = o.fill ? w - 220 - D('spacing-2') : 10
    const slot = kit.box('control', { w: cw, h: 10, dir: 'row', align: 'center', hs: o.fill ? 'fix' : 'auto', vs: 'auto', clip: false })
    return kit.add(r, caption, kit.add(slot, control))
  }
  const r = kit.col('SettingRow ' + label, 0, { w, hs: 'fix' })
  const stacked = o.stacked === true
  const main = kit.box('main', {
    w, h: stacked ? 10 : o.first ? 52 : 64, dir: stacked ? 'column' : 'row', gap: stacked ? D('spacing-1') : D('spacing-2'), vs: stacked ? 'auto' : 'fix',
    pad: [o.first ? 0 : D('spacing-1_5'), 0, D('spacing-1_5'), 0], align: stacked ? 'start' : 'center', justify: stacked ? 'start' : 'space-between'
  })
  const caption = kit.row('caption', D('spacing-0_5'))
  kit.add(caption, kit.text(label, { size: 12, weight: 500, lh: 16 / 12, upper: true, color: T('global-secondary-TextColor') }))
  if (o.hint) kit.add(caption, kit.Button({ kind: 'ghost', size: 'extra-small', icon: 'kit/InfoCircle', name: 'hint' }))
  const slot = kit.box('control', { w: stacked ? w : 10, h: 10, dir: 'row', align: 'center', justify: stacked ? 'start' : 'end', hs: stacked ? 'fix' : 'auto', vs: 'auto', clip: false })
  kit.add(slot, control)
  kit.add(main, caption, slot)
  kit.add(r, main)
  if (o.details) kit.add(r, kit.add(kit.box('details', { w, h: 10, dir: 'row', gap: D('spacing-0_75'), pad: [0, 0, D('spacing-1_5'), 0], align: 'center', wrap: true, vs: 'auto' }), o.details))
  return kit.add(r, kit.box('line', { w, h: 1, fill: T('global-subtle-ui-BorderColor') }))
}

// Section: a title with a line under it, actions at the right, the content below. o: icon actions[] level w
kit.Section = (label, kids, o = {}) => {
  const w = o.w || 560
  const s = kit.col('Section ' + label, D('spacing-0_5'), { w, hs: 'fix' })
  const head = kit.box('header', { w, h: D('global-medium-Size'), dir: 'row', gap: D('spacing-1'), align: 'center' })
  if (o.icon) kit.add(head, kit.icon(o.icon, T('global-primary-TextColor'), 16))
  const [size, weight] = (o.level ?? 2) === 2 ? [16, 400] : [14, 500]
  kit.add(head, kit.text(label, { size, weight, lh: 24 / size, color: T('global-primary-TextColor') }))
  grow(head, kit.box('grow', { w: 1, h: 1 }))
  kit.add(head, kit.add(kit.row('actions', D('spacing-0_5')), o.actions || []))
  kit.add(s, kit.add(kit.col('title', 0), head, kit.box('line', { w, h: 1, fill: T('theme-divider-color') })))
  return kit.add(s, kit.add(kit.box('content', { w, h: 10, dir: 'column', gap: D('spacing-1'), vs: 'auto', clip: false }), kids || []))
}

// ---- Status ----

// Glyphs of the StatusIcon (viewBox 16): positive check, negative/error cross, warning, info, neutral question
kit.STATUS_GLYPHS = {
  positive: 'M7.2 11.4L4.3 8.5L5.3 7.5L7.1 9.3L10.6 5.1L11.7 6Z',
  negative: 'M11.1 5.8L10.2 4.9L8 7.1L5.8 4.9L4.9 5.8L7.1 8L4.9 10.2L5.8 11.1L8 8.9L10.2 11.1L11.1 10.2L8.9 8Z',
  warning: 'M7.3 4H8.7L8.5 9.2H7.5L7.3 4ZM8 12.1C7.5 12.1 7.1 11.7 7.1 11.2S7.5 10.3 8 10.3S8.9 10.7 8.9 11.2S8.5 12.1 8 12.1Z',
  info: 'M8.7 12H7.3V6.8H8.7V12ZM8 3.9C8.5 3.9 8.9 4.3 8.9 4.8S8.5 5.7 8 5.7S7.1 5.3 7.1 4.8S7.5 3.9 8 3.9Z',
  neutral: 'M7.3 9.3H8.6V9C8.7 8.5 9.2 8.1 9.7 7.6C10.1 7.2 10.5 6.7 10.5 6C10.5 4.9 9.7 4.2 8.3 4.2C6.9 4.2 5.9 5 5.8 6.4H7.2C7.3 5.8 7.6 5.4 8.2 5.4C8.8 5.4 9 5.7 9 6.2C9 6.6 8.7 6.9 8.3 7.3C7.8 7.8 7.3 8.2 7.3 9V9.3ZM8 11.6C8.5 11.6 8.9 11.2 8.9 10.7C8.9 10.2 8.5 9.8 8 9.8C7.5 9.8 7.1 10.2 7.1 10.7C7.1 11.2 7.5 11.6 8 11.6Z'
}
kit.STATUS_GLYPHS.error = kit.STATUS_GLYPHS.negative
// Circle and glyph colors of a tone
kit.statusTone = (tone) => ({
  positive: [T('button-positive-BackgroundColor'), T('button-positive-LabelColor')],
  negative: [T('button-negative-BackgroundColor'), T('button-negative-IconColor')],
  error: [T('global-error-TextColor'), T('button-negative-IconColor')],
  warning: [T('theme-warning-color'), T('global-on-accent-TextColor')],
  info: [T('kit-button-primary-BackgroundColor'), T('kit-button-primary-LabelColor')],
  neutral: [T('global-tertiary-TextColor'), T('global-on-accent-TextColor')]
}[tone])

// StatusIcon of ui/kit: a state by tone. o: kind(solid|outline) size(small 16|medium 20) dot
kit.KitStatusIcon = (tone, o = {}) => {
  const size = o.size === 'medium' ? 20 : 16
  const [bg, glyph] = kit.statusTone(tone)
  if (o.dot) return kit.add(kit.box('KitStatusIcon/' + tone, { w: size, h: size, dir: 'row', align: 'center', justify: 'center' }), kit.ellipse(8, bg, 'dot'))
  const outline = o.kind === 'outline'
  const line = String(TM(bg, 60)).slice(0, 7)
  const c = String(bg).slice(0, 7)
  const circle = outline ? `<circle cx="8" cy="8" r="7" fill="none" stroke="${line}" stroke-opacity="0.6" stroke-width="1.25"/>` : `<circle cx="8" cy="8" r="7" fill="${c}"/>`
  const fill = outline ? `fill="${line}" fill-opacity="0.6"` : `fill="${String(glyph).slice(0, 7)}"`
  return kit.svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">${circle}<path d="${kit.STATUS_GLYPHS[tone]}" ${fill}/></svg>`, 'KitStatusIcon/' + tone)
}

// Callout: a tinted panel with the tone icon, an optional bold title and the text. o: tone(info|positive|warning|error) title actions[] w
kit.Callout = (text, o = {}) => {
  const tone = o.tone || 'info'
  const [c] = kit.statusTone(tone)
  const color = { info: T('global-primary-TextColor'), positive: T('global-primary-TextColor'), warning: T('theme-warning-color'), error: T('global-error-TextColor') }[tone]
  const b = kit.box('Callout/' + tone, { w: o.w || 10, h: 10, dir: 'row', gap: D('spacing-0_75'), pad: [D('spacing-1'), D('spacing-1_5'), D('spacing-1'), D('spacing-1_5')], align: 'start', hs: o.w ? 'fix' : 'auto', vs: 'auto', radius: D('small-BorderRadius'), fill: TM(c, 12), stroke: TM(c, 30) })
  kit.add(b, kit.add(kit.box('icon', { w: 16, h: 18, dir: 'column', justify: 'center' }), kit.KitStatusIcon(tone, { kind: 'outline' })))
  const tw = o.w ? o.w - 2 * D('spacing-1_5') - 2 - 16 - D('spacing-0_75') : undefined
  const body = kit.col('body', 0)
  if (o.title) kit.add(body, kit.text(o.title, { size: 12, weight: 600, lh: 1.5, color, w: tw }))
  kit.add(body, kit.text(text, { size: 12, lh: 1.5, color, w: tw }))
  kit.add(b, body)
  if (o.actions) kit.add(b, kit.add(kit.row('actions', D('spacing-0_5')), o.actions))
  return b
}

// Steps: "N. Label" with a marker, the steps before `selected` done (a check), the current one ringed.
kit.Steps = (items, selected) => {
  const done = T('button-positive-BackgroundColor')
  const ahead = T('global-tertiary-TextColor')
  const s = kit.col('Steps', 0)
  items.forEach((label, i) => {
    const reached = selected !== undefined && i <= selected
    if (i > 0) kit.add(s, kit.add(kit.box('link', { w: 16, h: D('spacing-3_5'), dir: 'row', justify: 'center' }), kit.box('line', { w: reached ? 2 : 1.5, h: D('spacing-3_5'), radius: 1, fill: reached ? done : ahead })))
    const row = kit.row('step ' + (i + 1), D('spacing-1'))
    const state = selected === undefined || i > selected ? 'ahead' : i === selected ? 'current' : 'done'
    const marker = kit.box('marker', { w: 16, h: 16, dir: 'row', align: 'center', justify: 'center', radius: 8, fill: state === 'done' ? done : null, stroke: state === 'ahead' ? ahead : done, strokeW: state === 'ahead' ? 1.5 : 2 })
    if (state === 'done') kit.add(marker, kit.icon('kit/CheckSmall', T('button-positive-IconColor'), 10))
    kit.add(row, marker, kit.text(`${i + 1}. ${label}`, { size: 14, weight: reached ? 500 : 400, lh: 20 / 14, color: T('global-primary-TextColor') }))
    kit.add(s, row)
  })
  return s
}

// EmptyState: large fills the place with the icon on a plate; small is a framed line, with `action` an add button.
// o: description icon size(large|small) kind(brand|plate) action w h
kit.EmptyState = (label, o = {}) => {
  const w = o.w || (o.size === 'small' ? 320 : 416)
  if (o.size === 'small') {
    const b = kit.box('EmptyState ' + label, { w, h: 10, dir: 'column', gap: D('spacing-1'), pad: [16, 16, 16, 16], align: 'center', vs: 'auto', radius: D('medium-BorderRadius'), stroke: o.action ? TM(T('global-secondary-TextColor'), 40) : T('global-subtle-ui-BorderColor'), strokeStyle: o.action ? 'dashed' : 'solid' })
    kit.add(b, kit.text(label, { size: 12, lh: 16 / 12, color: T('global-secondary-TextColor') }))
    if (o.action) kit.add(b, kit.add(kit.row('action', D('spacing-0_5')), kit.icon('kit/Plus', T('button-selected-LabelColor'), 16), kit.text(o.action, { size: 12, weight: 500, lh: 16 / 12, color: T('button-selected-LabelColor') })))
    return b
  }
  const b = kit.box('EmptyState ' + label, { w, h: o.h || 196, dir: 'column', pad: [32, 16, 32, 16], align: 'center', justify: 'center' })
  const brand = (o.kind || 'brand') === 'brand'
  const plate = kit.box('plate', { w: 56, h: 56, dir: 'row', align: 'center', justify: 'center', radius: brand ? 28 : D('large-BorderRadius'), fill: brand ? T('button-selected-BackgroundColor') : TM(T('global-ui-hover-BackgroundColor'), 60) })
  kit.add(plate, kit.icon(o.icon || 'kit/Search', brand ? T('button-selected-LabelColor') : T('global-secondary-TextColor'), 28))
  kit.add(b, plate, kit.spacer(1, 16), kit.text(label, { size: 14, weight: 500, lh: 20 / 14, color: T('global-primary-TextColor') }))
  if (o.description) kit.add(b, kit.spacer(1, 4), kit.text(o.description, { size: 14, lh: 20 / 14, color: T('global-secondary-TextColor'), align: 'center' }))
  return b
}

// ---- TagsAndFilters ----

// Chip of ui/kit: a value or a label, removable. o: kind(tint|solid|outline|neutral) tone(positive|negative|regular|ghost)
// size(small|extra-small) color(P(...)) icon removable
kit.KitChip = (label, o = {}) => {
  const xs = o.size === 'extra-small'
  const accent = o.color || T('kit-button-primary-BackgroundColor')
  const kind = o.kind || 'tint'
  const K = o.tone !== undefined
    ? { bg: T(`theme-state-${o.tone}-background-color`), border: null, text: T(`theme-state-${o.tone}-color`) }
    : {
        tint: { bg: TM(accent, 14), border: null, text: TM(accent, 60, T('global-primary-TextColor')) },
        solid: { bg: accent, border: null, text: T('global-on-accent-TextColor') },
        outline: { bg: null, border: accent, text: TM(accent, 60, T('global-primary-TextColor')) },
        neutral: { bg: T('global-ui-hover-BackgroundColor'), border: null, text: T('global-secondary-TextColor') }
      }[kind]
  const pl = xs ? D('spacing-0_75') : D('spacing-1')
  const b = kit.box('KitChip ' + label, { w: 10, h: xs ? 24 : 32, dir: 'row', gap: xs ? 2 : 4, pad: [0, o.removable ? (xs ? 2 : 4) : pl, 0, pl], align: 'center', hs: 'auto', radius: xs ? D('extra-small-BorderRadius') : D('small-BorderRadius'), fill: K.bg, stroke: K.border })
  if (o.icon) kit.add(b, kit.icon(o.icon, K.text, xs ? 12 : 16))
  kit.add(b, kit.text(label, { size: xs ? 12 : 14, weight: 500, lh: 16 / (xs ? 12 : 14), color: K.text }))
  if (o.removable) kit.add(b, kit.add(kit.box('remove', { w: 16, h: 16, dir: 'row', align: 'center', justify: 'center' }), kit.icon('kit/Cross', K.text, xs ? 12 : 14)))
  return b
}

// ---- Actions ----

// Dialog: header with the title in caps and the close button, the body, Cancel / submit in the footer.
// o: w (400 x-small, 480 small, 600 medium, 720 large, 932 x-large) submitLabel cancelLabel submitKind footer(false: none) h(body)
const dialogFrame = (name, title, w, o) => {
  const d = kit.box(name, { w, h: 10, dir: 'column', vs: 'auto', radius: D('large-BorderRadius'), fill: T('theme-dialog-background-color') })
  d.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 24, blur: 24, spread: 4, color: { color: '#0E131E', opacity: 0.12 } }]
  const head = kit.box('header', { w, h: 56, dir: 'row', gap: D('spacing-1'), pad: [12, 16, 12, 16], align: 'center' })
  kit.add(head, kit.text(title, { size: 12, weight: 500, lh: 16 / 12, upper: true, color: T('global-secondary-TextColor') }))
  grow(head, kit.box('grow', { w: 1, h: 1 }))
  // Esc hint (Kbd) before the close button, as the dialog shows it
  const esc = kit.box('Esc', { w: 10, h: 16, dir: 'row', pad: [0, 4, 0, 4], align: 'center', hs: 'auto', radius: D('extra-small-BorderRadius'), fill: T('global-ui-hover-BackgroundColor') })
  kit.add(esc, kit.text('Esc', { size: 10, weight: 500, lh: 1.2, color: T('global-secondary-TextColor') }))
  kit.add(head, kit.add(kit.row('tools', D('spacing-0_5')), esc, kit.Button({ kind: 'ghost', size: 'small', icon: 'kit/Cross', name: 'Close' })))
  return kit.add(d, head, kit.box('border', { w, h: 1, fill: T('theme-dialog-border-color') }))
}
kit.Dialog = (title, kids, o = {}) => {
  const w = o.w || 720
  const d = dialogFrame('Dialog ' + title, title, w, o)
  const body = kit.box('body', { w, h: o.h || 10, dir: 'column', gap: D('spacing-2'), pad: [20, 24, 20, 24], vs: o.h ? 'fix' : 'auto', clip: false })
  kit.add(d, kit.add(body, kids || []))
  if (o.footer === false) return d
  const foot = kit.box('footer', { w, h: 64, dir: 'row', gap: D('spacing-1'), pad: [12, 12, 12, 12], align: 'center', justify: 'end' })
  kit.add(foot, kit.Button({ kind: 'secondary', size: 'medium', label: o.cancelLabel || 'Cancel' }), kit.Button({ kind: o.submitKind || 'brand', size: 'medium', label: o.submitLabel || 'Save' }))
  return kit.add(d, kit.box('border', { w, h: 1, fill: T('theme-dialog-border-color') }), foot)
}

// WizardDialog of ui/kit: Steps on the left, the step content, Back / Next or the submit on the last step.
// o: w (932) h (content height) submitLabel canProceed canSubmit earlySubmit (Back and Next on the left, the submit on the right on every step)
kit.KitWizardDialog = (title, steps, selected, kids, o = {}) => {
  const w = o.w || 932
  const h = o.h || 400
  const d = dialogFrame('KitWizardDialog ' + title, title, w, o)
  const middle = kit.box('content', { w, h, dir: 'row' })
  const side = kit.box('steps', { w: 223, h, dir: 'column', pad: [24, 16, 24, 24] })
  kit.add(side, kit.Steps(steps, selected))
  const body = kit.box('body', { w: w - 224, h, dir: 'column', gap: D('spacing-2'), pad: [24, 24, 24, 24], clip: false })
  kit.add(middle, side, kit.box('border', { w: 1, h, fill: T('theme-dialog-border-color') }), kit.add(body, kids || []))
  const foot = kit.box('footer', { w, h: 64, dir: 'row', gap: D('spacing-2'), pad: [12, 12, 12, 12], align: 'center', justify: 'space-between' })
  const back = selected > 0 ? kit.Button({ kind: 'secondary', size: 'medium', icon: 'kit/ArrowLeft', label: 'Back' }) : undefined
  const last = selected === steps.length - 1
  const next = last ? undefined : kit.add(kit.Button({ kind: 'brand', size: 'medium', label: 'Next step' }), kit.icon('kit/ArrowRight', '#FFFFFF', 16))
  const submit = (kind) => kit.Button({ kind, size: 'medium', label: o.submitLabel || 'Create' })
  // earlySubmit: Back and Next together on the left, the submit on the right on every step
  if (o.earlySubmit) kit.add(foot, kit.add(kit.row('navigation', D('spacing-1')), back || kit.spacer(1, 1), next), submit(last ? 'positive' : 'secondary'))
  else kit.add(foot, back || kit.spacer(1, 1), next || submit('positive'))
  return kit.add(d, middle, kit.box('border', { w, h: 1, fill: T('theme-dialog-border-color') }), foot)
}

// SegmentedControl: one of 2-5 values, the selected segment tinted. items: label | [label, icon, badge];
// o: size(medium|small|extra-small) iconOnly
kit.SegmentedControl = (items, selected, o = {}) => {
  const size = o.size || 'small'
  const [h, r, rs, pad, font] = { medium: [40, 8, 6, 16, 14], small: [32, 6, 4, 12, 14], 'extra-small': [24, 4, 2, 8, 12] }[size]
  const t = kit.box('SegmentedControl', { w: 10, h, dir: 'row', gap: 2, pad: [2, 2, 2, 2], align: 'center', hs: 'auto', radius: r, fill: TM(T('global-ui-hover-BackgroundColor'), 50) })
  for (const raw of items) {
    const it = kitItem(raw)
    const sel = it.label === selected
    const c = sel ? T('button-selected-LabelColor') : T('global-secondary-TextColor')
    const iconOnly = o.iconOnly && it.icon
    const seg = kit.box('segment ' + it.label, { w: h - 4, h: h - 4, dir: 'row', gap: D('spacing-0_75'), pad: [0, iconOnly ? 0 : pad, 0, iconOnly ? 0 : pad], align: 'center', justify: 'center', hs: iconOnly ? 'fix' : 'auto', radius: rs, fill: sel ? T('button-selected-BackgroundColor') : null })
    if (it.icon) kit.add(seg, kit.icon(it.icon, c, 16))
    if (!iconOnly) kit.add(seg, kit.text(it.label, { size: font, weight: 500, lh: 16 / font, color: c }))
    if (it.badge && !iconOnly) kit.add(seg, kit.text(String(it.badge), { size: 12, weight: 500, lh: 16 / 12, color: T('global-tertiary-TextColor') }))
    kit.add(t, seg)
  }
  return t
}

// ButtonGroup: toggles of which at most one is on (side panels). items: label | [label, icon] ('' - icon only);
// o: kind(ghost|secondary) size
kit.ButtonGroup = (items, selected, o = {}) => {
  const kind = o.kind || 'ghost'
  const s = KIT_SIZE[o.size || 'small']
  const g = kit.row('ButtonGroup', D('spacing-0_5'))
  for (const raw of items) {
    const it = kitItem(raw)
    const key = it.label || it.icon
    const sel = key === selected
    const c = sel ? T('button-selected-LabelColor') : kind === 'secondary' ? T('kit-button-subtle-IconColor') : T('global-secondary-TextColor')
    const fill = sel ? T('button-selected-BackgroundColor') : kind === 'secondary' ? T('kit-button-secondary-BackgroundColor') : null
    const b = kit.box('button ' + key, { w: s.h, h: s.h, dir: 'row', gap: s.gap, pad: [0, it.label ? s.pad : 0, 0, it.label ? s.pad : 0], align: 'center', justify: 'center', hs: it.label ? 'auto' : 'fix', radius: s.r, fill, stroke: kind === 'secondary' ? T('kit-button-secondary-BorderColor') : null })
    if (it.icon) kit.add(b, iconSlot(it.icon, c))
    if (it.label) kit.add(b, kit.text(it.label, { size: s.font, weight: 500, lh: 16 / s.font, color: c }))
    kit.add(g, b)
  }
  return g
}

// ---- Workbench ----

// NavItem of ui/kit: a navigator row. o: icon count selected level kind(link|object) expandable open description identifier w
kit.KitNavItem = (label, o = {}) => {
  const object = o.kind === 'object'
  const level = o.level || 0
  const sel = o.selected === true
  const fg = sel ? T('button-selected-LabelColor') : T('global-primary-TextColor')
  const r = kit.box('KitNavItem ' + label, { w: o.w || 216, h: D('global-small-Size'), dir: 'row', pad: [0, D('spacing-0_5'), 0, (object ? D('spacing-0_5') : D('spacing-1_25')) + level * 20], align: 'center', radius: D('small-BorderRadius'), fill: sel ? T('button-selected-BackgroundColor') : null })
  if (o.expandable) kit.add(r, kit.add(kit.box('chevron', { w: 16, h: 16, dir: 'row', align: 'center', justify: 'center' }), kit.icon(o.open ? 'chevronD' : 'chevronR', T('global-secondary-TextColor'), 14)), kit.spacer(4, 1))
  if (o.icon && object) {
    const box = kit.box('icon', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: D('min-BorderRadius'), fill: T('global-ui-BackgroundColor'), stroke: T('global-subtle-ui-BorderColor') })
    kit.add(r, kit.add(box, kit.icon(o.icon, sel ? fg : T('global-primary-TextColor'), 16)), kit.spacer(D('spacing-0_75'), 1))
  } else if (o.icon) kit.add(r, kit.icon(o.icon, sel ? T('button-selected-IconColor') : T('global-primary-TextColor'), 16), kit.spacer(D('spacing-1'), 1))
  const text = kit.row('text', D('spacing-0_5'))
  if (o.identifier) kit.add(text, kit.text(o.identifier, { size: 12, weight: 500, lh: 20 / 12, color: sel ? fg : T('global-secondary-TextColor') }))
  kit.add(text, kit.text(label, { size: 14, lh: 20 / 14, color: fg }))
  if (o.description) kit.add(text, kit.text(o.description, { size: 14, lh: 20 / 14, color: T('global-secondary-TextColor') }))
  grow(r, text)
  if (o.count !== undefined) kit.add(r, kit.spacer(D('spacing-1'), 1), kit.text(String(o.count), { size: 12, weight: 700, lh: 16 / 12, color: sel ? T('global-secondary-TextColor') : T('global-tertiary-TextColor') }), kit.spacer(D('spacing-1'), 1))
  return r
}

// NavGroup of ui/kit: the header of a navigator group, a chevron while closed. o: kind(section|nested) icon expandable open divider w
kit.KitNavGroup = (label, o = {}) => {
  const w = o.w || 240
  const g = kit.col('KitNavGroup ' + label, 0, { w, hs: 'fix' })
  if (o.divider) kit.add(g, kit.box('divider', { w, h: 1, fill: T('theme-navpanel-divider') }))
  const head = kit.box('header', { w, h: D('global-medium-Size'), dir: 'row', gap: 2, pad: [8, 18, 8, 16], align: 'center' })
  if (o.expandable && !o.open) kit.add(head, kit.add(kit.box('chevron', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4 }), kit.icon('chevronR', T('global-disabled-TextColor'), 14)))
  if (o.icon) kit.add(head, kit.icon(o.icon, T('global-primary-TextColor'), 16))
  const nested = o.kind === 'nested'
  const caption = kit.box('caption', { w: 10, h: 20, dir: 'row', gap: 4, pad: [2, 4, 2, 4], align: 'center', hs: 'auto', radius: 4 })
  kit.add(caption, kit.text(label, nested ? { size: 14, weight: 500, lh: 16 / 14, color: T('global-primary-TextColor') } : { size: 12, weight: 500, lh: 16 / 12, upper: true, color: T('global-tertiary-TextColor') }))
  kit.add(head, caption)
  return kit.add(g, head)
}

// Breadcrumbs: the path, the last crumb is the current one. items: label | [label, icon]
kit.Breadcrumbs = (items) => {
  const b = kit.row('Breadcrumbs', 0)
  items.forEach((raw, i) => {
    const it = kitItem(raw)
    const current = i === items.length - 1
    if (i > 0) kit.add(b, kit.icon('kit/ChevronRight', T('global-tertiary-TextColor'), 16))
    const c = kit.box('crumb ' + it.label, { w: 10, h: D('global-small-Size'), dir: 'row', gap: D('spacing-0_75'), pad: [0, 8, 0, 8], align: 'center', hs: 'auto', radius: D('small-BorderRadius') })
    if (it.icon) kit.add(c, kit.add(kit.box('icon', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: D('extra-small-BorderRadius'), fill: TM(T('global-ui-hover-BackgroundColor'), 50) }), kit.icon(it.icon, T('global-secondary-TextColor'), 16)))
    kit.add(c, kit.text(it.label, { size: 16, weight: current ? 700 : 500, lh: 20 / 16, color: T('global-secondary-TextColor') }))
    kit.add(b, c)
  })
  return b
}
