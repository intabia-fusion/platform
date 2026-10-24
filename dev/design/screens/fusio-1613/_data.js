// Derived data for the FUSIO-1613 to-be screens: everything comes from DEMO.ru
// (tests/demo-ws via `design:demo` plus dev/design/demo/ru); nothing is stored here.
// Russian plural: pl(2, 'задача', 'задачи', 'задач')
const pl = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many)

const BOARD = (() => {
  const d = DEMO.ru
  const byKey = (key) => d.boards.find((b) => b.key === key)
  const main = byKey('main')
  const issues = d.projects.filter((p) => main.projects.includes(p.id)).flatMap((p) => p.issues)
  const person = (name) => d.people.find((p) => p.name === name)
  const avatar = (name) => [person(name).initials, person(name).color]
  const category = (status) => d.statuses.find((s) => s.name === status)?.category
  const count = (status) => issues.filter((i) => i.status === status).length
  const columnOf = (status) => main.columns.findIndex((c) => c.statuses.includes(status))
  // Board filter with operators: eq/in match, not negates
  const passes = (issue, f) => {
    const has = f.field === 'priority' ? f.value.map((v) => v.toLowerCase()).includes(issue.priority) : f.field === 'status' ? f.value.includes(issue.status) : true
    return f.op === 'not' ? !has : has
  }
  const cond = (issue, f) => {
    if (f.field === 'priority') return f.value.map((v) => v.toLowerCase()).includes(issue.priority)
    if (f.field === 'status') return f.value.includes(issue.status)
    return true
  }
  const card = (i, o = {}) => ({
    id: i.id,
    cat: category(i.status),
    title: i.title,
    priority: i.priority,
    ...(i.assignee !== undefined ? { assignee: avatar(i.assignee) } : {}),
    ...(i.sub !== undefined ? { sub: i.sub.join('/') } : {}),
    ...(i.component !== undefined ? { component: i.component } : {}),
    ...(i.milestone !== undefined ? { milestone: i.milestone } : {}),
    ...(i.labels !== undefined ? { labels: i.labels } : {}),
    ...(i.estimation !== undefined ? { est: i.estimation + 'h' } : {}),
    ...o
  })
  // Board columns with [status, category, issue count] per status
  const columns = main.columns.map((c) => ({
    name: c.title,
    cat: c.category,
    ...(c.limit ? { limit: c.limit } : {}),
    statuses: c.statuses.map((s) => [s, category(s), count(s)])
  }))
  const mapped = main.columns.flatMap((c) => c.statuses)
  // Rules without a time condition decide the lane of a card
  const rules = main.swimlanes.filter((l) => l.filter !== undefined && l.filter.every((f) => f.field !== 'inStatus'))
  const accents = main.colorRules.map((r) => ({ status: r.filter[0].value[0], color: r.color }))
  // Lane cells: cards per board column, at most `cap` in a cell
  const lane = (lane, take, cap = 2) => {
    const cells = main.columns.map(() => [])
    for (const i of issues) {
      const ci = columnOf(i.status)
      if (ci < 0 || !take(i) || cells[ci].length >= cap) continue
      const acc = accents.find((a) => a.status === i.status)
      cells[ci].push(card(i, acc !== undefined ? { accent: P(acc.color) } : {}))
    }
    return cells
  }
  return {
    project: `${d.projects.find((p) => p.id === main.projects[0]).name} · ${main.projects[0]}`,
    projectNames: main.projects.map((id) => `${d.projects.find((p) => p.id === id).name} · ${id}`),
    filterCount: { matching: issues.filter((i) => main.filter.every((f) => passes(i, f))).length, total: issues.length },
    main,
    boards: d.boards,
    components: d.components,
    people: d.people.map((p) => [p.initials, p.color]),
    author: { name: main.author, avatar: avatar(main.author) },
    editors: main.editors.map((n) => ({ name: n, avatar: avatar(n) })),
    columns,
    // Closed statuses (won/lost) without a column leave the board by design, only open ones are a warning
    unmapped: d.statuses.filter((s) => !mapped.includes(s.name) && !['won', 'lost'].includes(s.category)).map((s) => [s.name, s.category, count(s.name)]),
    // The lanes drawn on the board: the first rule lane and the catch-all one
    lanes: [rules[0], main.swimlanes.find((l) => l.rest)].map((l) => ({
      name: l.title,
      ...(l.hint ? { hint: l.hint } : {}),
      count: issues.filter((i) => (l.rest ? !rules.some((r) => r.filter.every((f) => cond(i, f))) : l.filter.every((f) => cond(i, f))) && columnOf(i.status) >= 0).length,
      cards: lane(l, (i) => (l.rest ? !rules.some((r) => r.filter.every((f) => cond(i, f))) : l.filter.every((f) => cond(i, f))))
    })),
    // Card for previews: a demo issue plus extra fields
    issue: (id, o) => card(issues.find((i) => i.id === id), o),
    total: (c) => c.statuses.reduce((n, it) => n + it[2], 0)
  }
})()

const PROJECT_TABS = [['Основное', 'gear'], ['Участники и доступ', 'users'], ['Задачи', 'check'], ['Статусы и workflow', 'timeline'], ['Архив', 'trash']]

// Navigator: "Доски" opens the default board, the boards pinned by the user sit under it, then the projects.
// selectedBoard: key of the open board (a pinned one is selected on its own, any other selects "Доски")
const projectNav = (selectedBoard) => {
  const d = DEMO.ru
  const pinned = d.boards.filter((b) => b.pinned)
  const onPinned = pinned.some((b) => b.key === selectedBoard)
  const nav = [{ item: 'My issues', icon: 'timeline' }, { item: 'All issues', icon: 'check' }, { item: 'Доски', icon: 'board', selected: selectedBoard !== undefined && !onPinned }]
  for (const b of pinned) nav.push({ item: b.title, indent: true, selected: b.key === selectedBoard })
  nav.push({ group: 'Your projects', add: true })
  for (const id of BOARD.main.projects) {
    nav.push({ space: d.projects.find((p) => p.id === id).name })
    nav.push({ item: 'Issues', icon: 'check', indent: true }, { item: 'Components', icon: 'component', indent: true }, { item: 'Milestones', icon: 'milestone', indent: true })
  }
  return nav
}
