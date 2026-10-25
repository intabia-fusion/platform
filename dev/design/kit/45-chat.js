// Chat (chunter) message list and input: date separator, new-messages line, message, input with toolbar.

// Day divider: a pill with the date on a line
kit.DateSeparator = (label, w = 1513) => {
  const b = kit.box('Date ' + label, { w, h: 33 })
  kit.at(b, kit.box('line', { w, h: 1, fill: T('highlight-select-border') }), 0, 16)
  const pill = kit.box('date', { w: 10, h: 26, dir: 'row', pad: [0, 8, 0, 8], align: 'center', hs: 'auto', radius: 16, fill: T('highlight-select'), stroke: T('highlight-select-border') })
  kit.add(pill, kit.text(label, { size: 12, weight: 500, lh: 1.25, color: T('theme-content-color') }))
  kit.at(b, kit.add(kit.box('date row', { w, h: 26, dir: 'row', align: 'center', justify: 'center' }), pill), 0, 4)
  return b
}

// Line that marks where the new messages start: dashed red lines around a label
kit.NewMarker = (w = 1513) => {
  const r = kit.box('New messages', { w, h: 16, dir: 'row', gap: 12, align: 'center', justify: 'center' })
  const line = () => {
    const l = kit.box('line', { w: (w - 24 - 24) / 2, h: 1, stroke: T('highlight-red'), strokeStyle: 'dashed' })
    return l
  }
  return kit.add(r, line(), kit.text('New', { size: 12, lh: 1.3, color: T('highlight-red') }), line())
}

// Message: avatar 40, author with time, text. Without initials it is a system message with the neutral avatar.
// o: w author time text initials color
kit.Message = (o = {}) => {
  const m = kit.box('Message ' + o.author, { w: o.w || 1513, h: 10, dir: 'row', gap: 16, pad: [9, 21, 9, 21], vs: 'auto' })
  const av = o.initials
    ? kit.Avatar(o.initials, o.color, 40)
    : kit.add(kit.box('Avatar/system', { w: 40, h: 40, dir: 'row', align: 'center', justify: 'center', radius: 8, fill: T('avatar-bg-color') }), kit.text(o.author[0], { size: 14, weight: 500, color: T('theme-content-color') }))
  const body = kit.col('body', 4)
  const head = kit.row('header', 4)
  kit.add(head, kit.text(o.author, { size: 14, lh: 1.3125, color: T('global-secondary-TextColor') }), kit.text(o.time, { size: 12, lh: 1.67, color: T('global-secondary-TextColor') }))
  kit.add(body, head, kit.text(o.text, { size: 14, lh: 1.3125, color: T('content-color'), w: (o.w || 1513) - 42 - 56 }))
  return kit.add(m, kit.add(kit.box('avatar', { w: 40, h: 44, pad: [4, 0, 0, 0], dir: 'column' }), av), body)
}

// Message input: text field and toolbar of ghost icon buttons with a send button at the right. o: w placeholder
kit.MessageInput = (o = {}) => {
  const w = o.w || 1481
  const box = kit.box('Message input', { w, h: 88, dir: 'column', pad: [1, 1, 1, 1], radius: 6, stroke: T('theme-refinput-border') })
  const field = kit.box('field', { w: w - 2, h: 44, dir: 'row', pad: [2, 12, 2, 12] })
  kit.add(field, kit.text(o.placeholder || 'Start typing...', { size: 14, lh: 1.5, color: T('theme-trans-color') }))
  const panel = kit.box('panel', { w: w - 2, h: 42, dir: 'row', pad: [5, 12, 5, 12], align: 'center', justify: 'space-between' })
  const group = kit.row('group', 6)
  const tool = (icon) => kit.ClassicButton({ kind: 'ghost', size: 'medium', icon, iconSize: 20 })
  const div = () => kit.box('divider', { w: 1, h: 24, fill: T('theme-refinput-divider') })
  kit.add(group, tool('kit/Paperclip'), tool('kit/Camera'), div(), tool('kit/Mic'), div(), tool('kit/At'), tool('kit/Smiley'), div(), tool('kit/BubblePlus'))
  kit.add(panel, group, kit.ClassicButton({ kind: 'ghost', size: 'medium', icon: 'text-editor/Send', iconSize: 20, disabled: true }))
  return kit.add(box, field, panel)
}
