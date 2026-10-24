// Current workspace settings (plugins/setting-resources): the settings app with its navigator and the General and Members pages.
// Geometry follows the sanity stand at 1920x1080; data is the demo workspace (DEMO.en).
await kit.page('Workspace settings')
const nav = [
  { item: 'Account settings', icon: 'setting/accountSettings' },
  { item: 'Change password', icon: 'setting/password' },
  { item: 'Integrations', icon: 'setting/integration' },
  { item: 'Notifications', icon: 'notification/notifications' },
  { item: 'Auto translation', icon: 'view/translate' },
  { item: 'Calendar', icon: 'calendar/calendar' },
  { item: 'Office', icon: 'love/office' },
  { item: 'Sidebar Menu Settings', icon: 'setting/settings' },
  { item: 'Mailboxes', icon: 'setting/mailbox' },
  { item: 'AI settings', icon: 'view/ai-star' },
  { caption: 'Workspace settings' },
  { item: 'General', icon: 'setting/settings' },
  { item: 'Billing', icon: 'billing/billing' },
  { item: 'Backup', icon: 'setting/settings' },
  { item: 'API + Webhooks', icon: 'setting/settings' },
  { item: 'Members', icon: 'setting/owners' },
  { item: 'Trainings', icon: 'training/training' },
  { item: 'Configure', icon: 'setting/settings' },
  { item: 'Text Templates', icon: 'templates/templates' },
  { item: 'Related issues', icon: 'tracker/relations' },
  { item: 'Classes', icon: 'setting/clazz' },
  { item: 'Tag Relations', icon: 'setting/relation' },
  { item: 'Enums', icon: 'setting/enums' }
]
const footer = [
  { item: 'Select workspace', icon: 'setting/selectWorkspace' },
  { item: 'Invite to workspace', icon: 'setting/inviteWorkspace' },
  { item: 'Sign out', icon: 'setting/signout' }
]
const BODY = T('content-color')
const settingsPage = (name, y, selected, title, icon) => {
  const items = nav.map((n) => (n.item === selected ? { ...n, selected: true } : n))
  const { main } = kit.Workbench(name, 0, y, { tab: 'Settings', tabIcon: 'setting/settings', app: 'settings', nav: items, footer, title: 'Settings', newLabel: null })
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
  const main = settingsPage('General', 0, 'General', 'Workspace settings', 'setting/settings')
  const page = kit.box('Content', { w: 1024, h: 10, dir: 'column', gap: 16, vs: 'auto' })
  const text = (t) => kit.text(t, { size: 14, lh: 1.3125, color: BODY })
  const row = (...kids) => kit.add(kit.row('row', 16), kids)
  kit.add(
    page,
    section('Workspace', true, row(kit.Avatar('S', 'Blueberry', 40), kit.EditBox('sanity-ws'), kit.ClassicButton({ kind: 'ghost', size: 'small', icon: 'ui/Edit' }))),
    section('Password aging rule', false, row(text('Number of days after which users will be required to change their password.'), kit.Toggle(false))),
    section('Calendar', false, row(text('Start of the week'), kit.ClassicButton({ label: 'System Setup (monday)' }))),
    section('Access control', false, kit.ClassicButton({ label: 'Disable role-based access control' })),
    section('Import documents', false, row(text('Grants users ability to import documents into the workspace'), kit.ClassicButton({ size: 'large', icon: 'contact/Members', label: 'Select users' }))),
    section('Reports', false, row(text('Allow members to report messages and other members'), kit.Toggle(false))),
    section('Danger zone', false, kit.ClassicButton({ kind: 'dangerous', label: 'Delete workspace' }))
  )
  kit.at(main, page, 246, 81)
}

// ---- Members --------------------------------------------------------------------------------
{
  const main = settingsPage('Members', 1200, 'Members', 'Members', 'setting/owners')
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
