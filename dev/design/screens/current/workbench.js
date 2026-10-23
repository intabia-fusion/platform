// Current workbench (plugins/workbench-resources Workbench.svelte): the shell and its main elements, one frame each.
// Geometry follows the sanity stand at 1920x1080; data is the demo workspace (DEMO.en).
await kit.page('Workbench')
const project = DEMO.en.projects.find((p) => p.id === 'APP')
const nav = [
  { item: 'My issues', icon: 'tracker/myissues' },
  { item: 'All issues', icon: 'tracker/issues' },
  { divider: true },
  { item: 'All projects', icon: 'tracker/list' },
  { item: 'Labels', icon: 'tracker/labels' },
  { group: 'Your projects', add: true },
  { space: project.name, icon: 'tracker/home', color: 'Porpoise' },
  { item: 'Issues', icon: 'tracker/issues', selected: true, indent: true },
  { item: 'Components', icon: 'tracker/components', indent: true },
  { item: 'Milestones', icon: 'tracker/milestone', indent: true },
  { item: 'Templates', icon: 'tracker/issuetemplates', indent: true }
]
const RAIL_H = 1044

// ---- Application shell, and with the chat open on the right ----------------------------------
{
  const { main } = kit.Workbench('Application shell', 0, 0, { tab: 'Tracker', nav })
  kit.SpaceHeader(main, { view: 'list', title: 'Issues', titleIcon: 'tracker/issues' })
}
{
  const widgets = ['calendar/calendar', 'chunter/chunter', 'love/office', 'rating/rating', 'view/ai-star']
  const { main, panel } = kit.Workbench('Shell with side panel', 0, 1200, { tab: 'Tracker', nav, panel: { w: 400 }, selected: 'chunter/chunter', widgets })
  kit.SpaceHeader(main, { view: 'list', title: 'Issues', titleIcon: 'tracker/issues' })
  // The chat widget uses the components of the channel view (screens/current/chat-channel.js)
  kit.PanelHeader(panel, { title: 'Chat', icon: 'chunter/chunter' })
  const text = ['The new column is in, please check the order.', 'The order is right. Set the In Progress limit to 8?', 'Yes, 8. I will set it on the Boards tab.']
  const msgs = kit.box('Messages', { w: 400, h: 10, dir: 'column', vs: 'auto' })
  kit.add(msgs, kit.DateSeparator('Today', 400))
  DEMO.en.people.slice(0, 3).forEach((p, i) => kit.add(msgs, kit.Message({ w: 400, author: p.name, time: `10:${12 + i * 3} AM`, text: text[i], initials: p.initials, color: p.color })))
  kit.at(panel, msgs, 0, 57)
  kit.at(panel, kit.MessageInput({ w: 368 }), 16, panel.height - 112)
}

// ---- Main elements on their own ---------------------------------------------------------------
kit.at(kit.Frame('Status bar', 2040, 0, 1920, 36), kit.TopBar(1920, { tab: 'Tracker' }), 0, 0)
kit.at(kit.Frame('Application rail', 2040, 156, 68, RAIL_H), kit.AppRail(RAIL_H, { app: 'tracker' }), 0, 0)
kit.at(kit.Frame('Navigator', 2148, 156, 280, RAIL_H), kit.Navigator(RAIL_H, { title: 'Tracker', newLabel: 'New issue', nav }), 0, 0)
kit.at(kit.Frame('Widget bar', 2468, 156, 57, RAIL_H), kit.Sidebar(RAIL_H, { selected: 'love/office' }), 0, 0)
{
  const header = kit.Frame('Space header', 2040, 1320, 1560, 114)
  kit.SpaceHeader(header, { view: 'list', title: 'Issues', titleIcon: 'tracker/issues' })
}
await kit.settle()
