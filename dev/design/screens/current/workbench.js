// Current workbench (plugins/workbench-resources Workbench.svelte): the shell and its main elements, one frame each.
// Geometry follows the sanity stand at 1920x1080; data is the demo workspace (DEMO.en).
await kit.page('Workbench')
const project = DEMO.en.projects.find((p) => p.id === 'APP')
const nav = [
  { item: 'My issues', icon: 'kit/Crosshair' },
  { item: 'All issues', icon: 'kit/CheckSquare' },
  { divider: true },
  { item: 'All projects', icon: 'kit/BulletList' },
  { item: 'Labels', icon: 'kit/Tags' },
  { group: 'Your projects', add: true },
  { space: project.name, icon: 'kit/HouseFill', color: 'Porpoise' },
  { item: 'Issues', icon: 'kit/CheckSquare', selected: true, indent: true },
  { item: 'Components', icon: 'kit/Diamond', indent: true },
  { item: 'Milestones', icon: 'kit/Signpost', indent: true },
  { item: 'Templates', icon: 'kit/Layout', indent: true }
]
const RAIL_H = 1044

// ---- Application shell, and with the chat open on the right ----------------------------------
{
  const { main } = kit.Workbench('Application shell', 0, 0, { tab: 'Tracker', nav })
  kit.SpaceHeader(main, { view: 'list', title: 'Issues', titleIcon: 'kit/CheckSquare' })
}
{
  const widgets = ['kit/Calendar', 'kit/Bubble', 'kit/Building', 'kit/Star', 'kit/Sparkle']
  const { main, panel } = kit.Workbench('Shell with side panel', 0, 1200, { tab: 'Tracker', nav, panel: { w: 400 }, selected: 'kit/Bubble', widgets })
  kit.SpaceHeader(main, { view: 'list', title: 'Issues', titleIcon: 'kit/CheckSquare' })
  // The chat widget uses the components of the channel view (screens/current/chat-channel.js)
  kit.PanelHeader(panel, { title: 'Chat', icon: 'kit/Bubble' })
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
kit.at(kit.Frame('Widget bar', 2468, 156, 57, RAIL_H), kit.Sidebar(RAIL_H, { selected: 'kit/Building' }), 0, 0)
{
  const header = kit.Frame('Space header', 2040, 1320, 1560, 114)
  kit.SpaceHeader(header, { view: 'list', title: 'Issues', titleIcon: 'kit/CheckSquare' })
}
await kit.settle()
