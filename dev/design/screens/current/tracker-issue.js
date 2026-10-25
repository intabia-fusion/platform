// Current tracker issue page (EditIssue, popup Panel over the workbench): description, sub-issues, activity and properties.
// Layout follows sanity-ws / DefaultProject on the sanity stand; data is the demo workspace (DEMO.en, tests/demo-ws-en).
await kit.page('Tracker issue')
const project = DEMO.en.projects.find((p) => p.id === 'APP')
const people = new Map(DEMO.en.people.map((p) => [p.name, p]))
const { frame, main } = kit.Workbench('Issue page', 0, 0, {
  tab: 'Tracker',
  nav: [
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
})
const issue = project.issues.find((i) => i.id === 'APP-3')
const st = DEMO.en.statuses.find((s) => s.name === issue.status)
const person = (name) => { const p = people.get(name); return [p.initials, p.color, p.name] }
const subIssue = (i) => {
  const s = DEMO.en.statuses.find((x) => x.name === i.status)
  return {
    id: i.id,
    cat: s.category,
    color: s.color,
    title: i.title,
    priority: i.priority,
    assignee: person(i.assignee),
    ...(i.component !== undefined ? { component: i.component } : {}),
    ...(i.estimation !== undefined ? { est: i.estimation + 'h' } : {}),
    created: '2 days ago',
    modified: 'Oct 21'
  }
}
const created = 'Oct 20 2026 3:23 AM'
kit.at(main, kit.IssuePage({
  id: issue.id,
  cat: st.category,
  color: st.color,
  statusName: st.name,
  title: issue.title,
  priority: issue.priority,
  assignee: person(issue.assignee),
  creator: person('Maria Cole'),
  project: project.name,
  component: issue.component,
  milestone: issue.milestone,
  est: issue.estimation + 'h',
  description: 'Send a push notification to the customer when the status of an order changes.',
  subIssues: project.issues.filter((i) => i.parent === issue.id).map(subIssue),
  activity: [{ time: '3:23', text: 'Title set to', strong: issue.title }],
  created
}, main.width, main.height), 1, 1)
await kit.settle()
return frame.id
