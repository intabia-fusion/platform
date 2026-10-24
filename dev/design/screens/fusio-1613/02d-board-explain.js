// FUSIO-1613: explanation of the "statuses without a column" notice (third script of page 2).
await kit.page('2. Доска (to-be)', { keep: true })

// Explanation of the "statuses without a column" notice
const explain = boardView('Доска - статусы без колонки', 0, 2400)
const pop = popup('Unmapped statuses popover', 380)
kit.add(pop,
  kit.text('Статусы без колонки', { size: 14, weight: 600 }),
  kit.text('Задачи в этих статусах не попадают ни в одну колонку, поэтому на доске их не видно. Добавьте статус в колонку, и задачи появятся.', { size: 13, color: T('theme-dark-color'), w: 348 }))
for (const [n, cat, cnt] of BOARD.unmapped) kit.add(pop, kit.StatusChip(n, cat, { count: cnt, w: 348, h: 32, size: 13, fill: T('theme-popup-color'), stroke: T('theme-button-border') }))
kit.add(pop, kit.add(kit.row('actions', 8), kit.Button({ size: 'small', icon: 'list', label: 'Показать задачи' }), kit.Button({ kind: 'primary', size: 'small', icon: 'plus', label: 'Добавить в колонку' })))
kit.at(explain.main, pop, explain.main.width - 97 - 380, 50)

await kit.settle()
return [explain.frame.id]
