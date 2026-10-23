// Current chat (plugins/chunter-resources): a channel with messages and the input.
// Geometry follows the sanity stand at 1920x1080; data is the demo workspace (DEMO.en).
await kit.page('Chat')
const nav = [
  { item: 'Threads', icon: 'chunter/thread' },
  { item: 'Saved', icon: 'chunter/bookmarks' },
  { item: 'Browser', icon: 'chunter/chunterbrowser' },
  { item: 'Channels & DMs', icon: 'chunter/channelbrowser' },
  { divider: true, tight: true },
  { caption: 'Channels', chevron: true, menu: true, compact: true, noDivider: true },
  { item: 'random', icon: 'chunter/hashtag', object: true },
  { item: 'general', icon: 'chunter/hashtag', object: true, selected: true },
  { caption: 'Direct messages', menu: true, compact: true, noDivider: true }
]
const { main } = kit.Workbench('Channel', 0, 0, { tab: 'general', tabIcon: 'chunter/hashtag', app: 'chunter', title: 'Chat', newLabel: null, tools: ['ui/Search', 'ui/Edit'], nav })
const tool = (icon, size) => kit.ClassicButton({ kind: 'icon', size: 'medium', icon, iconSize: size })
kit.PanelHeader(main, { title: 'general', icon: 'chunter/hashtag', divided: true, actions: [tool('ui/Search', 16), tool('ui/ToDetails', 16), tool('ui/Settings', 20)] })

const people = DEMO.en.people
const W = main.width - 2
const list = [
  ['date', 'Tuesday March 29', 33],
  ['new', '', 16],
  ['msg', { author: people[0].name, time: '10:12 AM', text: 'The new column is in, please check the order.', initials: people[0].initials, color: people[0].color }, 62],
  ['msg', { author: people[1].name, time: '10:15 AM', text: 'The order is right. Set the In Progress limit to 8?', initials: people[1].initials, color: people[1].color }, 62],
  ['date', 'Wednesday May 08', 33],
  ['msg', { author: people[2].name, time: '1:21 AM', text: 'Yes, 8. I will set it on the Boards tab.', initials: people[2].initials, color: people[2].color }, 62]
]
const height = list.reduce((s, it) => s + it[2], 0)
const messages = kit.box('Messages', { w: W, h: height, dir: 'column' })
for (const [kind, v] of list) {
  if (kind === 'date') kit.add(messages, kit.DateSeparator(v, W))
  else if (kind === 'new') kit.add(messages, kit.NewMarker(W))
  else kit.add(messages, kit.Message({ ...v, w: W }))
}
// The input and its typing row (112 px) sit at the bottom, the list ends 16 px above
kit.at(main, messages, 1, main.height - 112 - 16 - height + 1)
kit.at(main, kit.MessageInput({ w: W - 32 }), 17, main.height - 112 + 1)
await kit.settle()
