// Current workspace settings (plugins/setting-resources): the settings app with its navigator and the General and Members pages.
// Geometry follows the sanity stand at 1920x1080; data is the demo workspace (DEMO.en).
await kit.page('Workspace settings')
const nav = [
  { item: 'Account settings', icon: 'kit/Person' },
  { item: 'Change password', icon: 'kit/Key' },
  { item: 'Integrations', icon: 'kit/Cube' },
  { item: 'Notifications', icon: 'kit/Bell' },
  { item: 'Auto translation', icon: 'kit/Translate' },
  { item: 'Calendar', icon: 'kit/Calendar' },
  { item: 'Office', icon: 'kit/Building' },
  { item: 'Sidebar Menu Settings', icon: 'kit/Gear' },
  { item: 'Mailboxes', icon: 'kit/Mailbox' },
  { item: 'AI settings', icon: 'kit/Sparkle' },
  { caption: 'Workspace settings' },
  { item: 'General', icon: 'kit/Gear' },
  { item: 'Billing', icon: 'kit/Receipt' },
  { item: 'Backup', icon: 'kit/Gear' },
  { item: 'API + Webhooks', icon: 'kit/Gear' },
  { item: 'Members', icon: 'kit/People' },
  { item: 'Trainings', icon: 'kit/NotebookQuestion' },
  { item: 'Configure', icon: 'kit/Gear' },
  { item: 'Text Templates', icon: 'kit/BubblePlus' },
  { item: 'Related issues', icon: 'kit/ArrowsLeftRight' },
  { item: 'Classes', icon: 'kit/Code' },
  { item: 'Tag Relations', icon: 'kit/ArrowsHorizontal' },
  { item: 'Enums', icon: 'kit/BulletList' }
]
const footer = [
  { item: 'Select workspace', icon: 'kit/ArrowIn' },
  { item: 'Invite to workspace', icon: 'kit/PersonPlus' },
  { item: 'Sign out', icon: 'kit/ArrowOut' }
]
const BODY = T('content-color')
const settingsPage = (name, y, selected, title, icon) => {
  const items = nav.map((n) => (n.item === selected ? { ...n, selected: true } : n))
  const { main } = kit.Workbench(name, 0, y, { tab: 'Settings', tabIcon: 'kit/Gear', app: 'settings', nav: items, footer, title: 'Settings', newLabel: null })
  kit.PanelHeader(main, { title, icon })
  return main
}
const sectionTitle = (text) => kit.text(text, { size: 16, weight: 500, lh: 1.3125, color: BODY })
const section = (title, first, ...content) => {
  const s = kit.box('Section ' + title, { w: 1024, h: 10, dir: 'column', gap: 16, pad: [first ? 0 : 24, 0, 0, 0], vs: 'auto' })
  return kit.add(s, sectionTitle(title), content)
}

// ---- General --------------------------------------------------------------------------------
{
  const main = settingsPage('General', 0, 'General', 'Workspace settings', 'kit/Gear')
  const page = kit.box('Content', { w: 1024, h: 10, dir: 'column', gap: 16, vs: 'auto' })
  const text = (t) => kit.text(t, { size: 14, lh: 1.3125, color: BODY })
  const row = (...kids) => kit.add(kit.row('row', 16), kids)
  kit.add(
    page,
    section('Workspace', true, row(kit.Avatar('S', 'Blueberry', 40), kit.EditBox('sanity-ws'), kit.ClassicButton({ kind: 'ghost', size: 'small', icon: 'kit/PencilLine' }))),
    section('Password aging rule', false, row(text('Number of days after which users will be required to change their password.'), kit.Toggle(false))),
    section('Calendar', false, row(text('Start of the week'), kit.ClassicButton({ label: 'System Setup (monday)' }))),
    section('Access control', false, kit.ClassicButton({ label: 'Disable role-based access control' })),
    section('Import documents', false, row(text('Grants users ability to import documents into the workspace'), kit.ClassicButton({ size: 'large', icon: 'kit/People', label: 'Select users' }))),
    section('Reports', false, row(text('Allow members to report messages and other members'), kit.Toggle(false))),
    section('Danger zone', false, kit.ClassicButton({ kind: 'dangerous', label: 'Delete workspace' }))
  )
  kit.at(main, page, 246, 81)
}

// ---- Members --------------------------------------------------------------------------------
{
  const main = settingsPage('Members', 1200, 'Members', 'Members', 'kit/People')
  const page = kit.box('Content', { w: 1024, h: 10, dir: 'column', vs: 'auto' })
  DEMO.en.people.slice(0, 2).forEach((p, i) => {
    const r = kit.box('Member ' + p.name, { w: 1024, h: 48, dir: 'row', pad: [8, 8, 8, 8], align: 'center' })
    const who = kit.box('who', { w: 320, h: 32, dir: 'row', gap: 8, pad: [4, 4, 4, 4], align: 'center' })
    kit.add(who, kit.Avatar(p.initials, p.color, 24), kit.text(p.name, { size: 14, lh: 1.3125, color: T('theme-caption-color') }))
    kit.add(page, kit.add(r, who, kit.ClassicButton({ kind: 'primary', label: 'Owner', menu: true, disabled: i === 0 })))
  })
  kit.at(main, page, 246, 81)
}
await kit.settle()
