// Current project edit popup of the tracker (plugins/tracker-resources EditProject): the dialog over the dimmed workbench.
// Geometry follows the sanity stand at 1920x1080; data is the demo workspace (DEMO.en).
await kit.page('Project settings')
const project = DEMO.en.projects.find((p) => p.id === 'APP')
const nav = [
  { item: 'My issues', icon: 'tracker/myissues' },
  { item: 'All issues', icon: 'tracker/issues' },
  { divider: true },
  { item: 'All projects', icon: 'tracker/list' },
  { item: 'Labels', icon: 'tracker/labels' },
  { group: 'Your projects', add: true },
  { space: project.name, icon: 'tracker/home', color: 'Porpoise' },
  { item: 'Issues', icon: 'tracker/issues', indent: true },
  { item: 'Components', icon: 'tracker/components', indent: true },
  { item: 'Milestones', icon: 'tracker/milestone', indent: true },
  { item: 'Templates', icon: 'tracker/issuetemplates', indent: true }
]
const BODY = T('theme-content-color')
const { frame } = kit.Workbench('Edit project', 0, 0, { tab: 'Tracker', nav })
kit.at(frame, kit.box('Overlay', { w: 1920, h: 1080, fill: '#00000033' }), 0, 0)
const { modal, body } = kit.Modal('Edit project', { w: 600 })
const people = DEMO.en.people
const label = (t) => kit.text(t, { size: 13, lh: 1.3125, color: BODY })
const members = kit.box('Members avatars', { w: 42, h: 20 })
people.slice(0, 3).forEach((p, i) => kit.at(members, kit.Avatar(p.initials, p.color, 20), i * 11, 0))
kit.add(
  body,
  kit.GridRow('Project type', kit.ClassicButton({ size: 'large', disabled: true, icon: 'task/manage-templates', label: 'Default' }), { w: 550 }),
  kit.GridRow('Project title', kit.EditBox(project.name, { kind: 'large-style', w: 310 }), { padded: true }),
  kit.GridRow('Identifier', kit.EditBox(project.id, { kind: 'large-style', w: 310 }), { hint: 'Used in issue IDs', padded: true }),
  kit.GridRow('Description', kit.EditBox(project.description.replace('\n', ' '), { kind: 'editbox', w: 310 }), { alignTop: true, padded: true, last: true }),
  kit.GridRow('Choose icon', kit.ClassicButton({ size: 'large', icon: 'tracker/home' })),
  kit.GridRow('Default assignee for issues', kit.ClassicButton({ size: 'large', icon: 'contact/Person', label: 'Assignee' })),
  kit.GridRow('Default issue status', kit.ClassicButton({ size: 'large', content: kit.add(kit.row('status', 8), kit.StatusIcon('backlog', 13), label('Backlog')) })),
  kit.GridRow('Owners', kit.ClassicButton({ size: 'large', content: kit.add(kit.row('owner', 8), kit.Avatar(people[0].initials, people[0].color, 20), label(people[0].name)) })),
  kit.GridRow('Make private', kit.Toggle(false), { hint: 'Only members can see it' }),
  kit.GridRow('Members', kit.ClassicButton({ size: 'large', content: kit.add(kit.row('members', 6), members, label('3 members')) })),
  kit.GridRow('Auto join', kit.Toggle(false), { hint: 'Automatically join new employees to this space' }),
  kit.GridRow('Workflows', kit.Button({ kind: 'secondary', size: 'large', icon: 'setting/settings' }), { hint: 'Workflow Mapping', last: true })
)
kit.at(frame, modal, 660, 132)
await kit.settle()
