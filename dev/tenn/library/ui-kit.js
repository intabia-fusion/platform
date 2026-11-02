// Library: the components of the Storybook kit (dev/storybook/src/design/kit), same category and name.
// A definition is the kit function called with sample arguments. `hide` lists the optional parts that are off in the
// library look (child index paths), `slots` the containers whose children an instance supplies.
// Screens get instances of the variant that fits (kit/95-library.js), icons come last: they are named by what is drawn above.
host.page = []
const def = (name, shape, o) => kit.component(name, shape, o)
// Groups whose Storybook kit wrapper (dev/storybook/src/design/kit) renders a component of @hcengineering/ui/kit;
// the library marks each group with it, a group missing here exists only as a drawing
host.uikit = {
  'Actions/Menu': 'Menu',
  'Actions/Dialog': 'Dialog',
  'Actions/KitWizardDialog': 'WizardDialog',
  'Actions/Tabs': 'Tabs',
  'Actions/SegmentedControl': 'SegmentedControl',
  'Actions/ButtonGroup': 'ButtonGroup',
  'Forms/Checkbox': 'Checkbox',
  'Forms/Radio': 'Radio',
  'Forms/Toggle': 'Toggle',
  'Forms/SelectButton': 'SelectButton',
  'Forms/TextInput': 'TextInput',
  'Forms/TextArea': 'TextArea',
  'Settings/Section': 'Section',
  'Settings/SettingRow': 'SettingRow',
  'Status/Callout': 'Callout',
  'Status/EmptyState': 'EmptyState',
  'Status/KitStatusIcon': 'StatusIcon',
  'Status/Steps': 'Steps',
  'TagsAndFilters/KitChip': 'Chip',
  'Workbench/Breadcrumbs': 'Breadcrumbs',
  'Workbench/KitNavItem': 'NavItem',
  'Workbench/KitNavGroup': 'NavGroup'
}
const avatar = ['AJ', 'Blueberry']
const widgets = ['kit/Calendar', 'kit/Bubble', 'kit/Building', 'kit/Star', 'kit/Sparkle']
const nav = [
  { item: 'My issues', icon: 'kit/Crosshair' },
  { item: 'All issues', icon: 'kit/CheckSquare' },
  { divider: true },
  { group: 'Your projects', add: true },
  { space: 'Mobile app', icon: 'kit/HouseFill', color: 'Porpoise' },
  { item: 'Issues', icon: 'kit/CheckSquare', selected: true, indent: true },
  { item: 'Components', icon: 'kit/Diamond', indent: true }
]
const card = {
  id: 'APP-12', cat: 'active', title: 'Fix the board layout when a column has no limit', priority: 'high', parent: 'Mobile app redesign',
  assignee: avatar, sub: '1/2', due: '30 Oct', component: 'iOS', labels: [['bug', 'Sky'], ['ux', 'Orange']], est: '4h'
}

// ---- Actions ----
const spinner = () => kit.node({ type: 'path', name: 'spinner', geometry: 'M12 1A11 11 0 1 1 1 12L12 3A9 9 0 1 0 3 12Z', viewBox: [0, 0, 24, 24], width: 16, height: 16, fill: colorOf(T('theme-dark-color')), enabled: false })
const button = kit.Button({ kind: 'primary', size: 'medium', label: 'Button', icon: 'kit/Plus', menu: true })
kit.add(button, kit.icon('gear'), spinner())
def('Actions/Button', button, {
  hide: ['2'],
  params: { label: 'Button', kind: 'primary', size: 'medium', shape: 'default', state: 'default' },
  styles: {
    primary: { color: '$button-primary-BackgroundColor', 'border-color': '$button-primary-BorderColor', 'text-color': '#ffffff', kids: { spinner: { color: '#ffffff' } } },
    secondary: { color: '$button-secondary-BackgroundColor', 'border-color': '$button-secondary-BorderColor', 'text-color': '#0f121a', kids: { spinner: { color: '#0f121a' } } },
    tertiary: { color: 'none', 'border-color': 'none', 'text-color': '$button-tertiary-LabelColor', kids: { spinner: { color: '$button-tertiary-IconColor' } } },
    ghost: { color: 'none', 'border-color': 'none', 'text-color': '#0f121a', kids: { spinner: { color: '#0f121a' } } },
    negative: { color: '$button-negative-BackgroundColor', 'border-color': '$button-negative-BorderColor', 'text-color': '#ffffff', kids: { spinner: { color: '#ffffff' } } },
    brand: { color: '$button-brand-BackgroundColor', 'border-color': 'none', 'text-color': '#ffffff', kids: { spinner: { color: '#ffffff' } } },
    large: { height: 48, gap: 8, padding: [0, 16], 'corner-radius': 8 },
    medium: { height: 40, gap: 8, padding: [0, 16], 'corner-radius': 8 },
    small: { height: 32, gap: 4, padding: [0, 8], 'corner-radius': 6 },
    'extra-small': { height: 24, gap: 4, padding: [0, 8], 'corner-radius': 4 },
    'icon-only': { padding: 0 },
    'primary-hover': { color: '$button-primary-hover-BackgroundColor' },
    'secondary-hover': { color: '$button-secondary-hover-BackgroundColor' },
    'tertiary-hover': { color: '$button-tertiary-hover-BackgroundColor' },
    'ghost-hover': { color: '$button-tertiary-hover-BackgroundColor' },
    'negative-hover': { color: '$button-negative-hover-BackgroundColor' },
    'brand-hover': { color: '$button-brand-hover-BackgroundColor' },
    'primary-loading': { color: '$button-primary-active-BackgroundColor', kids: { Button: { opacity: 0.7 } } },
    'secondary-loading': { color: '$button-secondary-active-BackgroundColor', kids: { Button: { opacity: 0.7 } } },
    'tertiary-loading': { color: '$button-tertiary-active-BackgroundColor', kids: { Button: { opacity: 0.7 } } },
    'ghost-loading': { color: '$button-tertiary-active-BackgroundColor', kids: { Button: { opacity: 0.7 } } },
    'negative-loading': { color: '$button-negative-active-BackgroundColor', kids: { Button: { opacity: 0.7 } } },
    'brand-loading': { color: '$button-brand-active-BackgroundColor', kids: { Button: { opacity: 0.7 } } },
    disabled: { color: '$button-disabled-BackgroundColor', 'border-color': 'none', 'text-color': '$button-disabled-LabelColor' },
    focus: { 'border-color': '$global-focus-BorderColor', 'line-width': 2 },
    kind: ['one-of', 'primary', 'secondary', 'tertiary', 'ghost', 'negative', 'brand'],
    size: ['one-of', 'large', 'medium', 'small', 'extra-small'],
    shape: ['one-of', 'default', 'icon'],
    state: ['one-of', 'default', 'hover', 'focus', 'disabled', 'loading']
  },
  expr: {
    $root: {
      width: '${shape === "icon" ? (size === "large" ? 48 : size === "medium" ? 40 : size === "small" ? 32 : 24) : "hug"}',
      'use-style': '${kind} ${size} ${shape === "icon" ? "icon-only" : ""} ${state === "hover" || state === "loading" ? kind+"-"+state : state === "default" ? "" : state}'
    },
    icon_kit_Plus: { color: null, hidden: '${shape === "icon" || state === "loading"}' },
    icon_gear: { 'border-color': null, hidden: '${shape !== "icon" || state === "loading"}' },
    Button: { title: '${label}', 'text-color': null, hidden: '${shape === "icon"}' },
    spinner: { color: '${kind === "primary" || kind === "brand" || kind === "negative" || kind === "dangerous" ? "#ffffff" : kind === "tertiary" ? "#6b3ad3" : "#0f121a"}', hidden: '${state !== "loading"}', animation: 'spin 1s linear infinite' }
  },
  animations: { spin: { from: { rotate: 0 }, to: { rotate: 360 } } }
})
for (const kind of ['primary', 'secondary', 'tertiary', 'ghost', 'negative', 'brand']) {
  for (const size of ['large', 'medium', 'small', 'extra-small']) {
    def(`Actions/Button/${kind}/${size}`, kit.Button({ kind, size, label: 'Button', icon: 'kit/Plus', menu: true }), { hide: ['2'], alias: { kind, size } })
    def(`Actions/Button/${kind}/${size}/icon`, kit.Button({ kind, size, icon: 'gear' }), { alias: { kind, size, shape: 'icon' } })
  }
}
const buttonCatalog = kit.col('Button catalog', 12, { pad: [24, 24, 24, 24], fill: '#FFFFFF' })
for (const kind of ['primary', 'secondary', 'tertiary', 'ghost', 'negative', 'brand']) {
  const row = kit.row(kind, 8, { align: 'center' })
  for (const size of ['large', 'medium', 'small', 'extra-small']) {
    kit.add(row, kit.node({ type: 'ref', ref: 'Actions/Button', name: size, params: { kind, size } }))
    kit.add(row, kit.node({ type: 'ref', ref: 'Actions/Button', name: size + ' icon', params: { kind, size, shape: 'icon' } }))
  }
  kit.add(buttonCatalog, row)
}
const buttonStates = kit.row('Button states', 8, { align: 'center' })
for (const state of ['default', 'hover', 'focus', 'disabled', 'loading']) kit.add(buttonStates, kit.node({ type: 'ref', ref: 'Actions/Button', name: state, params: { state } }))
kit.add(buttonCatalog, buttonStates)
def('Actions/ButtonCatalog', buttonCatalog, { element: true })
def('Actions/Switcher', kit.Switcher(['All', 'Active', 'Backlog'], 'Active'), { slots: ['$root'] })
def('Actions/Switcher/icons', kit.Switcher(['kit/BulletList', 'kit/Kanban'], 'kit/Kanban'), { slots: ['$root'] })
def('Actions/Menu', kit.Menu([{ header: 'Boards' }, { label: 'Main board', icon: 'board', selected: true }, { label: 'Releases', icon: 'milestone', hint: '3' }, '-', { label: 'New board', icon: 'plus', accent: true }], { w: 260 }), { slots: ['$root'] })

const classicButton = kit.ClassicButton({ kind: 'regular', size: 'medium', label: 'Button', icon: 'kit/Plus', menu: true })
kit.add(classicButton, kit.icon('kit/PencilLine'), spinner())
def('Actions/ClassicButton', classicButton, {
  hide: ['2'],
  params: { label: 'Button', kind: 'regular', size: 'medium', shape: 'default', state: 'default' },
  styles: {
    regular: { color: '#6b3ad31a', 'border-color': '#00000017', 'text-color': '#000000cc' },
    primary: { color: '#cf13a2', 'border-color': '#1725471a', 'text-color': '#ffffff', kids: { spinner: { color: '#ffffff' } } },
    positive: { color: '$positive-button-default', 'border-color': 'none', 'text-color': '#ffffff', kids: { spinner: { color: '#ffffff' } } },
    dangerous: { color: '#eb5757', 'border-color': '#eb5757', 'text-color': '#ffffff', kids: { spinner: { color: '#ffffff' } } },
    ghost: { color: 'none', 'border-color': 'none', 'text-color': '#000000cc' },
    icon: { color: 'none', 'border-color': 'none', 'text-color': '#000000cc' },
    small: { height: 28, 'min-width': 28 },
    medium: { height: 32, 'min-width': 32 },
    large: { height: 36, 'min-width': 36 },
    'icon-only': { gap: 6, padding: 0 },
    loading: { kids: { Button: { opacity: 0.7 } } },
    disabled: { color: '$button-disabled-BackgroundColor', 'border-color': 'none', 'text-color': '$button-disabled-LabelColor' },
    focus: { 'border-color': '$global-focus-BorderColor', 'line-width': 2 },
    kind: ['one-of', 'regular', 'primary', 'positive', 'dangerous', 'ghost', 'icon'],
    size: ['one-of', 'small', 'medium', 'large'],
    shape: ['one-of', 'default', 'icon'],
    state: ['one-of', 'default', 'focus', 'disabled', 'loading']
  },
  expr: {
    $root: { 'use-style': '${kind} ${size} ${shape === "icon" ? "icon-only" : ""} ${state === "default" ? "" : state}' },
    icon_kit_Plus: { color: null, hidden: '${shape === "icon" || state === "loading"}' },
    icon_kit_PencilLine: { color: null, hidden: '${shape !== "icon" || state === "loading"}' },
    Button: { title: '${label}', 'text-color': null, hidden: '${shape === "icon"}' },
    spinner: { color: '${kind === "primary" || kind === "positive" || kind === "brand" || kind === "negative" || kind === "dangerous" ? "#ffffff" : kind === "tertiary" ? "#6b3ad3" : "#0f121a"}', hidden: '${state !== "loading"}', animation: 'spin 1s linear infinite' }
  },
  animations: { spin: { from: { rotate: 0 }, to: { rotate: 360 } } }
})
for (const kind of ['regular', 'primary', 'positive', 'dangerous', 'ghost', 'icon']) {
  for (const size of ['small', 'medium', 'large']) {
    def(`Actions/ClassicButton/${kind}/${size}`, kit.ClassicButton({ kind, size, label: 'Button', icon: 'kit/Plus', menu: true }), { hide: ['2'], alias: { kind, size } })
    def(`Actions/ClassicButton/${kind}/${size}/icon`, kit.ClassicButton({ kind, size, icon: 'kit/PencilLine' }), { alias: { kind, size, shape: 'icon' } })
  }
}
const classicCatalog = kit.col('Classic button catalog', 12, { pad: [24, 24, 24, 24], fill: '#FFFFFF' })
for (const kind of ['regular', 'primary', 'positive', 'dangerous', 'ghost', 'icon']) {
  const row = kit.row(kind, 8, { align: 'center' })
  for (const size of ['small', 'medium', 'large']) {
    kit.add(row, kit.node({ type: 'ref', ref: 'Actions/ClassicButton', name: size, params: { kind, size } }))
    kit.add(row, kit.node({ type: 'ref', ref: 'Actions/ClassicButton', name: size + ' icon', params: { kind, size, shape: 'icon' } }))
  }
  kit.add(classicCatalog, row)
}
def('Actions/ClassicButtonCatalog', classicCatalog, { element: true })
// A button with nodes of its own (status, avatar and name): the instance supplies its children
for (const kind of ['regular', 'ghost']) def(`Actions/ClassicButton/${kind}/large/content`, kit.ClassicButton({ kind, size: 'large', content: kit.text('Content') }), { slots: ['$root'], penalty: 40 })
def('Actions/Modal', kit.Modal('Edit project', { w: 600 }).modal, { slots: ['body'] })
// The step bar is drawn in place (the instance supplies it); the footer differs on the first, a middle and the last step
for (const [name, step] of [['first', 0], ['middle', 1], ['last', 3]]) {
  def(`Actions/WizardDialog/${name}`, kit.WizardDialog('Title', ['Step', 'Step', 'Step', 'Step'], step).modal, { slots: ['steps', 'body'] })
}
def('Actions/Dialog', kit.Dialog('Title', [kit.text('Content')], { w: 720 }), { slots: ['body'] })
// The steps column is drawn in place (an instance of Status/Steps); the footer differs on the first, a middle and the last step
for (const [name, step] of [['first', 0], ['middle', 1], ['last', 3]]) {
  def(`Actions/KitWizardDialog/${name}`, kit.KitWizardDialog('Title', ['Step', 'Step', 'Step', 'Step'], step, [kit.text('Content')]), { slots: ['steps', 'body'] })
}
def('Actions/Tabs', kit.Tabs(['General', 'Members'], 'General'), { slots: ['$root'] })
def('Actions/Tabs/small', kit.Tabs(['General', 'Members'], 'General', { size: 'small' }), { slots: ['$root'] })
for (const size of ['medium', 'small', 'extra-small']) def(`Actions/SegmentedControl/${size}`, kit.SegmentedControl(['All', 'Active'], 'All', { size }), { slots: ['$root'] })
for (const kind of ['ghost', 'secondary']) def(`Actions/ButtonGroup/${kind}`, kit.ButtonGroup([['', 'kit/Search'], ['', 'kit/InfoCircle']], 'kit/Search', { kind }), { slots: ['$root'] })

// ---- Forms ----
def('Forms/Input', kit.Input({ w: 240, label: 'Label', icon: 'kit/PersonCircle', value: 'Value', menu: true }), {
  hide: ['0', '1/0', '1/2', '1/3'],
  params: { label: 'Label', value: 'Value', layout: 'single', icon: false, menu: false },
  styles: {
    multiline: { kids: { field: { height: 64, padding: [8, 10], align: 'start', kids: { Value: { width: 220 } } } } },
    layout: ['one-of', 'single', 'multiline']
  },
  expr: {
    $root: { 'use-style': '${layout}' },
    Label: { title: '${label}', hidden: '${label === ""}' },
    field: {
      Value: { title: '${value}' },
      icon_kit_PersonCircle: { hidden: '${!icon}' },
      grow: { hidden: '${!menu}' },
      icon_chevronD: { hidden: '${!menu}' }
    }
  }
})
def('Forms/Input/multiline', kit.Input({ w: 240, h: 64, label: 'Label', value: 'Long value that wraps to the next line' }), { hide: ['0'], alias: { layout: 'multiline' } })
def('Forms/Checkbox', kit.Checkbox(true, 'Label'), {
  params: { checked: true, label: 'Label' },
  expr: {
    control: {
      box: {
        color: '${checked ? "#cf13a2" : "none"}',
        'border-color': '${checked ? "none" : "#00000017"}',
        icon_tick: { hidden: '${!checked}' }
      }
    },
    Label: { title: '${label}' }
  }
})
def('Forms/Checkbox/empty', kit.Checkbox(false, 'Label'), { alias: { checked: false } })
def('Forms/Toggle', kit.Toggle(true, 'Label'), {
  params: { on: true, label: 'Label' },
  expr: {
    control: {
      track: { color: '${on ? "#cf13a2" : "#78788052"}', justify: '${on ? "end" : "start"}' }
    },
    text: { Label: { title: '${label}' } }
  }
})
def('Forms/Toggle/off', kit.Toggle(false, 'Label'), { alias: { on: false } })
def('Forms/Radio', kit.Radio(true, 'Label', 'Hint'), {
  hide: ['1/1'],
  params: { on: true, label: 'Label', hint: '' },
  expr: {
    control: {
      dot: { 'border-color': '${on ? "#cf13a2" : "#00000017"}', 'line-width': '${on ? 5 : 1}' }
    },
    text: { Label: { title: '${label}' }, Hint: { title: '${hint}', hidden: '${hint === ""}' } }
  }
})
def('Forms/Radio/off', kit.Radio(false, 'Label', 'Hint'), { hide: ['1/1'], alias: { on: false } })
def('Forms/EditBox', kit.EditBox('Value', { kind: 'ghost-large', w: 256 }), {
  params: { value: 'Value', kind: 'ghost-large', width: 256 },
  styles: {
    'ghost-large': { height: 36, padding: [0, 8], 'border-color': '#0000000f', kids: { Value: { 'font-size': 16, 'font-weight': 500 } } },
    'large-style': { height: 26, padding: 0, 'border-color': 'none', kids: { Value: { 'font-size': 20, 'font-weight': 400 } } },
    editbox: { height: 19, padding: 0, 'border-color': 'none', kids: { Value: { 'font-size': 14, 'font-weight': 400 } } },
    kind: ['one-of', 'ghost-large', 'large-style', 'editbox']
  },
  expr: { $root: { width: '${width}', 'use-style': '${kind}' }, Value: { title: '${value}' } }
})
for (const kind of ['ghost-large', 'large-style', 'editbox']) def(`Forms/EditBox/${kind}`, kit.EditBox('Value', { kind, w: 256 }), { alias: { kind } })
def('Forms/Checkbox/indeterminate', kit.Checkbox(false, 'Label', { indeterminate: true }))
// ui/kit fields: label, icon and the clear button are optional parts
for (const kind of ['secondary', 'ghost', 'subtle']) {
  for (const size of ['large', 'medium', 'small', 'extra-small']) {
    def(`Forms/TextInput/${kind}/${size}`, kit.TextInput({ kind, size, label: 'Label', icon: 'kit/Search', value: 'Value', clearable: true }), { hide: ['0', '1/0', '1/3'] })
  }
  for (const size of ['medium', 'small']) def(`Forms/TextArea/${kind}/${size}`, kit.TextArea({ kind, size, value: 'Text' }))
}
for (const kind of ['secondary', 'ghost', 'primary', 'brand', 'chip']) {
  for (const size of kind === 'secondary' || kind === 'ghost' ? ['large', 'medium', 'small', 'extra-small'] : ['small']) {
    def(`Forms/SelectButton/${kind}/${size}`, kit.SelectButton({ kind, size, label: 'Value', icon: 'kit/Plus', chevron: true }), { hide: ['0', '2'] })
  }
}
// Full width: the value at the start, the chevron at the end
for (const size of ['medium', 'small']) def(`Forms/SelectButton/secondary/${size}/full`, kit.SelectButton({ size, label: 'Value', icon: 'kit/Plus', chevron: true, w: 240 }), { hide: ['0'] })

// ---- People: avatars are drawn by kit/90-tenn.js, the library holds the 20px look ----
const avatarPart = kit.add(kit.box('Avatar', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: '#666ECC' }),
  kit.text('AJ', { name: 'initials', size: 8, weight: 500, color: '#FFFFFF' }), kit.icon('kit/PersonCircle', T('theme-dark-color'), 12))
def('People/Avatar', avatarPart, {
  params: { initials: 'AJ', empty: false },
  styles: { empty: { color: '$theme-button-default' } },
  expr: {
    $root: { 'use-style': '${empty ? "empty" : ""}' },
    initials: { title: '${initials}', hidden: '${empty}' },
    icon_kit_PersonCircle: { hidden: '${!empty}' }
  }
})
def('People/Avatar/empty', kit.add(kit.box('Avatar/empty', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: T('theme-button-default') }), kit.icon('kit/PersonCircle', T('theme-dark-color'), 12)), { alias: { empty: true } })

// ---- Status ----
const statusIcon = kit.StatusIcon('active', 14, undefined, true)
const wonIcon = kit.StatusIcon('won', 14, undefined, true)
const lostIcon = kit.StatusIcon('lost', 14, undefined, true)
const backlogIcon = kit.StatusIcon('backlog', 14, undefined, true)
backlogIcon.node.children[0].name = 'segments'
statusIcon.node.children.push(
  wonIcon.node.children.find((c) => c.name === 'disc'),
  wonIcon.node.children.find((c) => c.name === 'check'),
  lostIcon.node.children.find((c) => c.name === 'cross'),
  backlogIcon.node.children[0]
)
def('Status/StatusIcon', statusIcon, {
  params: { category: 'active' },
  styles: { category: ['one-of', 'backlog', 'todo', 'active', 'won', 'lost'] },
  expr: {
    ring: {
      hidden: '${category === "backlog"}',
      'border-color': '${category === "todo" ? "#758595" : category === "active" ? "#5195d7" : category === "won" ? "#83af12" : "#939395"}'
    },
    wedge: { hidden: '${category !== "active"}' },
    disc: { hidden: '${category !== "won" && category !== "lost"}', color: '${category === "won" ? "#83af12" : "#939395"}' },
    check: { hidden: '${category !== "won"}' },
    cross: { hidden: '${category !== "lost"}' },
    segments: { hidden: '${category !== "backlog"}' }
  }
})
for (const cat of Object.keys(kit.CATEGORY)) def('Status/StatusIcon/' + cat, kit.StatusIcon(cat, 14, undefined, true), { alias: { category: cat } })
const priorityIcon = kit.PriorityIcon('high', true)
const urgentIcon = kit.PriorityIcon('urgent', true)
priorityIcon.node.children.push(...urgentIcon.node.children, ...kit.PriorityIcon('none', true).node.children)
def('Status/PriorityIcon', priorityIcon, {
  params: { priority: 'high' },
  styles: { priority: ['one-of', 'urgent', 'high', 'medium', 'low', 'none'] },
  expr: {
    bar: { hidden: '${priority === "urgent" || priority === "none"}', color: '${priority === "high" ? "#d29840" : priority === "medium" ? "#167b82" : "#a1a1a1"}' },
    bar_2: { hidden: '${priority === "urgent" || priority === "none"}', color: '${priority === "high" ? "#d29840" : priority === "medium" ? "#167b82" : "#000000"}', opacity: '${priority === "low" ? 0.3 : 1}' },
    bar_3: { hidden: '${priority === "urgent" || priority === "none"}', color: '${priority === "high" ? "#d29840" : "#000000"}', opacity: '${priority === "high" ? 1 : 0.3}' },
    box: { hidden: '${priority !== "urgent"}' },
    stem: { hidden: '${priority !== "urgent"}' },
    dot: { hidden: '${priority !== "urgent"}' },
    dash: { hidden: '${priority !== "none"}' }
  }
})
for (const level of ['urgent', 'high', 'medium', 'low', 'none']) def('Status/PriorityIcon/' + level, kit.PriorityIcon(level, true), { alias: { priority: level } })
def('Status/StatusChip', kit.StatusChip('In Progress', 'active', { drag: true, count: 7 }), {
  hide: ['0', '3'],
  params: { label: 'In Progress', count: '', draggable: false },
  expr: {
    icon_drag: { hidden: '${!draggable}' },
    In_Progress: { title: '${label}' },
    _7: { title: '${count}', hidden: '${count === ""}' }
  }
})
def('Status/Count', kit.Count(12), { params: { value: 12 }, expr: { _12: { title: '${value}' } } })
const notice = kit.Notice('Notice text', 'warning')
kit.add(notice, kit.icon('eye'))
def('Status/Notice', notice, {
  params: { text: 'Notice text', kind: 'warning', pill: false, block: false },
  styles: {
    warning: { color: '#d298401f', 'border-color': '#d2984066', 'text-color': '#8a5300' },
    info: { color: '#3070dc1a', 'border-color': '#3070dc26', 'text-color': '#3070dc' },
    negative: { color: '#cb4b4226', 'border-color': '#cb4b4226', 'text-color': '#cb4b42' },
    pill: { 'corner-radius': 14 },
    kind: ['one-of', 'warning', 'info', 'negative']
  },
  expr: {
    $root: { width: '${block ? "fill" : "hug"}', 'use-style': '${kind} ${pill ? "pill" : ""}' },
    icon_warn: { 'border-color': null, hidden: '${kind === "info"}' },
    icon_eye: { 'border-color': null, hidden: '${kind !== "info"}' },
    Notice_text: { title: '${text}', 'text-color': null }
  }
})
for (const kind of ['warning', 'info', 'negative']) def('Status/Notice/' + kind, kit.Notice('Notice text', kind), { alias: { kind } })
for (const tone of ['positive', 'negative', 'error', 'warning', 'info', 'neutral']) {
  def('Status/KitStatusIcon/' + tone, kit.KitStatusIcon(tone))
  def(`Status/KitStatusIcon/${tone}/outline`, kit.KitStatusIcon(tone, { kind: 'outline' }))
}
def('Status/KitStatusIcon/dot', kit.KitStatusIcon('positive', { dot: true }))
for (const tone of ['info', 'positive', 'warning', 'error']) def('Status/Callout/' + tone, kit.Callout('Text', { tone, title: 'Title' }), { hide: ['1/0'] })
def('Status/Steps', kit.Steps(['Step', 'Step', 'Step'], 1), { slots: ['$root'] })
def('Status/EmptyState', kit.EmptyState('Title', { description: 'Description' }), { hide: ['3', '4'] })
def('Status/EmptyState/plate', kit.EmptyState('Title', { description: 'Description', kind: 'plate' }), { hide: ['3', '4'] })
def('Status/EmptyState/small', kit.EmptyState('Title', { size: 'small', action: 'Add' }), { hide: ['1'] })

// ---- TagsAndFilters ----
def('TagsAndFilters/Chip', kit.Chip([kit.icon('milestone', undefined, 14), kit.text('Release 1.0', { size: 13, color: T('theme-dark-color') })]), { slots: ['$root'] })
def('TagsAndFilters/Tag', kit.Label('bug', 'Sky'), { params: { label: 'bug', color: '#4ca6ee' }, expr: { Ellipse: { color: '${color}' }, bug: { title: '${label}' } } })
def('TagsAndFilters/QuickFilter', kit.QuickFilter('Only mine', false), {
  params: { label: 'Only mine', on: false },
  styles: { on: { color: '#cf13a21a', 'border-color': '#cf13a2', 'text-color': '#cf13a2' } },
  expr: { $root: { 'use-style': '${on ? "on" : ""}' }, Only_mine: { title: '${label}', 'text-color': null } }
})
def('TagsAndFilters/QuickFilter/on', kit.QuickFilter('Only mine', true), { alias: { on: true } })
def('TagsAndFilters/FilterChip', kit.FilterChip('Priority', 'in', 'Urgent, High'), {
  params: { attribute: 'Priority', operator: 'in', value: 'Urgent, High' },
  expr: { part: { Priority: { title: '${attribute}' } }, part_2: { in: { title: '${operator}' } }, part_3: { Urgent__High: { title: '${value}' } } }
})
def('TagsAndFilters/Swatch', kit.Swatch(P('Orange')), { params: { color: '#d27540', size: 20 }, expr: { $root: { color: '${color}', width: '${size}', height: '${size}' } } })
for (const kind of ['tint', 'solid', 'outline', 'neutral']) {
  for (const size of ['small', 'extra-small']) def(`TagsAndFilters/KitChip/${kind}/${size}`, kit.KitChip('Value', { kind, size, icon: 'kit/Plus', removable: true }), { hide: ['0', '2'] })
}
for (const tone of ['positive', 'negative', 'regular', 'ghost']) def('TagsAndFilters/KitChip/tone/' + tone, kit.KitChip('Value', { tone, icon: 'kit/Plus', removable: true }), { hide: ['0', '2'] })

// ---- Tracker ----
def('Tracker/IssueCard', kit.IssueCard(card), {
  hide: ['0/0/1'], slots: ['chips'],
  params: { id: 'APP-12', title: 'Fix the board layout when a column has no limit', parent: '', estimation: 'Оценка 4h', density: 'detailed' },
  styles: { detailed: { padding: [12, 14] }, normal: { padding: [10, 12] }, density: ['one-of', 'detailed', 'normal'] },
  expr: {
    $root: { 'use-style': '${density}' },
    top: { left: { id: { title: '${id}' }, parent: { title: '${parent}', hidden: '${parent === ""}' } } },
    title_row: { title: { title: '${title}' } },
    footer: { title: '${estimation}', hidden: '${density === "normal"}' }
  }
})
def('Tracker/IssueCard/normal', kit.IssueCard({ ...card, density: 'normal' }), { hide: ['0/0/1'], slots: ['chips'], alias: { density: 'normal' } })
def('Tracker/IssueCard/compact', kit.IssueCard({ ...card, density: 'compact' }), {
  slots: ['meta'], params: { id: 'APP-12', title: 'Fix the board layout when a column has no limit' },
  expr: { title_row: { title: { title: '${title}' } }, meta: { APP_12: { title: '${id}' } } }
})
def('Tracker/IssueCard/dense', kit.IssueCard({ ...card, density: 'dense' }), {
  params: { id: 'APP-12', title: 'Fix the board layout…' },
  expr: { row: { APP_12: { title: '${id}' }, title: { title: '${title}' } } }
})
def('Tracker/ColumnHeader', kit.ColumnHeader('In Progress', 'active', 6, 294, { limit: 8, action: 'Release', actionIcon: 'milestone', tools: true }), {
  hide: ['0/3', '1', '2'],
  params: { label: 'In Progress', count: 6, limit: '', tools: false },
  styles: {
    'tools-on': { kids: { ColumnAction: { hidden: 'no' }, tools__hover_: { hidden: 'no' } } },
    'tools-off': { kids: { ColumnAction: { hidden: 'yes' }, tools__hover_: { hidden: 'yes' } } }
  },
  expr: {
    $root: { 'use-style': '${tools ? "tools-on" : "tools-off"}' },
    title: { In_Progress: { title: '${label}' }, _6: { title: '${count}' }, __8: { title: '${limit === "" ? "" : "/ " + limit}', hidden: '${limit === ""}' } },
    ColumnAction: { hidden: null },
    tools__hover_: { hidden: null }
  }
})
def('Tracker/KanbanColumn', kit.KanbanColumn({ name: 'In Progress', cat: 'active', count: 2, statuses: [['Review', 'active'], ['Testing', 'active']], cards: [card, { ...card, id: 'APP-13', parent: undefined, labels: undefined, est: undefined }] }, 320, 760), { hide: ['2'], slots: ['statuses', 'cards'] })
const issueRow = {
  id: 'APP-12', cat: 'active', title: 'Fix the board layout when a column has no limit', priority: 'high', assignee: avatar, sub: '1/2', com: 3, att: 1,
  labels: [['bug', 'Sky']], milestone: 'Release 1.0', component: 'iOS', due: '30 Oct', est: '4h', rep: 2, created: '2 days ago', modified: 'Oct 21'
}
const issueGroup = { name: 'In Progress', cat: 'active', estimation: '4h', issues: [issueRow] }
def('Tracker/IssueRow', kit.IssueRow(issueRow), { slots: ['row'] })
def('Tracker/IssueGroup', kit.IssueGroup(issueGroup), {
  slots: ['rows'], params: { name: 'In Progress', estimation: '4h' },
  expr: { categoryHeader: { title: { In_Progress: { title: '${name}' } }, estimation: { estimation: { title: '${estimation}' } } } }
})
def('Tracker/IssueGroup/empty', kit.IssueGroup({ name: 'Canceled', cat: 'lost', issues: [] }), { slots: ['rows'] })
def('Tracker/IssueList', kit.IssueList([issueGroup]), { slots: ['$root'] })
def('Tracker/IssuePage', kit.IssuePage({ id: 'APP-12', cat: 'active', title: 'Fix the board layout', statusName: 'In Progress', priority: 'high', assignee: ['AJ', 'Blueberry', 'Appleseed John'], creator: ['AJ', 'Blueberry', 'Appleseed John'], project: 'Mobile app', est: '4h', rep: 2, created: 'Oct 20 2026 3:23 AM' }), { slots: ['$root'] })
def('Tracker/NewIssuePopup', kit.NewIssuePopup({ project: 'Mobile app', statusName: 'Backlog', cat: 'backlog' }))

// ---- Settings ----
def('Settings/SectionTitle', kit.SectionTitle('Title', 'Hint of the section', 420), {
  hide: ['1'], params: { title: 'Title', hint: '' },
  expr: { Title: { title: '${title}' }, Hint_of_the_section: { title: '${hint}', hidden: '${hint === ""}' } }
})
def('Settings/FormRow', kit.FormRow('Label', kit.Input({ w: 240, value: 'Value' }), { hint: 'Hint' }), {
  hide: ['0/1'], slots: ['control'], params: { label: 'Label', hint: '' },
  expr: { label: { Label: { title: '${label}' }, Hint: { title: '${hint}', hidden: '${hint === ""}' } } }
})
def('Settings/Table', kit.Table([{ title: 'Name', w: 240 }, { title: 'Role', w: 160 }], [['Ivan', 'Admin'], ['Anna', 'Member']]), { slots: ['head', 'body'] })
def('Settings/GridRow', kit.GridRow('Label', kit.EditBox('Value', { kind: 'editbox' }), { hint: 'Hint' }), {
  hide: ['0/1'], slots: ['control'], params: { label: 'Label', hint: '' },
  expr: { label: { Label: { title: '${label}' }, Hint: { title: '${hint}', hidden: '${hint === ""}' } } }
})
{
  const main = kit.box('Main panel', { w: 1200, h: 700 })
  kit.SettingsLayout(main, { back: 'Back', close: true, title: 'Settings', tabs: ['General', 'Members'], tab: 'General', subLead: kit.Button({ kind: 'ghost', size: 'small', label: 'Board', menu: true }), subtabs: ['General', 'Columns'], subtab: 'General' })
  def('Settings/SettingsLayout', main.children[0], { hide: ['4', '5'], slots: ['right', 'Settings tabs', 'Settings subtabs', 'Settings content'] })
}
def('Settings/SettingRow', kit.SettingRow('Label', kit.Toggle(true), { hint: true, details: [kit.KitChip('Value')] }), { hide: ['0/0/1', '1'], slots: ['control', 'details'] })
def('Settings/SettingRow/stacked', kit.SettingRow('Label', kit.TextArea({ kind: 'ghost', w: 560, value: 'Text' }), { stacked: true, hint: true }), { hide: ['0/0/1'], slots: ['control'] })
def('Settings/Section', kit.Section('Title', [kit.text('Content')], { icon: 'kit/Search', actions: [kit.Button({ kind: 'ghost', size: 'small', icon: 'kit/Plus' })] }), { hide: ['0/0/0'], slots: ['actions', 'content'] })

// ---- Workbench ----
def('Workbench/TopBar', kit.TopBar(1920, { tab: 'Tracker' }))
def('Workbench/AppRail', kit.AppRail(1044, {}))
def('Workbench/Sidebar', kit.Sidebar(1044, { widgets }), { hide: ['4'] })
def('Workbench/Navigator', kit.Navigator(1044, { title: 'Tracker', newLabel: 'New issue', nav }), { slots: ['items'] })
def('Workbench/Navigator/tools', kit.Navigator(1044, { title: 'Chat', newLabel: null, tools: ['kit/Search', 'kit/PencilLine'], nav }), { slots: ['items'] })
def('Workbench/NavItem', kit.NavItem('Issues', { icon: 'kit/CheckSquare', count: 3, w: 255 }), {
  hide: ['2', '3'], params: { label: 'Issues', count: '', selected: false },
  styles: { selected: { color: '#a5bdff26' } },
  expr: {
    $root: { 'use-style': '${selected ? "selected" : ""}' },
    icon_kit_CheckSquare: { color: '${selected ? "#cf13a2" : "#0f121a"}' },
    Issues: { title: '${label}', 'text-color': '${selected ? "#cf13a2" : "#0f121a"}' },
    grow: { hidden: '${count === ""}' },
    _3: { title: '${count}', hidden: '${count === ""}' }
  }
})
def('Workbench/NavItem/selected', kit.NavItem('Issues', { icon: 'kit/CheckSquare', count: 3, selected: true, w: 255 }), { hide: ['2', '3'], alias: { selected: true } })
def('Workbench/NavItem/object', kit.NavItem('general', { icon: 'kit/Hash', object: true, w: 255 }), {
  params: { label: 'general', selected: false },
  styles: { selected: { color: '#a5bdff26' } },
  expr: {
    $root: { 'use-style': '${selected ? "selected" : ""}' },
    tile: { icon_kit_Hash: { color: '${selected ? "#cf13a2" : "#0f121a"}' } },
    general: { title: '${label}', 'text-color': '${selected ? "#cf13a2" : "#0f121a"}' }
  }
})
def('Workbench/NavItem/object/selected', kit.NavItem('general', { icon: 'kit/Hash', object: true, selected: true, w: 255 }), { target: 'Workbench/NavItem/object', alias: { selected: true } })
def('Workbench/NavCaption', kit.NavCaption('Channels', false, { menu: true }), {
  hide: ['1'], params: { label: 'CHANNELS', highlighted: false, menu: false },
  styles: { highlighted: { color: '#1530720d' } },
  expr: {
    $root: { 'use-style': '${highlighted ? "highlighted" : ""}' },
    Channels: { title: '${label}', 'text-color': '${highlighted ? "#5a667e" : "#7b879e"}' },
    icon_kit_CaretDownFill: { hidden: '${!menu}' }
  }
})
def('Workbench/NavCaption/highlighted', kit.NavCaption('Channels', true, { menu: true }), { hide: ['1'], alias: { highlighted: true } })
def('Workbench/NavGroup', kit.NavGroupHeader('Your projects', { add: true }), {
  params: { label: 'YOUR PROJECTS', add: true }, expr: { label: { Your_projects: { title: '${label}' } }, add: { hidden: '${!add}' } }
})
def('Workbench/NavSpace', kit.NavSpaceHeader('Mobile app', { icon: 'kit/HouseFill', color: 'Porpoise' }), {
  params: { label: 'MOBILE APP' }, expr: { label: { Mobile_app: { title: '${label}' } } }
})
// ui/kit navigator parts; the count of an item is optional
def('Workbench/KitNavItem', kit.KitNavItem('Item', { icon: 'kit/Search', count: 3 }), { hide: ['3', '4', '5'] })
def('Workbench/KitNavItem/selected', kit.KitNavItem('Item', { icon: 'kit/Search', count: 3, selected: true }), { hide: ['3', '4', '5'] })
def('Workbench/KitNavItem/object', kit.KitNavItem('Item', { icon: 'kit/Hash', kind: 'object' }))
def('Workbench/KitNavItem/expandable', kit.KitNavItem('Item', { icon: 'kit/Search', expandable: true }))
def('Workbench/KitNavGroup', kit.KitNavGroup('Group', { expandable: true }))
def('Workbench/KitNavGroup/open', kit.KitNavGroup('Group', { expandable: true, open: true, divider: true }), { hide: ['0'] })
def('Workbench/Breadcrumbs', kit.Breadcrumbs([['Settings', 'kit/Gear'], 'Page']), { slots: ['$root'] })
{
  const main = kit.box('Main panel', { w: 1560, h: 700 })
  kit.SpaceHeader(main, { view: 'list', title: 'Issues', titleIcon: 'kit/CheckSquare' })
  def('Workbench/SpaceHeader', main.children[0], { slots: ['left', 'right', 'filters'] })
}
{
  const main = kit.box('Main panel', { w: 1200, h: 700 })
  kit.PanelHeader(main, { title: 'Members', icon: 'kit/People', actions: [kit.ClassicButton({ kind: 'icon', icon: 'kit/Search' })] })
  def('Workbench/PanelHeader', main.children[0], { slots: ['actions'], params: { title: 'Members' }, expr: { Panel_header: { Breadcrumb: { Members: { title: '${title}' } } } } })
  const divided = kit.box('Main panel', { w: 1200, h: 700 })
  kit.PanelHeader(divided, { title: 'Members', icon: 'kit/People', divided: true, actions: [kit.ClassicButton({ kind: 'icon', icon: 'kit/Search' })] })
  def('Workbench/PanelHeader/divided', divided.children[0], { slots: ['actions'], params: { title: 'Members' }, expr: { Panel_header: { Breadcrumb: { Members: { title: '${title}' } } } } })
}

// ---- Chat ----
def('Chat/DateSeparator', kit.DateSeparator('Tuesday March 29', 1513), {
  params: { label: 'Tuesday March 29' }, expr: { date_row: { date: { Tuesday_March_29: { title: '${label}' } } } }
})
def('Chat/NewMarker', kit.NewMarker(1513), { params: { label: 'New' }, expr: { New: { title: '${label}' } } })
def('Chat/Message', kit.Message({ author: 'Anna Smith', time: '10:12 AM', text: 'The new column is in, please check the order.', initials: 'AJ', color: 'Blueberry' }), {
  params: { author: 'Anna Smith', time: '10:12 AM', text: 'The new column is in, please check the order.' },
  expr: { body: { header: { Anna_Smith: { title: '${author}' }, _10_12_AM: { title: '${time}' } }, The_new_column_is_in__please_check_the_o: { title: '${text}' } } }
})
def('Chat/Message/system', kit.Message({ author: 'System', time: '5:47 PM', text: 'Created this channel on Mar 29, 2022' }), {
  params: { author: 'System', time: '5:47 PM', text: 'Created this channel on Mar 29, 2022' },
  expr: { body: { header: { System: { title: '${author}' }, _5_47_PM: { title: '${time}' } }, Created_this_channel_on_Mar_29__2022: { title: '${text}' } } }
})
def('Chat/MessageInput', kit.MessageInput({ w: 1481 }), { params: { placeholder: 'Start typing...' }, expr: { field: { Start_typing___: { title: '${placeholder}' } } } })

def('Workbench/Workbench', kit.Workbench('Workbench', 0, 0, { tab: 'Tracker', nav }).frame, { slots: ['Main panel'] })
def('Workbench/Workbench/with side panel', kit.Workbench('Workbench', 0, 0, { tab: 'Tracker', nav, panel: { w: 400 }, selected: 'kit/Bubble', widgets }).frame, { slots: ['Main panel', 'Side panel'] })

{
  const shell = kit.Workbench('Workbench', 0, 0, { tab: 'Tracker', nav }).frame
  kit.at(shell, kit.box('Overlay', { w: 1920, h: 1080, fill: '#00000033' }), 0, 0)
  def('Workbench/Workbench/with overlay', shell, { slots: ['Main panel', 'overlay'] })
}

// ---- Login ----
{
  const sample = kit.LoginPage('Login page', 0, 0)
  def('Login/LoginPage', sample.frame, { slots: ['Card slot'] })
}
def('Login/LoginCard', kit.LoginCard(), { slots: ['$root'] })
def('Login/LoginForm', kit.LoginForm(kit.LoginCard(), {}), { slots: ['$root'] })
def('Login/LoginTabs', kit.LoginTabs('Platform', ['Sign up', 'Log In'], 'Log In'), {
  params: { heading: 'Platform', width: 396 }, expr: { $root: { width: '${width}' }, heading: { Platform: { title: '${heading}' } } }
})
def('Login/LoginTitle', kit.LoginTitle('Title', { subtitle: 'Subtitle' }), {
  params: { text: 'Title', subtitle: '' },
  expr: { Title: { title: '${text}' }, Subtitle: { title: '${subtitle}', hidden: '${subtitle === ""}' } }
})
def('Login/LoginTitle/subtitle', kit.LoginTitle('Title', { subtitle: 'Subtitle' }), { alias: { subtitle: 'Subtitle' } })
def('Login/LoginField', kit.LoginField('Label', { value: 'Value' }), {
  params: { label: 'Label', value: 'Value', password: false, error: false, width: 396 },
  styles: { error: { 'border-color': '#ee7a7a' } },
  expr: {
    $root: { width: '${width}', 'use-style': '${error ? "error" : ""}' },
    Label: { title: '${label}' },
    Value: { title: '${password ? "********" : value}' }
  }
})
def('Login/LoginStatus', kit.LoginStatus('Message'), {
  params: { text: 'Message', kind: 'info' },
  styles: { kind: ['one-of', 'info', 'error'] },
  expr: {
    message: {
      'border-color': '${kind === "error" ? "#ee7a7a99" : "#e5e7eb"}',
      icon: { icon_kit_InfoCircle: { color: '${kind === "error" ? "#ee7a7a" : "#201240"}' } },
      Message: { title: '${text}', 'text-color': '${kind === "error" ? "#ee7a7a" : "#201240"}' }
    }
  }
})
def('Login/LoginStatus/error', kit.LoginStatus('Message', { kind: 'error' }), { alias: { kind: 'error' } })
const loginButton = kit.LoginButton('Button', { kind: 'primary' })
kit.add(loginButton, kit.LoginIcon('google'))
loginButton.children.unshift(loginButton.children.pop())
def('Login/LoginButton', loginButton, {
  params: { label: 'Button', kind: 'primary', disabled: false },
  styles: {
    primary: { color: '#cf13a2', 'border-color': 'none', 'text-color': '#ffffff' },
    default: { color: '#ffffff', 'border-color': '#e5e7eb', 'text-color': '#201240' },
    provider: { color: '#07040f', 'border-color': 'none', 'text-color': '#ffffff' },
    disabled: { color: '#f3eafb', 'border-color': 'none', 'text-color': '#9ca3af' },
    kind: ['one-of', 'primary', 'default', 'provider']
  },
  expr: {
    $root: { 'use-style': '${disabled ? "disabled" : kind}' },
    Button: { title: '${label}', 'text-color': null },
    icon_google: { hidden: '${kind !== "provider" || disabled}' }
  }
})
for (const kind of ['primary', 'default']) def(`Login/LoginButton/${kind}`, kit.LoginButton('Button', { kind }), { alias: { kind } })
def('Login/LoginButton/primary/disabled', kit.LoginButton('Button', { kind: 'primary', disabled: true }), { alias: { kind: 'primary', disabled: true } })
def('Login/LoginButton/provider', kit.LoginButton('Button', { kind: 'provider', icon: 'google' }), { alias: { kind: 'provider' } })
for (const name of ['google', 'github', 'openid']) def('Login/LoginIcon/' + name, kit.LoginIcon(name))
def('Login/LoginProviders', kit.LoginProviders([['google', 'Sign in with Google'], ['github', 'Sign in with GitHub']]), { slots: ['$root'] })
def('Login/LoginCheckbox', kit.LoginCheckbox(true, 'Label'), {
  params: { checked: true, label: 'Label', invalid: false },
  expr: {
    box_holder: {
      box: {
        color: '${checked ? "#cf13a2" : "#ffffff"}',
        'border-color': '${invalid ? "#ee7a7a" : checked ? "#cf13a2" : "#00000066"}',
        icon_tick: { hidden: '${!checked}' }
      }
    },
    Label: { title: '${label}' }
  }
})
def('Login/LoginCheckbox/empty', kit.LoginCheckbox(false, 'Label'), { alias: { checked: false } })
def('Login/LoginLinks', kit.LoginLinks([['Caption', 'Link']]), { slots: ['$root'] })
def('Login/LoginAction', kit.LoginAction('Action'), { params: { text: 'Action' }, expr: { Action: { title: '${text}' } } })
def('Login/LoginOtpHeader', kit.LoginOtpHeader('Enter the code', 'We sent the code to', 'name@example.com'), {
  params: { title: 'Enter the code', sent: 'We sent the code to', email: 'name@example.com' },
  expr: { title_row: { Enter_the_code: { title: '${title}' } }, description: { We_sent_the_code_to: { title: '${sent}' }, name_example_com: { title: '${email}' } } }
})
def('Login/LoginCode', kit.LoginCode('123456'), {
  params: { digits: '123456' },
  expr: {
    digit_1: { _1: { title: '${digits[0]}' } }, digit_2: { _2: { title: '${digits[1]}' } }, digit_3: { _3: { title: '${digits[2]}' } },
    digit_4: { _4: { title: '${digits[3]}' } }, digit_5: { _5: { title: '${digits[4]}' } }, digit_6: { _6: { title: '${digits[5]}' } }
  }
})
def('Login/LoginWorkspace', kit.LoginWorkspace('Workspace', 'last visit 2 days ago'), {
  params: { name: 'Workspace', note: 'last visit 2 days ago', width: 428 },
  expr: { $root: { width: '${width}' }, Workspace: { title: '${name}' }, last_visit_2_days_ago: { title: '${note}' } }
})
def('Login/LoginBackTitle', kit.LoginBackTitle('Title'), {
  params: { title: 'Title', width: 428 }, expr: { $root: { width: '${width}' }, Title: { title: '${title}' } }
})

// ---- Icon: one component per icon the screens and the definitions above name ----
for (const name of [...host.icons].sort()) {
  const i = ICONS[name]
  const [, , vw, vh] = i.vb
  const paint = i.sw !== undefined
    ? { stroke: '#000000', strokeWidth: Math.round(i.sw * 16 / vw * 100) / 100, strokeLinecap: 'round', strokeLinejoin: 'round' }
    : { fill: '#000000', fillRule: 'evenodd' }
  def('Icon/' + name, kit.node({ type: 'path', name: 'Icon/' + name, geometry: i.d, viewBox: i.vb, width: 16, height: Math.round(16 * vh / vw * 100) / 100, ...paint }))
}
