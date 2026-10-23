// Pen library: the components of the Storybook kit (dev/storybook/src/design/kit), same category and name.
// A definition is the kit function called with sample arguments. `hide` lists the optional parts that are off in the
// library look (child index paths), `slots` the containers whose children an instance supplies.
// Screens get instances of the variant that fits (kit/95-library.js), icons come last: they are named by what is drawn above.
host.page = []
const def = (name, shape, o) => kit.component(name, shape, o)
const avatar = ['AJ', 'Blueberry']
const widgets = ['calendar/calendar', 'chunter/chunter', 'love/office', 'rating/rating', 'view/ai-star']
const nav = [
  { item: 'My issues', icon: 'tracker/myissues' },
  { item: 'All issues', icon: 'tracker/issues' },
  { divider: true },
  { group: 'Your projects', add: true },
  { space: 'Mobile app', icon: 'tracker/home', color: 'Porpoise' },
  { item: 'Issues', icon: 'tracker/issues', selected: true, indent: true },
  { item: 'Components', icon: 'tracker/components', indent: true }
]
const card = {
  id: 'APP-12', cat: 'active', title: 'Fix the board layout when a column has no limit', priority: 'high', parent: 'Mobile app redesign', unread: true,
  assignee: avatar, sub: '1/2', due: '30 Oct', component: 'iOS', labels: [['bug', 'Sky'], ['ux', 'Orange']], est: '4h', att: 1, com: 3
}

// ---- Actions ----
for (const kind of ['primary', 'secondary', 'tertiary', 'ghost', 'negative', 'brand']) {
  for (const size of ['large', 'medium', 'small', 'extra-small']) {
    def(`Actions/Button/${kind}/${size}`, kit.Button({ kind, size, label: 'Button', icon: 'ui/Add', menu: true }), { hide: ['2'] })
    def(`Actions/Button/${kind}/${size}/icon`, kit.Button({ kind, size, icon: 'gear' }))
  }
}
def('Actions/Switcher', kit.Switcher(['All', 'Active', 'Backlog'], 'Active'), { slots: ['$root'] })
def('Actions/Switcher/icons', kit.Switcher(['tracker/list', 'task/kanban'], 'task/kanban'), { slots: ['$root'] })
def('Actions/Menu', kit.Menu([{ header: 'Boards' }, { label: 'Main board', icon: 'board', selected: true }, { label: 'Releases', icon: 'milestone', hint: '3' }, '-', { label: 'New board', icon: 'plus', accent: true }], { w: 260 }), { slots: ['$root'] })

for (const kind of ['regular', 'primary', 'dangerous', 'ghost', 'icon']) {
  for (const size of ['small', 'medium', 'large']) {
    def(`Actions/ClassicButton/${kind}/${size}`, kit.ClassicButton({ kind, size, label: 'Button', icon: 'ui/Add', menu: true }), { hide: ['2'] })
    def(`Actions/ClassicButton/${kind}/${size}/icon`, kit.ClassicButton({ kind, size, icon: 'ui/Edit' }))
  }
}
// A button with nodes of its own (status, avatar and name): the instance supplies its children
for (const kind of ['regular', 'ghost']) def(`Actions/ClassicButton/${kind}/large/content`, kit.ClassicButton({ kind, size: 'large', content: kit.text('Content') }), { slots: ['$root'], penalty: 40 })
def('Actions/Modal', kit.Modal('Edit project', { w: 600 }).modal, { slots: ['body'] })

// ---- Forms ----
def('Forms/Input', kit.Input({ w: 240, label: 'Label', icon: 'contact/Person', value: 'Value', menu: true }), { hide: ['0', '1/0', '1/2', '1/3'] })
def('Forms/Input/multiline', kit.Input({ w: 240, h: 64, label: 'Label', value: 'Long value that wraps to the next line' }), { hide: ['0'] })
def('Forms/Checkbox', kit.Checkbox(true, 'Label'))
def('Forms/Checkbox/empty', kit.Checkbox(false, 'Label'))
def('Forms/Toggle', kit.Toggle(true, 'Label'))
def('Forms/Toggle/off', kit.Toggle(false, 'Label'))
def('Forms/Radio', kit.Radio(true, 'Label', 'Hint'), { hide: ['1/1'] })
def('Forms/Radio/off', kit.Radio(false, 'Label', 'Hint'), { hide: ['1/1'] })
for (const kind of ['ghost-large', 'large-style', 'editbox']) def(`Forms/EditBox/${kind}`, kit.EditBox('Value', { kind, w: 256 }))

// ---- People: avatars are drawn by kit/90-pen.js, the library holds the 20px look ----
def('People/Avatar', kit.add(kit.box('Avatar', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: '#666ECC' }),
  kit.text('AJ', { name: 'initials', size: 8, weight: 500, color: '#FFFFFF' })))
def('People/Avatar/empty', kit.add(kit.box('Avatar/empty', { w: 20, h: 20, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: T('theme-button-default') }), kit.icon('contact/Person', T('theme-dark-color'), 12)))

// ---- Status ----
for (const cat of Object.keys(kit.CATEGORY)) def('Status/StatusIcon/' + cat, kit.StatusIcon(cat, 14, undefined, true))
for (const level of ['urgent', 'high', 'medium', 'low', 'none']) def('Status/PriorityIcon/' + level, kit.PriorityIcon(level, true))
def('Status/StatusChip', kit.StatusChip('In Progress', 'active', { drag: true, count: 7 }), { hide: ['0', '3'] })
def('Status/Count', kit.Count(12))
for (const kind of ['warning', 'info', 'negative']) def('Status/Notice/' + kind, kit.Notice('Notice text', kind))

// ---- TagsAndFilters ----
def('TagsAndFilters/Chip', kit.Chip([kit.icon('milestone', undefined, 14), kit.text('Release 1.0', { size: 13, color: T('theme-dark-color') })]), { slots: ['$root'] })
def('TagsAndFilters/Tag', kit.Label('bug', 'Sky'))
def('TagsAndFilters/QuickFilter', kit.QuickFilter('Only mine', false))
def('TagsAndFilters/QuickFilter/on', kit.QuickFilter('Only mine', true))
def('TagsAndFilters/FilterChip', kit.FilterChip('Priority', 'in', 'Urgent, High'))
def('TagsAndFilters/Swatch', kit.Swatch(P('Orange')))

// ---- Tracker ----
def('Tracker/IssueCard', kit.IssueCard(card), { hide: ['0/0/2', '0/1/0'], slots: ['card-labels', 'labels'] })
def('Tracker/ColumnHeader', kit.ColumnHeader('In Progress', 'active', 6, 294, { limit: 8, action: 'Release', actionIcon: 'milestone', tools: true }), { hide: ['0/3', '1', '2'] })
def('Tracker/KanbanColumn', kit.KanbanColumn({ name: 'In Progress', cat: 'active', count: 2, statuses: [['Review', 'active'], ['Testing', 'active']], cards: [card, { ...card, id: 'APP-13', parent: undefined, unread: undefined, labels: undefined, est: undefined, att: undefined, com: undefined }] }, 320, 760), { hide: ['2'], slots: ['statuses', 'cards'] })
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

// ---- Workbench ----
def('Workbench/TopBar', kit.TopBar(1920, { tab: 'Tracker' }))
def('Workbench/AppRail', kit.AppRail(1044, {}))
def('Workbench/Sidebar', kit.Sidebar(1044, { widgets }), { hide: ['4'] })
def('Workbench/Navigator', kit.Navigator(1044, { title: 'Tracker', newLabel: 'New issue', nav }), { slots: ['items'] })
def('Workbench/Navigator/tools', kit.Navigator(1044, { title: 'Chat', newLabel: null, tools: ['ui/Search', 'ui/Edit'], nav }), { slots: ['items'] })
def('Workbench/NavItem', kit.NavItem('Issues', { icon: 'tracker/issues', count: 3, w: 255 }), { hide: ['2', '3'] })
def('Workbench/NavItem/selected', kit.NavItem('Issues', { icon: 'tracker/issues', count: 3, selected: true, w: 255 }), { hide: ['2', '3'] })
def('Workbench/NavItem/object', kit.NavItem('general', { icon: 'chunter/hashtag', object: true, w: 255 }))
def('Workbench/NavItem/object/selected', kit.NavItem('general', { icon: 'chunter/hashtag', object: true, selected: true, w: 255 }))
def('Workbench/NavCaption', kit.NavCaption('Channels', false, { menu: true }), { hide: ['1'] })
def('Workbench/NavCaption/highlighted', kit.NavCaption('Channels', true, { menu: true }), { hide: ['1'] })
def('Workbench/NavGroup', kit.NavGroupHeader('Your projects', { add: true }))
def('Workbench/NavSpace', kit.NavSpaceHeader('Mobile app', { icon: 'tracker/home', color: 'Porpoise' }))
{
  const main = kit.box('Main panel', { w: 1560, h: 700 })
  kit.SpaceHeader(main, { view: 'list', title: 'Issues', titleIcon: 'tracker/issues' })
  def('Workbench/SpaceHeader', main.children[0], { slots: ['left', 'right', 'filters'] })
}
{
  const main = kit.box('Main panel', { w: 1200, h: 700 })
  kit.PanelHeader(main, { title: 'Members', icon: 'setting/owners', actions: [kit.ClassicButton({ kind: 'icon', icon: 'ui/Search' })] })
  def('Workbench/PanelHeader', main.children[0], { slots: ['actions'] })
  const divided = kit.box('Main panel', { w: 1200, h: 700 })
  kit.PanelHeader(divided, { title: 'Members', icon: 'setting/owners', divided: true, actions: [kit.ClassicButton({ kind: 'icon', icon: 'ui/Search' })] })
  def('Workbench/PanelHeader/divided', divided.children[0], { slots: ['actions'] })
}

// ---- Chat ----
def('Chat/DateSeparator', kit.DateSeparator('Tuesday March 29', 1513))
def('Chat/NewMarker', kit.NewMarker(1513))
def('Chat/Message', kit.Message({ author: 'Anna Smith', time: '10:12 AM', text: 'The new column is in, please check the order.', initials: 'AJ', color: 'Blueberry' }))
def('Chat/Message/system', kit.Message({ author: 'System', time: '5:47 PM', text: 'Created this channel on Mar 29, 2022' }))
def('Chat/MessageInput', kit.MessageInput({ w: 1481 }))

def('Workbench/Workbench', kit.Workbench('Workbench', 0, 0, { tab: 'Tracker', nav }).frame, { slots: ['Main panel'] })
def('Workbench/Workbench/with side panel', kit.Workbench('Workbench', 0, 0, { tab: 'Tracker', nav, panel: { w: 400 }, selected: 'chunter/chunter', widgets }).frame, { slots: ['Main panel', 'Side panel'] })

{
  const shell = kit.Workbench('Workbench', 0, 0, { tab: 'Tracker', nav }).frame
  kit.at(shell, kit.box('Overlay', { w: 1920, h: 1080, fill: '#00000033' }), 0, 0)
  def('Workbench/Workbench/with overlay', shell, { slots: ['Main panel', 'overlay'] })
}

// ---- Icon: one component per icon the screens and the definitions above name ----
for (const name of [...host.icons].sort()) {
  const i = ICONS[name]
  const [, , vw, vh] = i.vb
  const paint = i.sw !== undefined
    ? { stroke: '#000000', strokeWidth: Math.round(i.sw * 16 / vw * 100) / 100, strokeLinecap: 'round', strokeLinejoin: 'round' }
    : { fill: '#000000', fillRule: 'evenodd' }
  def('Icon/' + name, kit.pen({ type: 'path', name: 'Icon/' + name, geometry: i.d, viewBox: i.vb, width: 16, height: Math.round(16 * vh / vw * 100) / 100, ...paint }))
}
