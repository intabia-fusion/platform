// Current tracker kanban (KanbanView.svelte, tracker.viewlet.IssueKanban); FUSIO-1613 shows it as its as-is page.
// Layout follows sanity-ws / DefaultProject on the sanity stand; data is the demo workspace (DEMO.en, tests/demo-ws-en).
// A build entry may define PAGE_NAME before this script to name the page.
await kit.page(typeof PAGE_NAME === 'string' ? PAGE_NAME : 'Tracker')
const project = DEMO.en.projects.find((p) => p.id === 'APP')
const people = new Map(DEMO.en.people.map((p) => [p.name, p]))
const { frame, main } = kit.Workbench('Kanban board', 0, 0, {
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
const top = kit.SpaceHeader(main, { view: 'board', title: 'Issues', titleIcon: 'kit/CheckSquare' })
const board = kit.box('Kanban', { w: main.width - 2, h: main.height - top - 1, dir: 'row', pad: [24, 0, 0, 24] })
// The project's own workflow: the first five statuses, the rest belong to the board columns
const cols = DEMO.en.statuses.slice(0, 5).map((st) => {
  const all = project.issues.filter((i) => i.status === st.name)
  // The first cards only: a column is cut at the bottom of the screen
  const cards = all.slice(0, 4).map((i) => {
    const parent = project.issues.find((p) => p.id === i.parent)
    const person = people.get(i.assignee)
    return {
      id: i.id,
      cat: st.category,
      title: i.title,
      priority: i.priority,
      ...(parent !== undefined ? { parent: parent.title.length > 30 ? parent.title.slice(0, 30) + '…' : parent.title } : {}),
      ...(person !== undefined ? { assignee: [person.initials, person.color] } : {}),
      ...(i.sub !== undefined ? { sub: i.sub.join('/') } : {}),
      ...(i.component !== undefined ? { component: i.component } : {}),
      ...(i.milestone !== undefined ? { milestone: i.milestone } : {}),
      ...(i.labels !== undefined ? { labels: i.labels } : {}),
      ...(i.estimation !== undefined ? { est: i.estimation + 'h', estLabel: 'Estimation' } : {})
    }
  })
  return { name: st.name, cat: st.category, count: all.length, cards, ...(st.name === 'In Progress' ? { tools: true } : {}) }
})
for (const col of cols) kit.add(board, kit.KanbanColumn(col, 320, board.height - 32))
kit.at(main, board, 2, top + 1)
await kit.settle()
return frame.id
