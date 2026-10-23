// FUSIO-1613: a configured board. Columns group statuses; WIP limits, quick filters,
// swimlanes and card colors come from the board settings, which open from the "Настройки доски" button in the header.
await kit.page('2. Доска (to-be)')

const view = boardView('Доска - вид', 0, 0)

await kit.settle()
return [view.frame.id]
