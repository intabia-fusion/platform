// FUSIO-1613: buttons of the project's boards in its issues view, three variants and notes.
// The project kanban no longer opens a board. PAGE_NAME of a preceding script names the page.
await kit.page(typeof PAGE_NAME === 'string' ? PAGE_NAME : '2. Доска (to-be)', { keep: true })
{
  const d = DEMO.ru
  const ACCENT = T('accent-color-primary')
  const caption = T('theme-caption-color')
  const dark = T('theme-dark-color')
  const tertiary = T('global-tertiary-TextColor')
  const TAG = {
    product: ['как в продукте', T('theme-button-hovered'), dark],
    proposal: ['предложение', T('primary-button-disabled'), T('primary-button-default')],
    question: ['вопрос', T('theme-state-negative-background-color'), T('theme-state-negative-color')]
  }
  const tag = (k) => kit.add(kit.box('tag ' + TAG[k][0], { dir: 'row', pad: [2, 6, 2, 6], radius: 4, fill: TAG[k][1], hs: 'auto', vs: 'auto' }), kit.text(TAG[k][0], { size: 11, weight: 600, color: TAG[k][2] }))
  const head = (text, size, tags = [], gap = 8) => kit.add(kit.row('head ' + text, gap), kit.text(text, { size, weight: 600, color: caption }), tags.map(tag))
  const small = (text, w) => kit.text(text, { size: 12, color: dark, w })
  const section = (title, tags, ...kids) => kit.add(kit.col('section ' + title, 12), head(title, 16, tags), kids)
  const notes = (w, rows) => kit.add(kit.col('notes', 12), rows.map(([k, text]) =>
    kit.add(kit.box('note', { w, h: 19, dir: 'row', gap: 10, vs: 'auto' }), kit.add(kit.box('tag col', { w: 110, h: 19 }), tag(k)), kit.text(text, { size: 13, color: caption, w: w - 120 }))))
  const callout = (name, text, w = 360) => kit.add(kit.box(name, { w, h: 28, dir: 'column', pad: [6, 10, 6, 10], vs: 'auto', radius: 4, fill: T('theme-tooltip-bg') }), kit.text(text, { size: 12, color: T('theme-tooltip-color'), w: w - 20 }))
  // Accent frame around the proposed controls
  const mark = (name, ...kids) => kit.add(kit.box(name, { w: 10, h: 36, dir: 'row', gap: 4, pad: [0, 2, 0, 2], align: 'center', hs: 'auto', radius: 8, stroke: ACCENT, strokeW: 2 }), kids)

  const projectOf = (id) => d.projects.find((p) => p.id === id)
  // Boards of a project in the order of sortBoards: pinned first, the rest keep their order
  const boardsOf = (id) => {
    const own = d.boards.filter((b) => b.projects.includes(id))
    return [...own.filter((b) => b.pinned), ...own.filter((b) => !b.pinned)]
  }
  const APP = boardsOf('APP')
  const MKT = boardsOf('MKT')
  const iconOf = (b) => (b.pinned ? 'view/pin' : 'board')
  const shared = (b) => (b.projects.length > 1 ? b.projects.join(' · ') : undefined)
  const hintOf = (b) => [b.visibility === 'me' ? 'личная' : undefined, b.pinned ? 'в навигаторе' : undefined, shared(b)].filter((s) => s !== undefined).join(' · ')

  const nav = () => {
    const n = [{ item: 'Мои задачи', icon: 'timeline' }, { item: 'Все задачи', icon: 'check' }, { item: 'Доски', icon: 'board' }]
    for (const b of d.boards.filter((it) => it.pinned)) n.push({ item: b.title, indent: true })
    n.push({ group: 'Ваши проекты', add: true })
    for (const id of ['APP', 'MKT']) {
      n.push({ space: projectOf(id).name })
      n.push({ item: 'Задачи', icon: 'check', indent: true, selected: id === 'APP' }, { item: 'Компоненты', icon: 'component', indent: true }, { item: 'Этапы', icon: 'milestone', indent: true })
    }
    return n
  }
  const crumb = () => {
    const av = kit.box('avatar', { w: 24, h: 24, dir: 'row', align: 'center', justify: 'center', radius: 4, fill: T('global-ui-BackgroundColor') })
    return kit.add(kit.row('Breadcrumb', 6), kit.add(av, kit.icon('tracker/issues', T('global-secondary-TextColor'))), kit.text('Задачи', { size: 16, weight: 700, color: T('global-secondary-TextColor') }))
  }
  const gear = () => kit.Button({ kind: 'secondary', size: 'small', icon: 'gear', name: 'Project settings' })
  // Board button of variants 2 and 3: board or pin icon, title, projects of a shared board
  const pill = (b, o = {}) => {
    const p = kit.box('Board button ' + b.title, { w: 10, h: 28, dir: 'row', gap: 6, pad: [0, 10, 0, 8], align: 'center', hs: 'auto', radius: 6, fill: o.hover ? T('theme-button-hovered') : T('theme-button-default'), stroke: T('theme-button-border') })
    kit.add(p, kit.icon(iconOf(b), T('theme-content-color')), kit.text(b.title, { size: 13, color: T('theme-content-color') }))
    if (shared(b)) kit.add(p, kit.text(shared(b), { size: 12, color: tertiary }))
    return p
  }
  const more = (n) => kit.add(kit.box('Board button more', { w: 10, h: 28, dir: 'row', gap: 4, pad: [0, 8, 0, 10], align: 'center', hs: 'auto', radius: 6, fill: T('theme-button-default'), stroke: T('theme-button-border') }),
    kit.text('Ещё ' + n, { size: 13, color: T('theme-content-color') }), kit.icon('chevronD', T('theme-content-color'), 14))
  const segments = (boards, extra = []) => kit.SegmentedControl([['Задачи', 'check'], ...boards.map((b) => [b.title, iconOf(b), shared(b)]), ...extra], 'Задачи', { name: 'Board segments' })
  const sep = () => kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') })
  const boardsButton = (n) => kit.Button({ kind: 'secondary', size: 'small', icon: 'board', label: `Доски (${n})`, menu: true, name: 'Boards button' })

  // Project kanban as in kanban.js, Russian demo: the first five statuses of the demo
  // Columns follow the demo statuses: by category, the demo order inside it; the first five fit the window
  const columns = ['backlog', 'todo', 'active', 'won', 'lost'].flatMap((cat) => d.statuses.filter((st) => st.category === cat)).slice(0, 5)
  const kanban = (main, top) => {
    const project = projectOf('APP')
    const person = (name) => d.people.find((p) => p.name === name)
    const board = kit.box('Kanban', { w: main.width - 2, h: main.height - top - 1, dir: 'row', pad: [24, 0, 0, 24] })
    for (const st of columns) {
      const all = project.issues.filter((i) => i.status === st.name)
      const cards = all.slice(0, 4).map((i) => ({
        id: i.id,
        cat: st.category,
        title: i.title,
        priority: i.priority,
        ...(person(i.assignee) !== undefined ? { assignee: [person(i.assignee).initials, person(i.assignee).color] } : {}),
        ...(i.component !== undefined ? { component: i.component } : {}),
        ...(i.milestone !== undefined ? { milestone: i.milestone } : {}),
        ...(i.estimation !== undefined ? { est: i.estimation + 'h' } : {})
      }))
      kit.add(board, kit.KanbanColumn({ name: st.name, cat: st.category, count: all.length, cards, ...(st.category === 'active' ? { tools: true } : {}) }, 320, board.height - 32))
    }
    kit.at(main, board, 2, top + 1)
  }
  const TABS = ['Все', 'Активные', 'Пул задач']
  const issuesView = (title, x, y, o) => {
    const { frame, main } = kit.Workbench(title, x, y, { tab: projectOf('APP').name, nav: nav(), w: o.w })
    const top = kit.SpaceHeader(main, { view: 'board', tabs: TABS, tab: 'Все', ...o })
    kanban(main, top)
    return { frame, main, top }
  }

  // 1. Segments next to the title: the project kanban and its boards
  const v1 = issuesView('Задачи проекта - 1. сегменты у заголовка', 0, 0, {
    titleNode: kit.add(kit.row('Title', 12), crumb(), mark('Proposal segments', segments(APP), kit.IconButton('plus', { kind: 'ghost', size: 'small', name: 'Create board' }))),
    actions: [gear()]
  })
  kit.at(v1.main, callout('Callout segments', '1. Сегменты у заголовка: "Задачи" - этот вид, дальше доски, в которые входит проект (закреплённые первыми), "+" - создать доску с этим проектом. Клик по доске открывает доску (предложение)', 420), 330, 800)

  // 2. Board buttons after the search, where the board shows its quick filters
  const v2 = issuesView('Задачи проекта - 2. кнопки в строке фильтров', 2020, 0, {
    title: 'Задачи',
    titleIcon: 'tracker/issues',
    actions: [gear()],
    filters: [sep(), mark('Proposal board buttons', APP.map((b) => pill(b)))]
  })
  kit.at(v2.main, callout('Callout filter row', '2. Кнопки досок после поиска - там же, где на доске быстрые фильтры (слот afterSearch). Клик открывает доску, фильтр этого вида не меняется (предложение)', 420), 330, 800)

  // 3. One to three boards - buttons, four and more - a button with a menu
  const v3 = issuesView('Задачи проекта - 3. кнопка "Доски (N)"', 0, 1200, {
    title: 'Задачи',
    titleIcon: 'tracker/issues',
    actions: [mark('Proposal boards button', boardsButton(APP.length)), gear()]
  })
  const menu = kit.Menu([
    { header: 'Доски проекта' },
    ...APP.map((b) => ({ label: b.title, icon: iconOf(b), hint: hintOf(b) || undefined, hover: b.key === 'main' })),
    '-',
    { label: 'Создать доску', icon: 'plus', accent: true },
    { label: 'Все доски', icon: 'board' }
  ], { w: 320, name: 'Boards menu' })
  kit.at(v3.main, menu, 1096, 50)
  kit.at(v3.main, callout('Callout boards button', '3. Справа, перед "..." и шестерёнкой (слот board_actions): при 1-3 досках - отдельные кнопки, при 4 и больше - одна кнопка "Доски (N)", меню как у переключателя досок (предложение)', 420), 330, 800)

  // Notes
  const W = 1260
  const notesFrame = kit.Frame('Аннотации - кнопки досок проекта', 2020, 1200, 1356, 1960, { fill: T('theme-panel-color') })
  const body = kit.at(notesFrame, kit.box('Аннотации - кнопки досок проекта', { w: W, dir: 'column', gap: 28, vs: 'auto' }), 48, 48)
  const legend = (keys, text) => kit.add(kit.row('legend tags', 8), keys.map(tag), kit.text(text, { size: 13, color: dark }))
  // A row of a case table: label at the left, the header fragment at the right
  const caseRow = (label, ...kids) => kit.add(kit.row('case ' + label, 16, { align: 'center' }), kit.add(kit.box('case label', { w: 200, h: 36, dir: 'row', align: 'center' }), kit.text(label, { size: 13, color: dark })), kids)
  const nothing = (text) => kit.text(text, { size: 13, color: tertiary })
  const createBoard = () => kit.Button({ kind: 'ghost', size: 'small', icon: 'plus', label: 'Создать доску', name: 'Create board' })
  const top3 = APP.slice(0, 3)
  const case0 = 'Проект без досок'
  const case1 = `1-3 доски (${projectOf('MKT').name})`
  const case8 = '8 и больше досок'
  const proscons = (pros, cons) => kit.add(kit.row('pros and cons', 24, { align: 'start' }),
    kit.add(kit.col('pros', 6), kit.text('Плюсы', { size: 13, weight: 600, color: caption }), pros.map((t) => small('+ ' + t, 600))),
    kit.add(kit.col('cons', 6), kit.text('Минусы', { size: 13, weight: 600, color: caption }), cons.map((t) => small('- ' + t, 600))))

  kit.add(body,
    kit.text('Доски проекта в виде задач проекта', { size: 22, weight: 600, color: caption }),
    legend(['product', 'proposal', 'question'], '- метки у разделов и подписей'),
    notes(W, [
      ['proposal', 'Выбран вариант 4 (кадры "Вариант 4 - ..."): подписи "Задачи" нет, на её месте ряд как в варианте 1 - "Задачи", все доски проекта, "+". Что не влезло по ширине, уходит в меню за шевроном.'],
      ['product', 'Задачи проекта больше не открывают доску сами. Доска открывается только из "Доски" навигатора или из переключателя досок.'],
      ['product', 'В шапке вида задач уже есть места для кнопок: board_actions (справа, перед "...") и afterSearch (после поиска, на доске там быстрые фильтры).'],
      ['proposal', 'Кнопками показываются доски, в которые входит проект и которые доступны пользователю (isBoardAvailable: общие и свои личные). Порядок как в sortBoards: закреплённые первыми.'],
      ['product', 'В макете шестерёнка настроек проекта стоит перед "...": kit.SpaceHeader всегда рисует "..." последней. В продукте шестерёнка после "..." и видна только тем, кто может править проект (canEditSpace).']
    ]),
    section('1. Сегменты у заголовка', ['proposal'],
      caseRow(case0, crumb(), mark('Proposal segments', kit.SegmentedControl([['Задачи', 'check']], 'Задачи'), kit.IconButton('plus', { kind: 'ghost', size: 'small' }))),
      caseRow(case1, crumb(), mark('Proposal segments', segments(MKT), kit.IconButton('plus', { kind: 'ghost', size: 'small' }))),
      caseRow(case8, crumb(), mark('Proposal segments', segments(top3, [['Ещё 5', 'chevronD']]), kit.IconButton('plus', { kind: 'ghost', size: 'small' }))),
      small('Без досок ряд из одного сегмента не нужен: остаётся "+" (или ничего, см. ниже). Наведение - фон сегмента как у SegmentedControl ui/kit и подсказка с проектами доски.', W),
      proscons([
        'Видно, где ты: выбран "Задачи", доски - соседние сегменты.',
        'Тот же ряд на доске даёт возврат в задачи одним кликом.',
        'SegmentedControl из ui/kit, новый компонент не нужен.'
      ], [
        'Ширина растёт с числом и длиной названий; с 4 досок нужен "Ещё N", в узком окне ряд не влезает.',
        'Сегменты стоят рядом с переключателем вида (список / канбан): два переключателя подряд.',
        'Сегмент обещает переключение на месте, а доска - другой экран: свои фильтры, настройки, шапка.'
      ])),
    section('2. Кнопки в строке фильтров', ['proposal'],
      caseRow(case0, nothing('кнопок нет; при праве создавать доски - "Создать доску"'), createBoard()),
      caseRow(case1, kit.add(kit.row('buttons', 8), MKT.map((b) => pill(b)))),
      caseRow(case8, kit.add(kit.row('buttons', 8), top3.map((b) => pill(b)), more(5))),
      proscons([
        'Место уже есть (afterSearch), шапка не растёт.',
        'Строка длинная: 4-6 кнопок влезают без меню.'
      ], [
        'Рядом Filter и, на доске, быстрые фильтры: кнопка читается как фильтр, а уводит на другой экран.',
        'На доске эта строка занята быстрыми фильтрами: обратный путь нужен в другом месте.',
        'С 8 досок тот же "Ещё N".'
      ])),
    section('3. Кнопки или "Доски (N)"', ['proposal'],
      caseRow(case0, nothing('кнопок нет; при праве создавать доски - "Создать доску"'), createBoard()),
      caseRow(case1, kit.add(kit.row('buttons', 8), MKT.map((b) => pill(b)))),
      caseRow('4 и больше доски', boardsButton(APP.length)),
      caseRow(case8, boardsButton(8), nothing('в меню с 8 досок - поле поиска сверху')),
      proscons([
        'Шапка не растёт: не больше трёх кнопок или одна кнопка.',
        'Меню повторяет переключатель досок: заголовок, отметки "в навигаторе", APP · MKT, "Создать доску".',
        'Место действий над проектом: рядом "..." и шестерёнка (board_actions).'
      ], [
        'Два вида одного элемента: при переходе 3 -> 4 доски кнопки схлопываются в меню.',
        'Справа кнопки дальше от заголовка, первый взгляд их пропускает.'
      ])),
    section('Отметки досок и наведение', ['proposal'],
      kit.add(kit.row('marks', 24, { align: 'start' }),
        kit.add(kit.col('mark plain', 6), pill(APP.find((b) => b.key === 'second')), small('доска только этого проекта', 220)),
        kit.add(kit.col('mark pinned', 6), pill(APP.find((b) => b.key === 'third')), small('закреплена в навигаторе: иконка булавки, как в переключателе досок', 220)),
        kit.add(kit.col('mark shared', 6), pill(APP.find((b) => b.key === 'main')), small('входит в несколько проектов: идентификаторы проектов серым', 220)),
        kit.add(kit.col('mark hover', 6), pill(APP.find((b) => b.key === 'main'), { hover: true }), kit.add(kit.box('Tooltip', { w: 10, h: 28, dir: 'row', pad: [0, 10, 0, 10], align: 'center', hs: 'auto', radius: 4, fill: T('theme-tooltip-bg') }), kit.text('Основная доска: Мобильное приложение, Маркетинг', { size: 12, color: T('theme-tooltip-color') })), small('наведение: фон кнопки и подсказка с названиями проектов', 300))),
      small('Личная доска ("Мой спринт") в кнопках отдельно не отмечена: её видит только автор. В меню варианта 3 подпись "личная".', W)),
    section('Проект без досок', ['proposal', 'question'],
      notes(W, [
        ['proposal', 'Показывать "Создать доску" (ghost, иконка "+") только тем, кто может создавать доски; доска создаётся сразу с этим проектом. Остальным - ничего: пустое место лучше кнопки, которая ведёт в пустой раздел.'],
        ['question', 'Кто может создавать доски с проектом: любой участник (личная доска) или только тот, кто правит проект? От этого зависит, кому видна кнопка.']
      ])),
    section('Как с доски вернуться в задачи проекта', ['proposal'],
      kit.add(kit.row('return', 24, { align: 'start' }),
        kit.Menu([
          { header: 'Задачи проекта' },
          { label: projectOf('APP').name, icon: 'check' },
          { label: projectOf('MKT').name, icon: 'check' },
          '-',
          { header: 'Доски проекта' },
          ...APP.slice(0, 2).map((b) => ({ label: b.title, icon: iconOf(b), hint: hintOf(b) || undefined })),
          { label: 'Основная доска', icon: 'board', selected: true, hint: 'APP · MKT' }
        ], { w: 320, name: 'Board selector with projects' }),
        kit.add(kit.col('return notes', 8),
          small('В меню переключателя досок первым разделом - "Задачи проекта": по пункту на каждый проект доски. У доски одного проекта пункт один.', 560),
          small('Вариант 1 даёт и второй путь: тот же ряд сегментов в шапке доски, сегмент "Задачи" ведёт назад.', 560),
          small('Сейчас в принятом макете доски путь назад - "Задачи" проекта в навигаторе или кнопка "Назад" браузера.', 560))))
  )

  // 4. The user's choice: after the viewlet switcher, the project boards the user put on the bar (pinned),
  // none selected, then the menu of all project boards; `hidden` last boards that do not fit go to a menu
  const boardsMenuButton = () => kit.Button({ kind: 'ghost', size: 'small', icon: 'board', menu: true, name: 'Project boards menu' })
  const titleRow = (boards, hidden = 0) => {
    const shown = boards.slice(0, boards.length - hidden)
    const row = shown.length > 0 ? kit.SegmentedControl(shown.map((b) => [b.title, 'board', shared(b)]), undefined, { name: 'Board segments' }) : []
    return kit.add(kit.row('Project boards', 8), row, hidden > 0 ? kit.IconButton('chevronD', { kind: 'ghost', size: 'small', name: 'More boards' }) : [], boardsMenuButton())
  }
  const onBar = APP.filter((b) => b.pinned)
  const v4 = issuesView('Вариант 4 - доски на месте заголовка', 0, 2400, { titleNode: titleRow(onBar), end: [gear()] })
  const states = kit.box('Title states', { w: 1150, dir: 'column', gap: 6, pad: [12, 16, 12, 16], vs: 'auto', radius: 8, fill: T('theme-panel-color'), stroke: ACCENT, strokeW: 2 })
  kit.add(states,
    head('Что стоит на месте заголовка', 14, ['proposal']),
    caseRow('Ни одной доски на панели', titleRow([])),
    caseRow(`На панели ${onBar.length} доски`, titleRow(onBar)),
    caseRow('Не влезают по ширине', titleRow(APP, 2)),
    small('На панели только доски, которые пользователь добавил себе (закреплённые). Доски продолжают переключатель видов: список, канбан, время, опции вида, затем доски. Пока доска не открыта, в ряду ничего не выбрано. Доска открывается на месте задач проекта, её плашка выбрана, в переключателе видов не выбрано ничего; клик по виду закрывает доску и открывает задачи проекта в этом виде. Кнопка меню справа - все доски проекта.', 1118))
  kit.at(v4.main, states, 330, 815)

  // Overflow: a 1280 px window fits two of the four boards on the bar, the last two go to the chevron menu
  const v5 = issuesView('Вариант 4 - доски не влезают, меню', 0, 3600, { w: 1280, titleNode: titleRow(APP, 2), end: [gear()] })
  kit.at(v5.main, kit.Menu([
    { header: 'Ещё доски проекта' },
    ...APP.slice(2).map((b) => ({ label: b.title, icon: 'board', hint: shared(b) }))
  ], { w: 300, name: 'More boards menu' }), 485, 50)
  kit.at(v5.main, callout('Callout overflow', 'Доски панели, которые не влезли в шапку, - в меню за шевроном, в том же порядке. Кнопка меню досок остаётся в ряду.', 420), 330, 815)

  // The menu of the project boards: sections as in the board switcher, a check on the boards of the bar;
  // a click puts a board on the bar or takes it off and the menu stays open
  const v6 = issuesView('Вариант 4 - меню досок проекта', 0, 4800, { titleNode: titleRow(onBar), end: [gear()] })
  const app = projectOf('APP')
  const own = APP.filter((b) => b.visibility !== 'me' && b.projects.length === 1)
  const several = APP.filter((b) => b.visibility !== 'me' && b.projects.length > 1)
  const mine = APP.filter((b) => b.visibility === 'me')
  const row = (b) => ({ label: b.title, icon: 'board', hint: b.pinned ? 'убрать с панели' : 'на панель', selected: b.pinned })
  kit.at(v6.main, kit.Menu([
    { header: `${app.name} · ${app.id}` },
    ...own.map(row),
    ...(several.length > 0 ? ['-', { header: 'Несколько проектов' }, ...several.map(row)] : []),
    ...(mine.length > 0 ? ['-', { header: 'Мои доски' }, ...mine.map(row)] : []),
    '-',
    { label: 'Создать доску', icon: 'plus', accent: true }
  ], { w: 340, name: 'Project boards menu' }), 475, 50)
  kit.at(v6.main, callout('Callout boards menu', 'Все доски проекта, галочка - доска на панели; клик добавляет или убирает её, меню не закрывается. "Создать доску" создаёт доску с этим проектом, кладёт её на панель создателю и открывает настройки в проекте. Пока доска открыта, в конце меню - "Настройки доски" (если её можно править). Доска, созданная из раздела "Доски", на панель сама не попадает.', 420), 330, 815)

  await kit.settle()
  return [v1.frame.id, v2.frame.id, v3.frame.id, v4.frame.id, v5.frame.id, v6.frame.id]
}
