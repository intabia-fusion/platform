// FUSIO-1613: hover over a column header shows the statuses of the column (fourth script of page 2).
await kit.page('2. Доска (to-be)', { keep: true })

// The statuses are hidden under the header; the popover lists them with their counts
const column = shownColumns.indexOf(BOARD.columns.findIndex((c) => c.name === 'In Progress'))
const hover = boardView('Доска - статусы колонки', 2020, 2400)
const col = BOARD.columns[shownColumns[column]]
const pop = popup('Column statuses popover', 260)
kit.add(pop,
  kit.text('Статусы колонки', { size: 12, weight: 500, color: T('theme-darker-color') }))
for (const [n, cat, cnt] of col.statuses) kit.add(pop, kit.StatusChip(n, cat, { count: cnt, w: 228, h: 32, size: 13, fill: T('theme-popup-color'), stroke: T('theme-button-border') }))
kit.at(hover.main, pop, 16 + column * (cw + 12), 169)

await kit.settle()
return [hover.frame.id]
