// Общие данные и блоки экрана «Встречи» (решения Р1/Р2 от 2026-11-20): один раздел с переключателем
// «Календарь / Список / Таблица», вкладка «Группы» вместо «Постоянных встреч».
// Тексты - макеты русского интерфейса; держать в шаге с `docs/love.md` §7a.2 и спецификацией
// `openspec/changes/love-meetings-unified-views`.

// В офисе у встреч всего две вкладки: встречи и группы встреч.
const MT_NAV = [
  { item: 'Встречи', icon: 'kit/Calendar', selected: true },
  { item: 'Группы', icon: 'kit/People' }
]

// Нижний блок навигатора: этажи, офисы и комнаты - та же реализация, что в остальных разделах офиса.
const MT_FOOTER = [
  { item: 'Этажи', icon: 'kit/Building' },
  { item: 'Офис', icon: 'kit/Building' },
  { item: 'Моя комната', icon: 'kit/Calendar' }
]

const MT_GROUPS = ['Разработка', 'Продукт']

// kind: series - встреча календаря (возможно, серия), permanent - постоянная встреча с серией,
// hidden - встреча без отображения (нет серии, не видна в календаре и планировщике).
const MT_MEETINGS = [
  {
    name: 'Планёрка команды',
    kind: 'series',
    group: 'Разработка',
    next: 'Пн, 17 ноября, 10:00',
    last: 'Вчера',
    members: 6,
    member: true,
    joinable: true
  },
  {
    name: 'Демо спринта',
    kind: 'series',
    group: 'Разработка',
    next: 'Ср, 19 ноября, 16:00',
    last: '6 ноября',
    members: 9,
    member: true,
    joinable: false
  },
  {
    name: 'Дежурная',
    kind: 'permanent',
    group: 'Разработка',
    next: 'Открыта всегда',
    last: 'Сегодня, 09:12',
    members: 3,
    member: true,
    joinable: true
  },
  {
    name: 'Ретро 1:1',
    kind: 'hidden',
    group: 'Разработка',
    next: 'Без расписания',
    last: '12 ноября',
    members: 2,
    member: true,
    joinable: true
  },
  {
    name: 'Синк по роадмапу',
    kind: 'series',
    group: 'Продукт',
    next: 'Вт, 18 ноября, 11:00',
    last: '11 ноября',
    members: 5,
    member: true,
    joinable: true
  },
  {
    name: 'Разбор метрик',
    kind: 'permanent',
    group: 'Продукт',
    next: 'Открыта всегда',
    last: '7 ноября',
    members: 4,
    member: false,
    joinable: false
  }
]

const MT_KIND_LABEL = { series: 'Встреча', permanent: 'Постоянная', hidden: 'Без отображения' }

// Навигатор с выбранной вкладкой «Группы»: она заменила «Постоянные встречи».
const MT_NAV_GROUPS = MT_NAV.map((it) =>
  it.item === 'Встречи' ? { ...it, selected: false } : it.item === 'Группы' ? { ...it, selected: true } : it
)

const MT_OPTIONS = {
  tab: 'Офис',
  tabIcon: 'building',
  app: 'office',
  title: 'Офис',
  newLabel: null,
  footer: MT_FOOTER
}

const mtMembers = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'участник' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'участника' : 'участников'}`

// Переключатель представления в шапке раздела: иконками, как селектор вида в остальных разделах офиса.
// Подпись сегмента остаётся в подсказке кнопки.
function mtSwitch (selected) {
  return kit.SegmentedControl(
    [
      ['Календарь', 'kit/Calendar'],
      ['Список', 'kit/BulletList'],
      ['Таблица', 'kit/Table']
    ],
    selected,
    { size: 'medium', iconOnly: true }
  )
}

// Шапка раздела как на проде: заголовок панели с хлебными крошками и кнопками справа,
// переключатель вида идёт первым в действиях (в продукте - слот `beforeTitle` шапки `SpecialView`).
function mtHeader (main, selected, title = 'Встречи') {
  return kit.PanelHeader(main, {
    icon: 'calendar',
    title,
    actions: [
      mtSwitch(selected),
      kit.Button({ kind: 'secondary', size: 'medium', label: 'Объединить в группу' }),
      kit.Button({ kind: 'primary', size: 'medium', icon: 'plus', label: 'Новая встреча' })
    ]
  })
}

// Список и таблица - как во вьюлетках `ListPermanentMeetings` / `TablePermanentMeetings` в проде:
// плоские строки `antiList` с колонками Название · Следующее вхождение · Участники · Последняя сессия,
// без рамки, с линией-разделителем. У списка - заголовки групп с шевроном и счётчиком, у таблицы - шапка колонок.
const MT_COL = { next: 200, members: 170, last: 160, actions: 100 }

// Линия-разделитель между строками
function mtLine (w) {
  return kit.box('Divider', { w, h: 1, fill: T('theme-divider-color') })
}

function mtCell (w, kids, justify = 'start') {
  const cell = kit.box('Cell', { w, h: 40, dir: 'row', gap: 6, pad: [0, 12, 0, 12], align: 'center', justify })
  kit.add(cell, kids)
  return cell
}

// Строка встречи в списке: название с иконкой и три колонки значений плюс действия.
function mtRow (m, w) {
  const row = kit.box('Meeting ' + m.name, { w, h: 40, dir: 'row', align: 'center' })
  const name = mtCell(w - MT_COL.next - MT_COL.members - MT_COL.last - MT_COL.actions, [
    kit.icon('kit/Calendar', T('theme-dark-color'), 16),
    kit.text(m.name, { size: 14, color: T('theme-caption-color') })
  ])
  kit.add(row, name)
  kit.add(row, mtCell(MT_COL.next, kit.text(m.next, { size: 13, color: T('theme-dark-color') })))
  kit.add(
    row,
    mtCell(
      MT_COL.members,
      [
        kit.Avatar('АЗ', 'Blueberry', 20),
        kit.Avatar('МП', 'Grass', 20),
        kit.text(`+${Math.max(m.members - 2, 0)}`, { size: 12, color: T('theme-dark-color') })
      ],
      'start'
    )
  )
  kit.add(row, mtCell(MT_COL.last, kit.text(m.last, { size: 13, color: T('theme-dark-color') })))
  const actions = kit.box('Actions', { w: MT_COL.actions, h: 40, dir: 'row', gap: 4, align: 'center', justify: 'end' })
  if (m.member) kit.add(actions, kit.IconButton('kit/Link', { kind: 'ghost', size: 'small', name: 'CopyLink/' + m.name }))
  if (m.joinable) kit.add(actions, kit.IconButton('kit/ArrowIn', { kind: 'ghost', size: 'small', name: 'Join/' + m.name }))
  kit.add(actions, kit.IconButton('kit/Gear', { kind: 'ghost', size: 'small', name: 'Settings/' + m.name }))
  kit.add(row, actions)
  return row
}

// Заголовок группы в списке: шеврон, название, счётчик - как `categoryHeader` списка в проде.
function mtGroupHeader (main, group, count) {
  const h = kit.box('Group ' + group, {
    w: main.width - 32,
    h: 44,
    dir: 'row',
    gap: 8,
    pad: [0, 12, 0, 12],
    align: 'center'
  })
  kit.add(h, kit.icon('kit/CaretRightFill', T('theme-caption-color'), 12))
  kit.add(h, kit.text(group, { size: 14, weight: 500, color: T('theme-caption-color') }))
  kit.add(h, kit.Count(count))
  return h
}

// Шапка колонок таблицы
function mtTableHead (w) {
  const head = kit.box('Columns', {
    w,
    h: 36,
    dir: 'row',
    align: 'center',
    fill: T('theme-list-row-color')
  })
  const label = (text, cw, justify) =>
    mtCell(cw, kit.text(text, { size: 12, weight: 500, color: T('theme-dark-color') }), justify)
  kit.add(head, label('Название', w - MT_COL.next - MT_COL.members - MT_COL.last - MT_COL.actions))
  kit.add(head, label('Следующее вхождение', MT_COL.next))
  kit.add(head, label('Участники', MT_COL.members))
  kit.add(head, label('Последняя сессия', MT_COL.last))
  kit.add(head, mtCell(MT_COL.actions, []))
  return head
}

// Список строк с разделителями: так же выглядит и таблица, только без групп и с шапкой колонок.
function mtRows (w, rows) {
  const list = kit.col('Rows', 0, { w, hs: 'fix' })
  rows.forEach((m, i) => {
    if (i > 0) kit.add(list, mtLine(w))
    kit.add(list, mtRow(m, w))
  })
  return list
}

// Недельная сетка: колонки дней, линии часов, плашки встреч. Отдельного календарного примитива в kit нет,
// поэтому сетка собрана из боксов - как в `screens/current/` для других разделов.
// Плашка встречи - фон `theme-bg-accent-color` и цветная полоса слева: палитровый фон (`PB`) в тёмной теме
// приходит градиентом и как `background-color` не применяется.
function mtWeek (main, top, height) {
  const w = main.width - 32
  const hoursW = 52
  const dayW = Math.floor((w - hoursW) / 5)
  const headH = 32
  const bodyH = height - headH
  const hourH = bodyH / 9
  const grid = kit.box('Week', { w, h: height, dir: 'row', hs: 'fix', vs: 'fix', stroke: T('theme-divider-color') })
  kit.at(main, grid, 16, top)

  // from - час начала (9..17), span - длительность в часах
  const days = [
    { title: 'Пн 17', events: [{ from: 10, span: 1, name: 'Планёрка команды', color: 'Sky' }] },
    { title: 'Вт 18', events: [{ from: 11, span: 1, name: 'Синк по роадмапу', color: 'Grass' }] },
    { title: 'Ср 19', events: [{ from: 16, span: 2, name: 'Демо спринта', color: 'Cerulean' }] },
    { title: 'Чт 20', events: [] },
    { title: 'Пт 21', events: [{ from: 13, span: 1, name: 'Разбор метрик', color: 'Coin' }] }
  ]

  const timeCol = kit.col('Hours', 0, { w: hoursW, h: height, hs: 'fix', vs: 'fix' })
  kit.add(grid, timeCol)
  kit.add(timeCol, kit.spacer(hoursW, headH))
  for (let h = 9; h < 18; h++) {
    const line = kit.row('Hour ' + h, 0, { w: hoursW, h: hourH, pad: [0, 8, 0, 0], justify: 'end' })
    kit.add(timeCol, line)
    kit.add(line, kit.text(`${h}:00`, { size: 11, color: T('theme-dark-color') }))
  }

  for (const d of days) {
    const col = kit.box('Day ' + d.title, {
      w: dayW,
      h: height,
      dir: 'column',
      gap: 0,
      hs: 'fix',
      vs: 'fix',
      stroke: T('theme-divider-color')
    })
    kit.add(grid, col)
    kit.add(col, kit.row('Day header', 0, { w: dayW, h: headH, pad: [0, 8, 0, 8], fill: T('theme-bg-accent-color') }))
    kit.add(col.children[0], kit.text(d.title, { size: 12, weight: 500, color: T('theme-caption-color') }))

    const body = kit.box('Day body ' + d.title, { w: dayW, h: bodyH, hs: 'fix', vs: 'fix' })
    kit.add(col, body)
    for (let h = 1; h < 9; h++) {
      kit.at(body, kit.box('Line ' + h, { w: dayW, h: 1, fill: T('theme-divider-color') }), 0, h * hourH)
    }
    for (const e of d.events) {
      const h = e.span * hourH - 2
      const ev = kit.box('Event ' + e.name, {
        w: dayW - 8,
        h,
        dir: 'row',
        gap: 6,
        pad: [0, 6, 0, 6],
        align: 'center',
        radius: 4
      })
      kit.at(body, ev, 4, (e.from - 9) * hourH + 1)
      // Тонированная подложка цвета палитры: `PB` в тёмной теме приходит градиентом, поэтому берём solid `P`
      kit.at(ev, kit.box('Tint ' + e.name, { w: dayW - 8, h, fill: P(e.color), radius: 4, opacity: 0.18 }), 0, 0)
      kit.add(ev, kit.box('Stripe ' + e.name, { w: 3, h, fill: P(e.color), radius: 2 }))
      kit.add(ev, kit.text(e.name, { size: 11, color: T('theme-caption-color') }))
    }
  }
  return grid
}

// ---- Содержимое экранов. Каждая страница рисует шапку раздела и свой вид, поэтому один и тот же код
// собирает и отдельные экраны, и общий фрейм со всеми четырьмя.

function mtCalendarPage (main) {
  mtHeader(main, 'Календарь')
  const content = kit.col('Календарь встреч', 4, { w: main.width - 32, hs: 'fix' })
  kit.at(main, content, 16, 72)
  kit.add(
    content,
    kit.text('Список и таблица живут в этом же разделе: переключатель сверху, отдельной вкладки постоянных встреч больше нет', {
      size: 13,
      color: T('theme-dark-color'),
      name: 'Hint',
      w: main.width - 32
    })
  )
  mtWeek(main, 104, 540)
}

function mtListPage (main) {
  mtHeader(main, 'Список')
  const content = kit.col('Список', 4, { w: main.width - 32, hs: 'fix' })
  kit.at(main, content, 16, 72)
  kit.add(
    content,
    kit.text('В списке рядом серии календаря и постоянные встречи; встречи без отображения - во вкладке «Группы»', {
      size: 13,
      color: T('theme-dark-color'),
      name: 'Hint',
      w: main.width - 32
    })
  )

  for (const group of MT_GROUPS) {
    const rows = MT_MEETINGS.filter((it) => it.group === group && it.kind !== 'hidden')
    kit.add(content, mtGroupHeader(main, group, rows.length))
    kit.add(content, mtRows(main.width - 32, rows))
  }
  kit.add(content, kit.spacer(1, 8))
  kit.add(content, kit.text('Без группы', { size: 13, color: T('theme-dark-color') }))
}

function mtTablePage (main) {
  mtHeader(main, 'Таблица')
  const rows = MT_MEETINGS.filter((m) => m.kind !== 'hidden')
  const table = kit.col('Table', 0, { w: main.width - 32, hs: 'fix' })
  kit.add(table, mtTableHead(main.width - 32))
  kit.add(table, mtRows(main.width - 32, rows))
  kit.at(main, table, 16, 88)
}

// Три набора внутри группы: встречи с расписанием, постоянные и без отображения.
const MT_SETS = [
  { title: 'Встречи', kinds: ['series'] },
  { title: 'Постоянные встречи', kinds: ['permanent'] },
  { title: 'Встречи без отображения', kinds: ['hidden'] }
]

// Подпись набора: уровень ниже заголовка группы, без плашки - это подгруппа внутри группы.
function mtSetTitle (main, title) {
  const h = kit.box('Set ' + title, {
    w: main.width - 32,
    h: 28,
    dir: 'row',
    pad: [0, 12, 0, 24],
    align: 'center'
  })
  kit.add(h, kit.text(title, { size: 13, weight: 500, color: T('theme-caption-color') }))
  return h
}

function mtGroupsPage (main) {
  mtHeader(main, 'Список', 'Группы')
  const content = kit.col('Список', 4, { w: main.width - 32, hs: 'fix' })
  kit.at(main, content, 16, 72)
  kit.add(
    content,
    kit.text('Группа объединяет встречи любого типа; наборы ниже различаются только расписанием и видимостью', {
      size: 13,
      color: T('theme-dark-color'),
      name: 'Hint',
      w: main.width - 32
    })
  )

  for (const group of MT_GROUPS) {
    const inGroup = MT_MEETINGS.filter((it) => it.group === group)
    kit.add(content, mtGroupHeader(main, group, inGroup.length))
    for (const s of MT_SETS) {
      const rows = inGroup.filter((it) => s.kinds.includes(it.kind))
      if (rows.length === 0) continue
      kit.add(content, mtSetTitle(main, s.title))
      kit.add(content, mtRows(main.width - 32, rows))
    }
  }
}
