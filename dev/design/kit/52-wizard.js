// Wizard dialog (ModernWizardDialog): steps left, content right, Back / Next / Create in the footer.

// ModernWizardBar: "N. Title" steps joined by 2 px lines. steps[] titles, selected index.
// As in the product, the line under the current step is lit too.
kit.WizardBar = (steps, selected, o = {}) => {
  const bar = kit.col('WizardBar', 0, o.w ? { w: o.w, hs: 'fix' } : {})
  const lit = (i) => (i <= selected ? T('positive-button-default') : T('theme-wizard-not-visited-color'))
  const line = (i) => kit.add(kit.box('line', { w: 16, h: 14, dir: 'row', justify: 'center' }), kit.box('path', { w: 2, h: 14, fill: lit(i) }))
  steps.forEach((title, i) => {
    const past = i < selected
    const current = i === selected
    if (i > 0) kit.add(bar, line(i))
    const circle = kit.box('circle', {
      w: 16,
      h: 16,
      radius: 8,
      dir: 'row',
      align: 'center',
      justify: 'center',
      fill: current ? null : past ? T('positive-button-default') : T('theme-wizard-not-visited-color'),
      stroke: past || current ? T('positive-button-default') : T('theme-wizard-not-visited-color'),
      strokeW: 2
    })
    if (past) kit.add(circle, kit.icon('ui/Checkmark', T('theme-button-contrast-color'), 12))
    const label = kit.text(`${i + 1}. ${title}`, { size: 13, lh: 16 / 13, weight: current || past ? 500 : 400, color: T('theme-text-primary-color') })
    kit.add(bar, kit.add(kit.row('step ' + (i + 1), 8), circle, label))
    if (i < steps.length - 1) kit.add(bar, line(i))
  })
  return bar
}

// Returns { modal, body }: add the step content to body, place modal with kit.at.
// o: w bodyH (steps and content height) back next submit labels, canProceed (false disables Next)
kit.WizardDialog = (title, steps, selected, o = {}) => {
  const w = o.w || 896
  const bodyH = o.bodyH || 496
  const modal = kit.box('WizardDialog ' + title, { w, h: 10, dir: 'column', vs: 'auto', radius: 20, fill: T('theme-dialog-background-color') })
  const border = (name, bw, bh) => kit.box(name, { w: bw, h: bh, fill: T('theme-dialog-border-color') })
  const head = kit.box('header', { w, h: 62, dir: 'row', pad: [20, 32, 14, 40], justify: 'space-between' })
  kit.add(head, kit.text(title, { size: 20, color: T('theme-caption-color') }), kit.IconButton('x', { kind: 'ghost', size: 'small', name: 'Close' }))
  const middle = kit.box('content', { w, h: bodyH, dir: 'row' })
  const side = kit.box('steps', { w: 223, h: bodyH, dir: 'column', pad: [24, 16, 24, 24] })
  kit.add(side, kit.WizardBar(steps, selected))
  const body = kit.box('body', { w: w - 224, h: bodyH, dir: 'column', gap: 16, pad: [24, 24, 24, 24] })
  kit.add(middle, side, border('divider', 1, bodyH), body)
  const foot = kit.box('footer', { w, h: 77, dir: 'row', pad: [0, 40, 0, 40], align: 'center', justify: 'space-between' })
  const extra = kit.row('footer extra', 16)
  if (selected > 0) kit.add(extra, kit.ClassicButton({ kind: 'regular', size: 'large', icon: 'ui/ArrowLeft', label: o.back || 'Back' }))
  else kit.add(extra, kit.spacer(1, 1))
  const buttons = kit.row('footer buttons', 12)
  if (selected === steps.length - 1) kit.add(buttons, kit.ClassicButton({ kind: 'positive', size: 'large', label: o.submit || 'Create' }))
  else kit.add(buttons, kit.ClassicButton({ kind: 'primary', size: 'large', label: o.next || 'Next', iconRight: 'ui/ArrowRight', disabled: o.canProceed === false }))
  kit.add(foot, extra, buttons)
  kit.add(modal, head, border('border', w, 1), middle, border('border', w, 1), foot)
  return { modal, body }
}
