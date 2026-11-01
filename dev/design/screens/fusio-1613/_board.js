// Shared by the board screens 02 and 02b: the board frame and its popups

const notSeen = BOARD.unmapped.reduce((n, it) => n + it[2], 0)
const noColumn = `${BOARD.unmapped.length} ${pl(BOARD.unmapped.length, 'статус', 'статуса', 'статусов')} без колонки · ${notSeen} ${pl(notSeen, 'задача не видна', 'задачи не видны', 'задач не видны')}`
const cw = 234
const shownColumns = [1, 2, 3, 4, 5, 9]
const unit = (n) => pl(n, 'задача', 'задачи', 'задач')

// o.cell(cards, col, lane): a custom lane cell, o.column(col): extra options of a column box (state frames of 02f)
function boardView (title, x, y, o = {}) {
  const { frame, main } = kit.Workbench(title, x, y, { tab: BOARD.main.title, nav: projectNav('main') })
  const selector = kit.Button({ kind: 'ghost', size: 'small', icon: 'board', label: BOARD.main.title, menu: true, name: 'Board selector' })
  const top = kit.SpaceHeader(main, {
    view: 'board',
    titleNode: selector,
    actions: [
      kit.Notice(noColumn, 'warning', { pill: true }),
      kit.Button({ kind: 'ghost', size: 'medium', icon: 'gear', label: 'Настройки доски', name: 'Board settings' })
    ],
    filters: [kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') }), BOARD.main.quickFilters.filter((q) => q.filter.every((f) => f.field !== 'relation')).map((q, i) => kit.QuickFilter(q.title, i === 2))],
    tabs: []
  })

  const cols = shownColumns.map((i, n) => {
    const c = BOARD.columns[i]
    const count = BOARD.total(c)
    return { name: c.name, cat: c.cat, count, ...(c.limit ? { limit: c.limit, over: count > c.limit } : {}) }
  })
  const lanes = BOARD.lanes.map((l) => ({ ...l, cards: shownColumns.map((i) => l.cards[i]) }))
  const bw = main.width - 32
  const board = kit.box('Board', { w: main.width, h: main.height - top, dir: 'column', gap: 8, pad: [12, 16, 0, 16] })
  const hdr = kit.box('Column headers', { w: bw, h: 10, dir: 'row', gap: 12, vs: 'auto' })
  for (const col of cols) {
    const c = kit.box('Column ' + col.name, { w: cw, h: 10, dir: 'column', gap: 6, vs: 'auto', ...o.column?.(col) })
    kit.add(hdr, kit.add(c, kit.ColumnHeader(col.name, col.cat, col.count, cw, col)))
  }
  kit.add(board, hdr)
  for (const lane of lanes) {
    const lh = kit.box('Swimlane ' + lane.name, { w: bw, h: 32, dir: 'row', gap: 8, pad: [0, 8, 0, 8], align: 'center', radius: 4, fill: T('theme-list-row-color') })
    kit.add(lh, kit.icon('chevronD'), kit.text(lane.name, { size: 14, weight: 600 }), kit.Count(lane.count))
    if (lane.hint) kit.add(lh, kit.text(lane.hint, { size: 12, color: T('theme-darker-color') }))
    const row = kit.box('Lane cells', { w: bw, h: 10, dir: 'row', gap: 12, vs: 'auto' })
    for (const [n, cards] of lane.cards.entries()) {
      const cell = o.cell?.(cards, cols[n], lane) ?? kit.add(kit.box('cell', { w: cw, h: 40, dir: 'column', gap: 8, vs: 'auto' }), cards.map((d) => kit.IssueCard(d, cw)))
      kit.add(row, cell)
    }
    kit.add(board, lh, row)
  }
  kit.at(main, board, 0, top)

  // Answers "why this color": only the card border rules are settings
  const legend = kit.box('Color legend', { w: bw, h: 28, dir: 'row', gap: 20, align: 'center', hs: 'fix', vs: 'auto', wrap: true })
  const item = (swatch, text) => kit.add(kit.row('legend item', 6), swatch, kit.text(text, { size: 12, color: T('theme-dark-color') }))
  const catSwatch = (cat) => kit.Swatch(PB(kit.CATEGORY[cat]), 14)
  kit.add(legend, kit.text('Цвета', { size: 12, weight: 600, color: T('theme-dark-color') }),
    kit.add(kit.row('header categories', 4), catSwatch('todo'), catSwatch('active'), catSwatch('won'), kit.text('заголовок колонки - категория её статусов', { size: 12, color: T('theme-dark-color') })))
  for (const c of cols.filter((it) => it.over)) kit.add(legend, item(kit.Swatch(T('theme-state-negative-background-color'), 14), `${c.name}: превышен WIP-лимит (${c.count} из ${c.limit})`))
  for (const r of BOARD.main.colorRules) kit.add(legend, item(kit.Swatch(P(r.color), 14), `рамка карточки: статус ${r.filter[0].value[0]}`))
  kit.at(main, legend, 16, main.height - 44)
  return { frame, main, selector, top }
}

const tipBox = (text, w) => {
  const tip = kit.box('Tooltip', { w, h: 28, dir: 'row', pad: [0, 10, 0, 10], align: 'center', radius: 4, fill: T('theme-tooltip-bg') })
  return kit.add(tip, kit.text(text, { size: 12, color: T('theme-tooltip-color') }))
}
const popup = (name, w) => {
  const p = kit.box(name, { w, h: 10, dir: 'column', gap: 10, pad: [16, 16, 16, 16], vs: 'auto', radius: 8, fill: T('theme-popup-color'), stroke: T('theme-popup-divider') })
  p.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: { color: '#000000', opacity: 0.15 } }]
  return p
}

