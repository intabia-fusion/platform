// FUSIO-1613: board settings, a page of their own (not a tab of project settings): tabs on the left.
// The tabs mirror the Jira board config (FUSIO-1313 screenshots), filters reuse our FilterBar conditions.
await kit.page('3. Настройка доски (to-be)')

const FIELD = { priority: 'Приоритет', status: 'Статус', assignee: 'Исполнитель', component: 'Компонент', inStatus: 'В статусе', relation: 'Связь' }
const OP = { eq: '=', in: 'из', not: 'не', gt: '>' }
// 'Иван Петров' -> 'И. Петров'
const short = (v) => (v === 'me' ? 'Я' : v.includes(' ') ? v[0] + '. ' + v.split(' ')[1] : v)
const chipsOf = (filter) => filter.map((f) => kit.FilterChip(FIELD[f.field], OP[f.op], f.value.map(f.field === 'assignee' ? short : (v) => v).join(', ')))
const BOARD_TABS = [['Основное', 'gear'], ['Колонки', 'board'], ['Дорожки', 'timeline'], ['Быстрые фильтры', 'star'], ['Цвета карточек', 'milestone'], ['Карточка', 'check']]
const settings = (tab, x, y) => {
  const { frame, main } = kit.Workbench('Настройка доски - ' + tab, x, y, { tab: 'Настройки доски', nav: projectNav('main') })
  const content = kit.SettingsLayout(main, {
    back: 'К доске',
    close: true,
    title: 'Настройки доски',
    actions: [kit.Button({ kind: 'ghost', size: 'small', icon: 'board', label: BOARD.main.title, menu: true, name: 'Board in settings' })],
    tabs: BOARD_TABS,
    tab
  })
  return { frame, content }
}
const ids = []

// ---- Columns -----------------------------------------------------------------
{
  const { frame, content } = settings('Колонки', 0, 0)
  ids.push(frame.id)
  const cw = content.width - 64
  const shown = 4
  const colW = 226
  kit.add(content, kit.SectionTitle('Колонки', 'Колонка объединяет один или несколько статусов. Перетащите статус в колонку, чтобы задачи в нём появились на доске. Открытые статусы без колонки на доске не видны, закрытые без колонки уходят с доски по замыслу.', cw))
  const opts = kit.box('options', { w: cw, h: 32, dir: 'row', gap: 32, align: 'center' })
  kit.add(opts, kit.Toggle(true, 'WIP-лимиты'), kit.Toggle(false, 'Дни в колонке на карточке'), kit.Button({ size: 'small', icon: 'plus', label: 'Добавить колонку' }))
  kit.add(content, opts)

  const area = kit.box('Columns editor', { w: cw, h: 560, dir: 'row', gap: 12, pad: [12, 12, 12, 12], radius: 8, fill: T('theme-list-row-color'), clip: true })
  // statuses with no column
  const un = kit.box('Unmapped statuses', { w: 220, h: 530, dir: 'column', gap: 8, pad: [12, 12, 12, 12], radius: 8, stroke: P('Sunshine'), strokeStyle: 'dashed', fill: T('theme-popup-color') })
  kit.add(un, kit.text('Статусы без колонки', { size: 14, weight: 600 }), kit.Notice(`${BOARD.unmapped.reduce((n, it) => n + it[2], 0)} ${pl(BOARD.unmapped.reduce((n, it) => n + it[2], 0), 'задача не видна', 'задачи не видны', 'задач не видны')} на доске`, 'warning', { w: 196 }))
  for (const [n, cat, cnt] of BOARD.unmapped) kit.add(un, kit.StatusChip(n, cat, { count: cnt, drag: true, w: 196, h: 32, size: 13, fill: T('theme-popup-color'), stroke: T('theme-button-border') }))
  const drop = kit.box('drop zone', { w: 196, h: 64, dir: 'row', align: 'center', justify: 'center', radius: 6, stroke: T('theme-button-border'), strokeStyle: 'dashed' })
  kit.add(un, kit.add(drop, kit.text('Перетащите статус сюда,\nчтобы убрать с доски', { size: 12, color: T('theme-darker-color'), align: 'center' })))
  kit.add(area, un)

  for (const [i, col] of BOARD.columns.slice(0, shown).entries()) {
    const c = kit.box('Column ' + col.name, { w: colW, h: 530, dir: 'column', gap: 8, pad: [10, 10, 10, 10], radius: 8, fill: T('theme-popup-color'), stroke: i === 3 ? T('primary-button-default') : T('theme-divider-color') })
    const head = kit.box('head', { w: colW - 20, h: 32, dir: 'row', gap: 4, align: 'center' })
    kit.add(head, kit.icon('drag', T('theme-darker-color')), kit.StatusIcon(col.cat))
    const name = kit.box('name', { w: colW - 96, h: 32, dir: 'row', pad: [0, 8, 0, 8], align: 'center', radius: 6 })
    kit.add(head, kit.add(name, kit.text(col.name, { size: 14, weight: 600 })), kit.IconButton('more', { kind: 'ghost', size: 'extra-small' }))
    kit.add(c, head)
    const wip = kit.box('WIP', { w: colW - 20, h: 28, dir: 'row', gap: 6, align: 'center' })
    const num = (label, v) => {
      const b = kit.box(label, { w: (colW - 26) / 2, h: 28, dir: 'row', gap: 6, pad: [0, 8, 0, 8], align: 'center', radius: 6, fill: T('input-BackgroundColor') })
      return kit.add(b, kit.text(label, { size: 12, color: T('theme-darker-color') }), kit.text(v || '—', { size: 13, color: v ? T('theme-caption-color') : T('theme-darker-color') }))
    }
    kit.add(c, kit.add(wip, num('мин', ''), num('макс', col.limit ? String(col.limit) : '')))
    const total = col.statuses.reduce((s, it) => s + it[2], 0)
    kit.add(c, kit.text(`${col.statuses.length} ${col.statuses.length === 1 ? 'статус' : 'статуса'} · ${total} задач`, { size: 12, color: T('theme-dark-color') }))
    for (const [n, cat, cnt] of col.statuses) kit.add(c, kit.StatusChip(n, cat, { count: cnt, drag: true, w: colW - 20, h: 32, size: 13, fill: T('theme-popup-color'), stroke: T('theme-button-border') }))
    if (i === 1) {
      const ghost = kit.box('drop target', { w: colW - 20, h: 32, radius: 4, stroke: T('primary-button-default'), strokeW: 2, strokeStyle: 'dashed', fill: T('primary-button-default') + '0F' })
      kit.add(c, ghost)
    }
    kit.add(area, c)
  }
  kit.add(content, area)
  const rest = BOARD.columns.slice(shown)
  kit.add(content, kit.text(`Колонок всего ${BOARD.columns.length}. Показаны первые ${shown}, остальные справа: ${rest.map((c) => c.name).join(', ')}`, { size: 12, color: T('theme-darker-color') }))
}

// ---- General -----------------------------------------------------------------
{
  const { frame, content } = settings('Основное', 2020, 0)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Основное', 'Какие задачи попадают на доску и кто может её менять.', 720))
  kit.add(content,
    kit.FormRow('Название', kit.Input({ w: 420, value: BOARD.main.title })),
    kit.FormRow('Проекты', kit.add(kit.row('projects', 6), BOARD.projectNames.map((n) => kit.Chip([kit.icon('board', undefined, 14), kit.text(n, { size: 13 })])), kit.Button({ kind: 'tertiary', size: 'extra-small', icon: 'plus', label: 'Добавить' })), { hint: 'Задачи из нескольких проектов на одной доске' }),
    kit.FormRow('Фильтр доски', kit.add(kit.col('filter block', 8),
      kit.add(kit.box('filters', { w: 480, h: 28, dir: 'row', gap: 6, wrap: true, vs: 'auto' }), chipsOf(BOARD.main.filter), kit.Button({ kind: 'ghost', size: 'extra-small', icon: 'plus', label: 'Условие' })),
      kit.text(`Под фильтр попадает ${BOARD.filterCount.matching} из ${BOARD.filterCount.total} ${pl(BOARD.filterCount.total, 'задачи', 'задач', 'задач')} проектов доски. Остальные на доске не видны.`, { size: 12, color: T('theme-darker-color') })),
      { hint: 'Условия объединяются через «И», как в фильтре списка задач', alignTop: true }),
    kit.FormRow('Скрывать выполненные старше', kit.Input({ w: 200, value: '2 недели', menu: true }), { hint: 'Колонки категории «Выполнено»' }),
    kit.FormRow('Порядок карточек', kit.Input({ w: 200, value: 'Ручной порядок', menu: true })),
    kit.divider(720),
    kit.FormRow('Видимость', kit.add(kit.col('vis', 10), kit.Radio(true, 'Все участники проекта'), kit.Radio(false, 'Только я', 'Личная доска, видна в «Мои доски»')), { alignTop: true }),
    kit.FormRow('Автор', kit.add(kit.row('author', 6), kit.Avatar(BOARD.author.avatar[0], BOARD.author.avatar[1], 24), kit.text(BOARD.author.name, { size: 14 })), { hint: 'Может менять настройки доски' }),
    kit.FormRow('Могут править', kit.add(kit.row('editors', 12), BOARD.editors.map((e) => kit.add(kit.row('editor', 6), kit.Avatar(e.avatar[0], e.avatar[1], 24), kit.text(e.name, { size: 14 }))), kit.Button({ kind: 'tertiary', size: 'extra-small', icon: 'plus', label: 'Добавить' })), { hint: 'Остальные могут пользоваться доской или создать свою' })
  )
}

// ---- Swimlanes ---------------------------------------------------------------
{
  const { frame, content } = settings('Дорожки', 0, 1200)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Дорожки', 'Горизонтальная группировка задач на доске. Пользователь может переключить дорожки у себя в параметрах вида.', 720))
  const opts = kit.box('Swimlane by', { w: 720, h: 10, dir: 'column', gap: 12, vs: 'auto' })
  kit.add(opts, kit.Radio(false, 'Нет'), kit.Radio(false, 'Исполнитель'), kit.Radio(false, 'Приоритет'), kit.Radio(false, 'Компонент · Веха · Родительская задача'), kit.Radio(true, 'По фильтрам', 'Задача попадает в первую подходящую дорожку'))
  kit.add(content, opts)
  const row = (name, chips, fixed) => [kit.add(kit.row('name', 8), kit.icon('drag', fixed ? T('theme-trans-color') : T('theme-darker-color')), kit.text(name, { size: 14, weight: 500 })), chips, fixed ? kit.text('', { size: 12 }) : kit.IconButton('trash', { kind: 'ghost', size: 'extra-small' })]
  const tw = content.width - 64
  kit.add(content, kit.Table([{ title: 'Дорожка', w: 240 }, { title: 'Условие', w: tw - 296 }, { title: '', w: 56 }], [
    ...BOARD.main.swimlanes.map((l) => l.rest ? row(l.title, kit.text('всё, что не попало выше', { size: 13, color: T('theme-darker-color') }), true) : row(l.title, kit.add(kit.row('c', 6), chipsOf(l.filter))))
  ], { name: 'Swimlanes table' }))
  kit.add(content, kit.Button({ size: 'small', icon: 'plus', label: 'Добавить дорожку' }))
  // Example of the first-match rule on one real card
  const sample = BOARD.issue('APP-6')
  const rules = BOARD.main.swimlanes
  const ex = kit.box('Lane example', { w: 720, h: 10, dir: 'column', gap: 6, pad: [14, 16, 14, 16], vs: 'auto', radius: 8, fill: T('theme-list-row-color') })
  kit.add(ex, kit.text(`Пример: ${sample.id} «${sample.title}», приоритет Urgent`, { size: 13, weight: 600 }),
    kit.text(`1. ${rules[0].title}: условие выполнено, задача идёт в эту дорожку`, { size: 13 }),
    kit.text(`2. ${rules[1].title}: не проверяется, дорожка уже найдена`, { size: 13, color: T('theme-darker-color') }),
    kit.text(`3. ${rules[2].title}: сюда попадают задачи, не подошедшие ни под одно условие выше`, { size: 13, color: T('theme-darker-color') }))
  kit.add(content, ex)
}

// ---- Quick filters -----------------------------------------------------------
{
  const { frame, content } = settings('Быстрые фильтры', 2020, 1200)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Быстрые фильтры', 'Кнопки над доской. Несколько включённых фильтров объединяются через «И».', 720))
  const r = (name, chips, on) => [kit.add(kit.row('name', 8), kit.icon('drag', T('theme-darker-color')), kit.text(name, { size: 14, weight: 500 })), chips, kit.Toggle(on), kit.IconButton('trash', { kind: 'ghost', size: 'extra-small' })]
  const tw = content.width - 64
  kit.add(content, kit.Table([{ title: 'Название', w: 200 }, { title: 'Условие', w: tw - 366 }, { title: 'Над доской', w: 110 }, { title: '', w: 56 }], [
    ...BOARD.main.quickFilters.map((q) => r(q.title, kit.add(kit.row('c', 6), chipsOf(q.filter)), true))
  ], { name: 'Quick filters table' }))
  kit.add(content, kit.add(kit.row('actions', 8), kit.Button({ size: 'small', icon: 'plus', label: 'Быстрый фильтр' }), kit.Button({ kind: 'ghost', size: 'small', icon: 'star', label: 'Из сохранённых фильтров', menu: true })))
}

// ---- Card colors -------------------------------------------------------------
{
  const { frame, content } = settings('Цвета карточек', 0, 2400)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Цвета карточек', 'Рамка карточки окрашивается по первому подходящему правилу. Цвет заголовка колонки от этой настройки не зависит: его задаёт категория статусов, а красным колонка выделяется при превышении WIP-лимита.', 720))
  kit.add(content, kit.FormRow('Цвет по', kit.Input({ w: 240, value: 'Правилам', menu: true }), { hint: 'Нет · Приоритет · Тип задачи · Правилам' }))
  const r = (c, chips) => [kit.add(kit.row('c', 6), kit.icon('drag', T('theme-darker-color')), kit.Swatch(c)), chips, kit.IconButton('trash', { kind: 'ghost', size: 'extra-small' })]
  const tw = content.width - 64
  kit.add(content, kit.Table([{ title: 'Цвет', w: 90 }, { title: 'Условие', w: tw - 146 }, { title: '', w: 56 }], [
    ...BOARD.main.colorRules.map((c) => r(P(c.color), kit.add(kit.row('c', 6), chipsOf(c.filter))))
  ], { name: 'Card colors table' }))
  kit.add(content, kit.Button({ size: 'small', icon: 'plus', label: 'Правило' }))
  const prev = kit.box('Preview', { w: 720, h: 10, dir: 'row', gap: 12, vs: 'auto' })
  kit.add(prev,
    kit.IssueCard(BOARD.issue('APP-29', { accent: P('Orange') }), 264),
    kit.IssueCard(BOARD.issue('APP-27', { accent: P('Firework') }), 264))
  kit.add(content, kit.text('Пример', { size: 12, color: T('theme-darker-color') }), prev)
}

// ---- Card layout -------------------------------------------------------------
{
  const { frame, content } = settings('Карточка', 2020, 2400)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Карточка', 'Поля на карточке для всех, кто открывает доску. Тот же набор, что в настройке вида канбана (viewlet IssueKanban).', 720))
  const body = kit.box('body', { w: 900, h: 10, dir: 'row', gap: 48, vs: 'auto' })
  const list = kit.col('fields', 12)
  for (const [f, on] of [['Приоритет', true], ['Подзадачи', true], ['Срок', true], ['Компонент', true], ['Веха', true], ['Метки', true], ['Оценка', true], ['Вложения', true], ['Комментарии', true], ['Родительская задача', false], ['Дни в колонке', false]]) kit.add(list, kit.Checkbox(on, f))
  kit.add(list, kit.spacer(10, 8), kit.Toggle(false, 'Компактный режим'))
  kit.add(body, list, kit.add(kit.col('preview', 8), kit.text('Пример', { size: 12, color: T('theme-darker-color') }),
    kit.IssueCard(BOARD.issue('APP-9', { due: '30 окт', component: BOARD.components[0], att: 1, com: 3 }), 296)))
  kit.add(content, body)
}

await kit.settle()
return ids
