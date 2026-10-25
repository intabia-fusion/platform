// FUSIO-1613: card states on the board - hover and keyboard focus, drag and drop.
// Each state is a board screen plus a frame of notes, moved from the hand-drawn frames of fusio-1613.pen.
// PAGE_NAME of a preceding script names the page.
await kit.page(typeof PAGE_NAME === 'string' ? PAGE_NAME : '2. Доска (to-be)', { keep: true })
{
  const ACCENT = T('accent-color-primary')
  const caption = T('theme-caption-color')
  const dark = T('theme-dark-color')
  const TAG = {
    product: ['как в продукте', T('theme-button-hovered'), dark],
    proposal: ['предложение', T('primary-button-disabled'), T('primary-button-default')],
    diff: ['расхождение', T('theme-state-negative-background-color'), T('theme-state-negative-color')]
  }
  const tag = (k) => kit.add(kit.box('tag ' + TAG[k][0], { dir: 'row', pad: [2, 6, 2, 6], radius: 4, fill: TAG[k][1], hs: 'auto', vs: 'auto' }), kit.text(TAG[k][0], { size: 11, weight: 600, color: TAG[k][2] }))
  const head = (text, size, tags = [], gap = 8) => kit.add(kit.row('head ' + text, gap), kit.text(text, { size, weight: 600, color: caption }), tags.map(tag))
  const small = (text, w) => kit.text(text, { size: 12, color: dark, w })
  const section = (title, tags, ...kids) => kit.add(kit.col('section ' + title, 12), head(title, 16, tags), kids)
  const notes = (w, rows) => section('Подписи', [], rows.map(([k, text]) =>
    kit.add(kit.box('note', { w, h: 19, dir: 'row', gap: 10, vs: 'auto' }), kit.add(kit.box('tag col', { w: 110, h: 19 }), tag(k)), kit.text(text, { size: 13, color: caption, w: w - 120 }))))
  const legend = (keys, text) => kit.add(kit.row('legend tags', 8), keys.map(tag), kit.text(text, { size: 13, color: dark }))
  // Lane cell of the accepted board: a tinted well, 8 px around the cards
  const well = (name, kids, o = {}) => kit.add(kit.box(name, { w: cw, h: 56, dir: 'column', gap: 8, pad: [8, 8, 8, 8], vs: kids.length > 0 ? 'auto' : 'fix', radius: 8, fill: T('theme-kanban-card-bg-color'), ...o }), kids)
  const card = (d, w = cw - 16) => kit.IssueCard(d, w)
  // A card outside a cell keeps its width in a frame; the frame does not clip the shadow
  const loose = (name, d, w, o = {}) => kit.add(kit.box(name, { w, dir: 'column', vs: 'auto', clip: false, ...o }), card(d, w))
  const callout = (name, text) => kit.add(kit.box(name, { w: 234, h: 28, dir: 'column', pad: [6, 10, 6, 10], vs: 'auto', radius: 4, fill: T('theme-tooltip-bg') }), kit.text(text, { size: 12, color: T('theme-tooltip-color'), w: 214 }))
  const notesFrame = (name, x, y, h) => {
    const frame = kit.Frame(name, x, y, 1356, h, { fill: T('theme-panel-color') })
    return kit.at(frame, kit.box(name, { w: 1260, dir: 'column', gap: 28, vs: 'auto' }), 48, 48)
  }
  const laneCards = BOARD.lanes.flatMap((l) => l.cards.flat())
  const byId = (id) => laneCards.find((d) => d.id === id)
  const plain = byId('MKT-4')
  // A card with a color rule border
  const ruled = byId('APP-27')

  // Hover and keyboard focus
  const focusView = boardView('Доска - наведение и фокус', 0, 0, {
    cell: (cards) => well('cell', cards.map((d) => card(d.id === ruled.id ? { ...d, focus: 'ring' } : d)))
  })
  kit.at(focusView.main, callout('Callout focus', 'Фокус клавиатуры на карточке с рамкой правила: кольцо снаружи, рамка внутри (предложение)'), 754, focusView.top + 700)

  const focusNotes = notesFrame('Аннотации - наведение и фокус', 1920, 0, 1795)
  const COLS = ['Обычное', 'Наведение', 'Фокус клавиатуры', 'Фокус + наведение']
  // Today the hover moves the focus, so a card under the mouse is focus + hover
  const now = [{}, { hover: true, focus: 'inset' }, { focus: 'inset' }, { hover: true, focus: 'inset' }]
  // Accepted 2026-10-26: the mouse focus looks like the keyboard one, the background never changes
  const proposal = [{}, { hover: true, focus: 'ring' }, { focus: 'ring' }, { hover: true, focus: 'ring' }]
  const ROWS = [
    ['Сейчас: обычная', ['product'], plain, now],
    ['Сейчас: рамка правила', ['product', 'diff'], ruled, now],
    ['Предложение: обычная', ['proposal'], plain, proposal],
    ['Предложение: рамка правила', ['proposal'], ruled, proposal]
  ]
  const matrix = kit.col('State matrix', 12)
  kit.add(matrix, kit.add(kit.row('matrix header', 16), kit.spacer(200, 1), COLS.map((c) => kit.text(c, { size: 13, weight: 600, color: caption, w: 234 }))))
  for (const [label, tags, d, states] of ROWS) {
    const name = kit.add(kit.box('row label', { w: 200, dir: 'column', gap: 6, vs: 'auto' }), kit.text(label, { size: 13, weight: 600, color: caption, w: 200 }), kit.add(kit.row('tags', 4), tags.map(tag)))
    kit.add(matrix, kit.add(kit.row('row ' + label, 16, { align: 'start' }), name, states.map((s, i) => well('cell ' + COLS[i], [card({ ...d, ...s })]))))
  }
  const densities = [['detailed', 'Подробно'], ['normal', 'Обычно'], ['compact', 'Компактно'], ['dense', 'Плотно']]
  const dense = kit.add(kit.row('density row', 16, { align: 'start' }), densities.map(([density, label]) =>
    kit.add(kit.box('density ' + label, { w: 250, dir: 'column', gap: 6, vs: 'auto' }), kit.text(label, { size: 13, color: dark }), well('cell', [card({ ...byId('APP-3'), density, focus: 'ring' }, 234)], { w: 250 }))))
  const edge = kit.add(kit.row('edge row', 24, { align: 'start' }),
    well('cell at edge', [card(plain, 234), card({ ...byId('MKT-6'), focus: 'ring' }, 234)], { w: 250 }),
    kit.text('Кольцу нужно 4 px снаружи карточки (2 px линия + 2 px зазор). Отступ ячейки 8 px и шаг между карточками 8 px вмещают его даже при обрезке ячейки (в примере clip включён).\nВ продукте вокруг карточки уже есть обёртка p-1 (4 px) и отступ ячейки 0.5rem (8 px), поэтому внешнее кольцо поместится без изменения отступов. Проверено по коду, не в браузере.', { size: 13, color: dark, w: 640 }))
  kit.add(focusNotes,
    kit.text('Карточка: наведение и фокус клавиатуры', { size: 22, weight: 600, color: caption }),
    legend(['product', 'proposal', 'diff'], '- метки у строк и подписей'),
    matrix,
    section('Фокус клавиатуры во всех плотностях', ['proposal'], dense),
    section('Кольцо у края колонки не обрезается', ['proposal', 'product'], edge),
    notes(1160, [
      ['product', 'Наведение мышью переносит фокус: mouseover/mouseenter карточки шлёт obj-focus, фокус списка встаёт на неё. Поэтому отдельного вида наведения нет: карточка под курсором = фокус + наведение. Фон фокус не меняет: кольца достаточно.'],
      ['product', 'Кольцо фокуса сейчас внутреннее: box-shadow inset 0 0 1px 1px primary-edit-border-color (#6B3AD3 в светлой теме intabia). Рамка карточки 1px theme-divider-color остаётся. Стрелки клавиатуры ставят тот же класс .selection.'],
      ['diff', 'Рамка цветового правила - inset 2px у вложенного .tracker-card. Вложенный блок рисуется поверх внутренней тени контейнера, поэтому у карточки с рамкой правила кольцо фокуса не видно. Вывод по коду, в браузере не проверял.'],
      ['proposal', 'Фокус клавиатуры - кольцо как в kit: 2px #6B3AD3 (accent Intabia2) с зазором 2px снаружи карточки, как :focus-visible у Button из ui-kit. Рамка правила остаётся внутри, кольцо снаружи: оба цвета видны.'],
      ['proposal', 'Наведение мышью ставит фокус и выглядит так же, как фокус клавиатуры: то же кольцо, фон карточки не меняется. Следующая стрелка идёт от карточки под курсором.']
    ]))

  // Drag and drop: MKT-5 goes from To Do to In Progress, Done does not take it
  const moved = byId('MKT-5')
  const target = BOARD.columns.find((c) => c.name === 'In Progress')
  const blocked = BOARD.columns.find((c) => c.name === 'Done')
  const plaque = () => kit.add(kit.box('Status on drop', { w: cw - 16, h: 22, dir: 'row', pad: [3, 8, 3, 8], align: 'center', vs: 'auto', radius: 4, fill: ACCENT }),
    kit.text('Статус станет: ' + target.statuses[0][0], { size: 12, weight: 600, color: '#FFFFFF' }))
  // While dragging every cell is a drop target; the cell under the card gets the accent border
  const dropCell = { fill: T('theme-button-hovered'), stroke: T('theme-divider-color') }
  const dragView = boardView('Доска - перетаскивание', 0, 1895, {
    column: (col) => (col.name === blocked.name ? { opacity: 0.45 } : {}),
    cell: (cards, col, lane) => {
      if (col.name === blocked.name) return well('cell', cards.map((d) => card(d)), { opacity: 0.45 })
      const rest = cards.filter((d) => d.id !== moved.id).map((d) => card(d))
      if (col.name !== target.name || !lane.cards.flat().includes(moved)) return well('cell', rest, dropCell)
      return well('cell', [rest[0], plaque(), card({ ...moved, dragged: true }), ...rest.slice(1)], { ...dropCell, stroke: ACCENT, strokeW: 2 })
    }
  })
  const top = dragView.top
  kit.at(dragView.main, loose('Card in hand', { ...moved, lifted: true }, cw - 16), 610, top + 575)
  kit.at(dragView.main, kit.icon('drag', caption, 22), 770, top + 668)
  kit.at(dragView.main, callout('Callout source', `Отсюда взяли ${moved.id}: место схлопнулось, карточки ниже поднялись (как в продукте)`), 16, top + 540)
  kit.at(dragView.main, callout('Callout blocked', `${blocked.name} не принимает ${moved.id}: workflow не разрешает ни ${blocked.statuses.map((s) => s[0]).join(', ни ')}. Бросок сюда вернёт карточку на место`), 1246, top + 660)
  kit.at(dragView.main, callout('Callout target', 'Целевая ячейка: рамка 2px #6B3AD3 (accent Intabia2) - предложение. Остальные ячейки - фон зоны броска (как в продукте)'), 508, top + 876)

  const dragNotes = notesFrame('Аннотации - перетаскивание', 1920, 1895, 1404)
  const column = (name) => {
    const c = BOARD.columns.find((it) => it.name === name)
    const count = BOARD.total(c)
    return kit.ColumnHeader(name, c.cat, count, 250, c.limit ? { limit: c.limit, over: count > c.limit } : {})
  }
  const example = (label, tags, kids, text) => kit.add(kit.box('col ' + label, { w: 250, dir: 'column', gap: 8, vs: 'auto', clip: false }), head(label, 13, tags, 6), kids, small(text, 250))
  const dragCol = (name, cards, o = {}) => kit.add(kit.box('column', { w: 250, dir: 'column', gap: 6, vs: 'auto', opacity: o.opacity }),
    column(name), well('cell', cards, { w: 250, ...dropCell, ...o.cell }))
  const hand = kit.add(kit.row('hand row', 40, { align: 'start', pad: [0, 0, 16, 0] }),
    example('Сейчас', ['product'], loose('card drag image', moved, 234, { opacity: 0.6 }), 'Снимок карточки рисует браузер: полупрозрачный, без тени и поворота'),
    example('Поднята', ['proposal'], loose('card lifted', { ...moved, lifted: true }, 234), 'Тень 0 8 24 / 15% (как у всплывающих окон макета), без поворота, курсор grabbing'))
  const columns = kit.add(kit.row('columns row', 16, { align: 'start' }),
    example('Принимает', ['product'], dragCol('To Do', [card(byId('MKT-2'), 234)]), 'Все ячейки получают .drop-target: фон зоны броска и пунктир 1px (в pen пунктира нет, показан сплошной)'),
    example('Цель', ['proposal'], dragCol(target.name, [card(byId('MKT-1'), 234), plaque(), card({ ...moved, dragged: true }, 234)], { cell: { stroke: ACCENT, strokeW: 2 } }),
      'Рамка 2px #6B3AD3 (accent Intabia2) и плашка статуса - предложение. Карточка на месте вставки с фоном #EFF0F2 - как в продукте'),
    example('Не принимает', ['product'], dragCol(blocked.name, [card(byId('MKT-4'), 234)], { opacity: 0.45, cell: { fill: T('theme-kanban-card-bg-color'), stroke: undefined } }),
      'Workflow не разрешает ни один статус колонки: колонка и заголовок 0.45 + grayscale 0.6 (в pen без grayscale). Бросок возвращает карточку на место'),
    example('WIP превышен', ['product'], dragCol(target.name, [card(byId('APP-3'), 234)]), 'Лимит не запрещает бросок: красится только "/ 8" в заголовке, после броска счётчик станет 11'))
  kit.add(dragNotes,
    kit.text('Карточка: перетаскивание', { size: 22, weight: 600, color: caption }),
    legend(['product', 'proposal'], '- метки у примеров и подписей'),
    section('Карточка в руке', [], hand),
    section('Колонки во время перетаскивания', [], columns),
    notes(1240, [
      ['product', 'Карточку в руке рисует браузер: на dragstart обёртка карточки отдаётся в setDragImage. Своей тени и поворота нет.'],
      ['product', 'Место вставки - сама карточка в целевой ячейке с классом .dragged и фоном accent-bg-color (#EFF0F2). Позицию задаёт половина карточки под курсором. Исходное место схлопывается, как только карточка ушла в другую ячейку.'],
      ['product', 'Пока идёт перетаскивание, все ячейки дорожек получают .drop-target: фон theme-drop-zone-bg-color (токен нигде не задан, работает запасной theme-button-hovered) и пунктир 1px theme-divider-color. Целевая ячейка отдельно не выделена. В доске без дорожек у .drop-allowed колонки стилей нет.'],
      ['proposal', 'Целевая ячейка - рамка 2px #6B3AD3 (accent Intabia2), по образцу свёрнутой колонки под карточкой (.collapsed-item.drag-over).'],
      ['product', 'Колонка, где workflow задачи не разрешает ни один её статус, получает .drop-disabled вместе с заголовком: opacity 0.45, grayscale 0.6, pointer-events none. cursor: not-allowed при pointer-events none не действует; какой курсор покажет браузер, не проверял. Бросок туда кончается dragend: карточка возвращается на место, сообщения нет.'],
      ['proposal', 'Подпись причины у колонки, которая не принимает карточку (на экране - тёмная плашка под Done).'],
      ['product', 'WIP-лимит бросок не запрещает: при count > limit красится только "/ 8" в заголовке (theme-state-negative-color).'],
      ['product', 'Колонка с несколькими статусами: если текущий статус задачи есть в колонке, он остаётся; иначе ставится первый статус колонки по порядку, который разрешает workflow. В интерфейсе это не видно.'],
      ['proposal', 'Плашка "Статус станет: ..." над местом вставки, только если у колонки больше одного статуса и статус задачи меняется.']
    ]))

  await kit.settle()
  return [focusView.frame.id, dragView.frame.id]
}
