// Current tracker issue list (IssuesView.svelte, tracker.viewlet.IssueList): All issues of a project grouped by status.
// Layout follows sanity-ws / DefaultProject on the sanity stand; data is the demo workspace (DEMO.en, tests/demo-ws-en).
// A build entry may define VIEW (page, frame, title, titleIcon, tabs, tab, myIssues, assignee) before this script;
// the screen ends in a tail script (tracker-issues-end.js or tracker-new-issue.js)
const view = typeof VIEW === 'object' ? VIEW : {}
await kit.page(view.page ?? 'Tracker issues')
const project = DEMO.en.projects.find((p) => p.id === 'APP')
const people = new Map(DEMO.en.people.map((p) => [p.name, p]))
const { frame, main } = kit.Workbench(view.frame ?? 'Issues list', 0, 0, {
  tab: 'Tracker',
  nav: [
    { item: 'My issues', icon: 'kit/Crosshair', selected: view.myIssues === true },
    { item: 'All issues', icon: 'kit/CheckSquare' },
    { divider: true },
    { item: 'All projects', icon: 'kit/BulletList' },
    { item: 'Labels', icon: 'kit/Tags' },
    { group: 'Your projects', add: true },
    { space: project.name, icon: 'kit/HouseFill', color: 'Porpoise' },
    { item: 'Issues', icon: 'kit/CheckSquare', selected: view.myIssues !== true, indent: true },
    { item: 'Components', icon: 'kit/Diamond', indent: true },
    { item: 'Milestones', icon: 'kit/Signpost', indent: true },
    { item: 'Templates', icon: 'kit/Layout', indent: true }
  ]
})
const top = kit.SpaceHeader(main, { view: 'list', title: view.title ?? 'Issues', titleIcon: view.titleIcon ?? 'kit/CheckSquare', tabs: view.tabs, tab: view.tab })
const CREATED = ['2 days ago', '3 days ago', 'yesterday', '5 days ago', '2 weeks ago']
const MODIFIED = ['Oct 21', 'Oct 18', 'Oct 22', 'Oct 15', 'Oct 9']
let n = 0
const groups = ['In Progress', 'Todo', 'Backlog', 'Done', 'Canceled'].map((name) => {
  const st = DEMO.en.statuses.find((s) => s.name === name)
  const issues = project.issues.filter((i) => i.status === name && (view.assignee === undefined || i.assignee === view.assignee)).map((i) => {
    const person = people.get(i.assignee)
    n++
    return {
      id: i.id,
      cat: st.category,
      title: i.title,
      priority: i.priority,
      ...(person !== undefined ? { assignee: [person.initials, person.color] } : {}),
      ...(i.sub !== undefined ? { sub: i.sub.join('/') } : {}),
      ...(i.component !== undefined ? { component: i.component } : {}),
      ...(i.milestone !== undefined ? { milestone: i.milestone } : {}),
      ...(i.labels !== undefined ? { labels: i.labels } : {}),
      ...(i.estimation !== undefined ? { est: i.estimation + 'h' } : {}),
      created: CREATED[n % CREATED.length],
      modified: MODIFIED[n % MODIFIED.length]
    }
  })
  const est = project.issues.filter((i) => i.status === name && (view.assignee === undefined || i.assignee === view.assignee)).reduce((sum, i) => sum + (i.estimation || 0), 0)
  return { name, cat: st.category, color: st.color, estimation: est + 'h', issues }
})
kit.at(main, kit.IssueList(groups, main.width - 34), 17, 129)
