// Pen library: the components of the Storybook kit (dev/storybook/src/design/kit), same category and name.
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
for (const kind of ['primary', 'secondary', 'tertiary', 'ghost', 'negative', 'brand']) {
  for (const size of ['large', 'medium', 'small', 'extra-small']) {
    def(`Actions/Button/${kind}/${size}`, kit.Button({ kind, size, label: 'Button', icon: 'kit/Plus', menu: true }), { hide: ['2'] })
    def(`Actions/Button/${kind}/${size}/icon`, kit.Button({ kind, size, icon: 'gear' }))
  }
}
def('Actions/Switcher', kit.Switcher(['All', 'Active', 'Backlog'], 'Active'), { slots: ['$root'] })
def('Actions/Switcher/icons', kit.Switcher(['kit/BulletList', 'kit/Kanban'], 'kit/Kanban'), { slots: ['$root'] })
def('Actions/Menu', kit.Menu([{ header: 'Boards' }, { label: 'Main board', icon: 'board', selected: true }, { label: 'Releases', icon: 'milestone', hint: '3' }, '-', { label: 'New board', icon: 'plus', accent: true }], { w: 260 }), { slots: ['$root'] })

for (const kind of ['regular', 'primary', 'positive', 'dangerous', 'ghost', 'icon']) {
  for (const size of ['small', 'medium', 'large']) {
    def(`Actions/ClassicButton/${kind}/${size}`, kit.ClassicButton({ kind, size, label: 'Button', icon: 'kit/Plus', menu: true }), { hide: ['2'] })
    def(`Actions/ClassicButton/${kind}/${size}/icon`, kit.ClassicButton({ kind, size, icon: 'kit/PencilLine' }))
  }
}
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
def('Forms/Input', kit.Input({ w: 240, label: 'Label', icon: 'kit/PersonCircle', value: 'Value', menu: true }), { hide: ['0', '1/0', '1/2', '1/3'] })
def('Forms/Input/multiline', kit.Input({ w: 240, h: 64, label: 'Label', value: 'Long value that wraps to the next line' }), { hide: ['0'] })
def('Forms/Checkbox', kit.Checkbox(true, 'Label'))
def('Forms/Checkbox/empty', kit.Checkbox(false, 'Label'))
def('Forms/Toggle', kit.Toggle(true, 'Label'))
def('Forms/Toggle/off', kit.Toggle(false, 'Label'))
def('Forms/Radio', kit.Radio(true, 'Label', 'Hint'), { hide: ['1/1'] })
def('Forms/Radio/off', kit.Radio(false, 'Label', 'Hint'), { hide: ['1/1'] })
for (const kind of ['ghost-large', 'large-style', 'editbox']) def(`Forms/EditBox/${kind}`, kit.EditBox('Value', { kind, w: 256 }))
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

// ---- People: avatars are drawn by kit/90-pen.js, the library holds the 20px look ----
def('People/Avatar', kit.add(kit.box('Avatar', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: '#666ECC' }),
  kit.text('AJ', { name: 'initials', size: 8, weight: 500, color: '#FFFFFF' })))
def('People/Avatar/empty', kit.add(kit.box('Avatar/empty', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: T('theme-button-default') }), kit.icon('kit/PersonCircle', T('theme-dark-color'), 12)))

// ---- Status ----
for (const cat of Object.keys(kit.CATEGORY)) def('Status/StatusIcon/' + cat, kit.StatusIcon(cat, 14, undefined, true))
for (const level of ['urgent', 'high', 'medium', 'low', 'none']) def('Status/PriorityIcon/' + level, kit.PriorityIcon(level, true))
def('Status/StatusChip', kit.StatusChip('In Progress', 'active', { drag: true, count: 7 }), { hide: ['0', '3'] })
def('Status/Count', kit.Count(12))
for (const kind of ['warning', 'info', 'negative']) def('Status/Notice/' + kind, kit.Notice('Notice text', kind))
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
def('TagsAndFilters/Tag', kit.Label('bug', 'Sky'))
def('TagsAndFilters/QuickFilter', kit.QuickFilter('Only mine', false))
def('TagsAndFilters/QuickFilter/on', kit.QuickFilter('Only mine', true))
def('TagsAndFilters/FilterChip', kit.FilterChip('Priority', 'in', 'Urgent, High'))
def('TagsAndFilters/Swatch', kit.Swatch(P('Orange')))
for (const kind of ['tint', 'solid', 'outline', 'neutral']) {
  for (const size of ['small', 'extra-small']) def(`TagsAndFilters/KitChip/${kind}/${size}`, kit.KitChip('Value', { kind, size, icon: 'kit/Plus', removable: true }), { hide: ['0', '2'] })
}
for (const tone of ['positive', 'negative', 'regular', 'ghost']) def('TagsAndFilters/KitChip/tone/' + tone, kit.KitChip('Value', { tone, icon: 'kit/Plus', removable: true }), { hide: ['0', '2'] })

// ---- Tracker ----
def('Tracker/IssueCard', kit.IssueCard(card), { hide: ['0/0/1'], slots: ['chips'] })
def('Tracker/IssueCard/normal', kit.IssueCard({ ...card, density: 'normal' }), { hide: ['0/0/1'], slots: ['chips'] })
def('Tracker/IssueCard/compact', kit.IssueCard({ ...card, density: 'compact' }), { slots: ['meta'] })
def('Tracker/IssueCard/dense', kit.IssueCard({ ...card, density: 'dense' }))
def('Tracker/ColumnHeader', kit.ColumnHeader('In Progress', 'active', 6, 294, { limit: 8, action: 'Release', actionIcon: 'milestone', tools: true }), { hide: ['0/3', '1', '2'] })
def('Tracker/KanbanColumn', kit.KanbanColumn({ name: 'In Progress', cat: 'active', count: 2, statuses: [['Review', 'active'], ['Testing', 'active']], cards: [card, { ...card, id: 'APP-13', parent: undefined, labels: undefined, est: undefined }] }, 320, 760), { hide: ['2'], slots: ['statuses', 'cards'] })
const issueRow = {
  id: 'APP-12', cat: 'active', title: 'Fix the board layout when a column has no limit', priority: 'high', assignee: avatar, sub: '1/2', com: 3, att: 1,
  labels: [['bug', 'Sky']], milestone: 'Release 1.0', component: 'iOS', due: '30 Oct', est: '4h', rep: 2, created: '2 days ago', modified: 'Oct 21'
}
const issueGroup = { name: 'In Progress', cat: 'active', estimation: '4h', issues: [issueRow] }
def('Tracker/IssueRow', kit.IssueRow(issueRow), { slots: ['row'] })
def('Tracker/IssueGroup', kit.IssueGroup(issueGroup), { slots: ['rows'] })
def('Tracker/IssueGroup/empty', kit.IssueGroup({ name: 'Canceled', cat: 'lost', issues: [] }), { slots: ['rows'] })
def('Tracker/IssueList', kit.IssueList([issueGroup]), { slots: ['$root'] })
def('Tracker/IssuePage', kit.IssuePage({ id: 'APP-12', cat: 'active', title: 'Fix the board layout', statusName: 'In Progress', priority: 'high', assignee: ['AJ', 'Blueberry', 'Appleseed John'], creator: ['AJ', 'Blueberry', 'Appleseed John'], project: 'Mobile app', est: '4h', rep: 2, created: 'Oct 20 2026 3:23 AM' }), { slots: ['$root'] })
def('Tracker/NewIssuePopup', kit.NewIssuePopup({ project: 'Mobile app', statusName: 'Backlog', cat: 'backlog' }))

// ---- Settings ----
def('Settings/SectionTitle', kit.SectionTitle('Title', 'Hint of the section', 420), { hide: ['1'] })
def('Settings/FormRow', kit.FormRow('Label', kit.Input({ w: 240, value: 'Value' }), { hint: 'Hint' }), { hide: ['0/1'], slots: ['control'] })
def('Settings/Table', kit.Table([{ title: 'Name', w: 240 }, { title: 'Role', w: 160 }], [['Ivan', 'Admin'], ['Anna', 'Member']]), { slots: ['head', 'body'] })
def('Settings/GridRow', kit.GridRow('Label', kit.EditBox('Value', { kind: 'editbox' }), { hint: 'Hint' }), { hide: ['0/1'], slots: ['control'] })
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
def('Workbench/NavItem', kit.NavItem('Issues', { icon: 'kit/CheckSquare', count: 3, w: 255 }), { hide: ['2', '3'] })
def('Workbench/NavItem/selected', kit.NavItem('Issues', { icon: 'kit/CheckSquare', count: 3, selected: true, w: 255 }), { hide: ['2', '3'] })
def('Workbench/NavItem/object', kit.NavItem('general', { icon: 'kit/Hash', object: true, w: 255 }))
def('Workbench/NavItem/object/selected', kit.NavItem('general', { icon: 'kit/Hash', object: true, selected: true, w: 255 }))
def('Workbench/NavCaption', kit.NavCaption('Channels', false, { menu: true }), { hide: ['1'] })
def('Workbench/NavCaption/highlighted', kit.NavCaption('Channels', true, { menu: true }), { hide: ['1'] })
def('Workbench/NavGroup', kit.NavGroupHeader('Your projects', { add: true }))
def('Workbench/NavSpace', kit.NavSpaceHeader('Mobile app', { icon: 'kit/HouseFill', color: 'Porpoise' }))
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
  def('Workbench/PanelHeader', main.children[0], { slots: ['actions'] })
  const divided = kit.box('Main panel', { w: 1200, h: 700 })
  kit.PanelHeader(divided, { title: 'Members', icon: 'kit/People', divided: true, actions: [kit.ClassicButton({ kind: 'icon', icon: 'kit/Search' })] })
  def('Workbench/PanelHeader/divided', divided.children[0], { slots: ['actions'] })
}

// ---- Chat ----
def('Chat/DateSeparator', kit.DateSeparator('Tuesday March 29', 1513))
def('Chat/NewMarker', kit.NewMarker(1513))
def('Chat/Message', kit.Message({ author: 'Anna Smith', time: '10:12 AM', text: 'The new column is in, please check the order.', initials: 'AJ', color: 'Blueberry' }))
def('Chat/Message/system', kit.Message({ author: 'System', time: '5:47 PM', text: 'Created this channel on Mar 29, 2022' }))
def('Chat/MessageInput', kit.MessageInput({ w: 1481 }))

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
def('Login/LoginTabs', kit.LoginTabs('Platform', ['Sign up', 'Log In'], 'Log In'))
def('Login/LoginTitle', kit.LoginTitle('Title'))
def('Login/LoginTitle/subtitle', kit.LoginTitle('Title', { subtitle: 'Subtitle' }))
def('Login/LoginField', kit.LoginField('Label', { value: 'Value' }))
def('Login/LoginStatus', kit.LoginStatus('Message'))
def('Login/LoginStatus/error', kit.LoginStatus('Message', { kind: 'error' }))
for (const kind of ['primary', 'default']) def(`Login/LoginButton/${kind}`, kit.LoginButton('Button', { kind }))
def('Login/LoginButton/primary/disabled', kit.LoginButton('Button', { kind: 'primary', disabled: true }))
def('Login/LoginButton/provider', kit.LoginButton('Button', { kind: 'provider', icon: 'google' }))
for (const name of ['google', 'github', 'openid']) def('Login/LoginIcon/' + name, kit.LoginIcon(name))
def('Login/LoginProviders', kit.LoginProviders([['google', 'Sign in with Google'], ['github', 'Sign in with GitHub']]), { slots: ['$root'] })
def('Login/LoginCheckbox', kit.LoginCheckbox(true, 'Label'))
def('Login/LoginCheckbox/empty', kit.LoginCheckbox(false, 'Label'))
def('Login/LoginLinks', kit.LoginLinks([['Caption', 'Link']]), { slots: ['$root'] })
def('Login/LoginAction', kit.LoginAction('Action'))
def('Login/LoginOtpHeader', kit.LoginOtpHeader('Enter the code', 'We sent the code to', 'name@example.com'))
def('Login/LoginCode', kit.LoginCode('123456'))
def('Login/LoginWorkspace', kit.LoginWorkspace('Workspace', 'last visit 2 days ago'))
def('Login/LoginBackTitle', kit.LoginBackTitle('Title'))

// ---- Icon: one component per icon the screens and the definitions above name ----
for (const name of [...host.icons].sort()) {
  const i = ICONS[name]
  const [, , vw, vh] = i.vb
  const paint = i.sw !== undefined
    ? { stroke: '#000000', strokeWidth: Math.round(i.sw * 16 / vw * 100) / 100, strokeLinecap: 'round', strokeLinejoin: 'round' }
    : { fill: '#000000', fillRule: 'evenodd' }
  def('Icon/' + name, kit.pen({ type: 'path', name: 'Icon/' + name, geometry: i.d, viewBox: i.vb, width: 16, height: Math.round(16 * vh / vw * 100) / 100, ...paint }))
}
