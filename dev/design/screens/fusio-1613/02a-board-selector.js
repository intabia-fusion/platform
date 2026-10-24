// FUSIO-1613: board with the selector open (second script of page 2, one board per script: 120 s limit).
await kit.page('2. Доска (to-be)', { keep: true })

// Selector open: boards of the project, of several projects, personal ones
const sel = boardView('Доска - выбор доски', 2020, 0)
const single = BOARD.boards.filter((b) => b.visibility === 'all' && b.projects.length === 1)
// A board pinned to the navigator shows it instead of its description
const hintOf = (b) => (b.pinned ? 'в навигаторе' : b.hint)
const pinIcon = (b) => (b.pinned ? 'view/pin' : 'board')
const shared = BOARD.boards.filter((b) => b.visibility === 'all' && b.projects.length > 1)
const menu = kit.Menu([
  { header: BOARD.project },
  ...single.map((b) => ({ label: b.title, icon: pinIcon(b), hint: hintOf(b) })),
  '-',
  { header: 'Несколько проектов' },
  ...shared.map((b) => ({ label: b.title, icon: 'board', selected: b.key === 'main', hint: b.projects.join(' · ') })),
  '-',
  { header: 'Мои доски' },
  ...BOARD.boards.filter((b) => b.visibility === 'me').map((b) => ({ label: b.title, icon: b.pinned ? 'view/pin' : 'star', hint: hintOf(b) })),
  '-',
  { label: 'Создать доску', icon: 'plus', accent: true },
  { label: 'Настройки доски', icon: 'gear' }
], { w: 320, name: 'Board selector popup' })
kit.at(sel.main, menu, 140, 46)

await kit.settle()
return [sel.frame.id]
