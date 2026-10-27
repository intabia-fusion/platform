// FUSIO-1621: create project wizard (ui/kit WizardDialog) over the issue list, DEMO.ru; Create on every step.
// Placed as the product popup 'top': centered horizontally, 15vh from the top. PAGE_NAME of a preceding script names the page.

await kit.page(typeof PAGE_NAME === 'string' ? PAGE_NAME : '2. Создание проекта')
{
  const demo = DEMO.ru
  const mkt = demo.projects.find((p) => p.id === 'MKT')
  const who = new Map(demo.people.map((p) => [p.name, p]))
  const steps = ['Основное', 'Участники и доступ', 'Задачи', 'Workflow', 'Сводка']
  // x-large dialog minus the 14rem steps column with its border and the 24 px body padding
  const dialogW = 932
  const bodyW = dialogW - 225 - 48
  // The step keeps 28rem, so the dialog does not jump between steps
  const stepH = 448

  const row = (label, control, o = {}) => kit.SettingRow(label, control, { kind: 'column', w: bodyW, ...o })
  const fieldW = bodyW - 220 - 16
  const select = (label, o = {}) => kit.SelectButton({ label, field: true, chevron: true, w: fieldW, ...o })
  const person = (name) => {
    const p = who.get(name)
    return kit.add(kit.row('person', 8), kit.Avatar(p.initials, p.color, 24), kit.text(name, { size: 14, color: T('theme-caption-color') }))
  }

  // The tracker list of the Marketing project behind the dialog, as in screens/current/tracker-issues.js
  const backdrop = (name, x, y) => {
    const { frame, main } = kit.Workbench(name, x, y, {
      tab: 'Tracker',
      nav: [
        { item: 'My issues', icon: 'kit/Crosshair' },
        { item: 'All issues', icon: 'kit/CheckSquare' },
        { divider: true },
        { item: 'All projects', icon: 'kit/BulletList' },
        { item: 'Labels', icon: 'kit/Tags' },
        { group: 'Your projects', add: true },
        { space: mkt.name, icon: 'kit/HouseFill', color: 'Porpoise' },
        { item: 'Issues', icon: 'kit/CheckSquare', selected: true, indent: true },
        { item: 'Components', icon: 'kit/Diamond', indent: true },
        { item: 'Milestones', icon: 'kit/Signpost', indent: true },
        { item: 'Templates', icon: 'kit/Layout', indent: true }
      ]
    })
    kit.SpaceHeader(main, { view: 'list', title: 'Issues', titleIcon: 'kit/CheckSquare' })
    const groups = ['In Progress', 'Todo', 'Backlog', 'Done', 'Canceled'].map((statusName) => {
      const st = demo.statuses.find((s) => s.name === statusName)
      const issues = mkt.issues.filter((i) => i.status === statusName).map((i) => {
        const p = who.get(i.assignee)
        return {
          id: i.id,
          cat: st.category,
          title: i.title,
          priority: i.priority,
          ...(p !== undefined ? { assignee: [p.initials, p.color] } : {}),
          ...(i.estimation !== undefined ? { est: i.estimation + 'h' } : {}),
          created: '2 days ago',
          modified: 'Oct 21'
        }
      })
      const est = issues.reduce((sum, i) => sum + (parseInt(i.est) || 0), 0)
      return { name: statusName, cat: st.category, color: st.color, estimation: est + 'h', issues }
    })
    kit.at(main, kit.IssueList(groups, main.width - 34), 17, 129)
    kit.at(frame, kit.box('Overlay', { w: 1920, h: 1080, fill: '#00000033' }), 0, 0)
    return frame
  }

  const wizard = (name, x, y, step, kids, o = {}) => {
    const frame = backdrop(name, x, y)
    const content = kit.add(kit.box('step', { w: bodyW, h: stepH, dir: 'column', gap: D('spacing-2'), clip: false }), kids)
    const dialog = kit.KitWizardDialog('Создать проект', o.steps ?? steps, step, [content], {
      w: dialogW,
      submitLabel: 'Создать',
      earlySubmit: true,
      ...o
    })
    // The dialog is 618 high: the body of 448 + 48, the header 57, the footer 65 and the border
    kit.at(frame, dialog, (1920 - dialogW) / 2, 1080 * 0.15)
    return frame
  }

  const iconTile = () => kit.add(
    kit.box('icon', {
      w: 32,
      h: 32,
      dir: 'row',
      align: 'center',
      justify: 'center',
      fill: T('theme-button-hovered'),
      stroke: T('primary-button-default'),
      radius: 6
    }),
    kit.icon('kit/HouseFill', P('Porpoise'))
  )

  const basics = (id, error) => [
    row('Тип проекта', select('Default'), { hint: 'Статусы и типы задач берутся из типа проекта', fill: true }),
    row('Название', kit.TextInput({ value: 'Сайт', w: fieldW }), { fill: true }),
    row(
      'Идентификатор',
      error
        ? kit.add(
          kit.col('Identifier', D('spacing-0_5')),
          kit.TextInput({ value: id, error: true, w: fieldW }),
          kit.text('Идентификатор уже существует', { size: 12, color: T('theme-warning-color') })
        )
        : kit.TextInput({ value: id, w: fieldW }),
      { hint: 'Префикс номеров задач: ' + id + '-1', fill: true }
    ),
    row(
      'Описание',
      kit.TextArea({ value: 'Корпоративный сайт компании: каталог услуг, блог и форма обратной связи.', rows: 2, w: fieldW }),
      { fill: true }
    ),
    row('Иконка', iconTile())
  ]

  wizard('Создание проекта - Шаг 1. Основное', 0, 0, 0, basics('WEB', false))
  wizard('Создание проекта - Шаг 1. Ошибка идентификатора', 2020, 0, 0, basics('APP', true), {
    canProceed: false,
    canSubmit: false
  })

  const roleCell = (role) => select(role, { w: 160 })
  const more = () => kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
  // The creator's row is locked: always a member and the owner
  const roleLocked = (role) => select(role, { w: 160, disabled: true })
  wizard('Создание проекта - Шаг 2. Участники и доступ', 0, 1200, 1, [
    row('Приватный проект', kit.Toggle(true), { hint: 'Видят только участники' }),
    kit.box('divider', { w: bodyW, h: 1, fill: T('theme-divider-color') }),
    kit.add(
      kit.box('members head', { w: bodyW, h: 32, dir: 'row', align: 'center', justify: 'space-between' }),
      kit.text('Участники · 3', { size: 14, weight: 600, color: T('theme-caption-color') }),
      kit.Button({ kind: 'secondary', size: 'small', label: 'Добавить участника', icon: 'plus' })
    ),
    kit.Table(
      [{ title: 'Сотрудник', w: bodyW - 200 - 56 }, { title: 'Роль', w: 200 }, { title: '', w: 56 }],
      [
        [person('Анна Смирнова'), roleLocked('Владелец'), more()],
        [person('Мария Козлова'), roleCell('Участник'), more()],
        [person('Иван Петров'), roleCell('Участник'), more()]
      ],
      { name: 'Members table' }
    )
  ])

  wizard('Создание проекта - Шаг 3. Задачи', 2020, 1200, 2, [
    row('Исполнитель по умолчанию', select('Не назначен', { icon: 'kit/PersonCircle', w: 240 })),
    row('Статус по умолчанию', select('Todo', { w: 240 }))
  ])

  wizard('Создание проекта - Шаг 4. Workflow', 0, 2400, 3, [
    kit.text('Выберите workflow для каждого типа задач проекта.', { size: 13, color: T('theme-dark-color') }),
    kit.Table(
      [{ title: 'Тип задачи', w: bodyW / 2 }, { title: 'Workflow', w: bodyW / 2 }],
      [
        ['Задача', select('Стандартный workflow', { w: 240 })],
        ['Ошибка', select('Исправление ошибок', { w: 240 })],
        ['Подзадача', select(undefined, { placeholder: 'Не выбрано', w: 240 })]
      ],
      { name: 'Workflow mapping' }
    ),
    kit.text('Workflow настраиваются в типе проекта, раздел Workflow; после создания проекта выбор можно поменять в настройках проекта.', { size: 13, color: T('theme-dark-color'), w: bodyW })
  ])

  wizard('Создание проекта - Шаг 4. Workflow - у типа нет workflow', 2020, 2400, 3, [
    kit.Callout(
      'У типа проекта «Default» пока нет workflow. Workflow настраиваются в типе проекта, раздел Workflow; после создания проекта их можно выбрать в настройках проекта, раздел Workflow.',
      { w: bodyW }
    )
  ])

  // Summary: the project head and who will be in it; the steps aside lead back
  const head = kit.add(
    kit.row('summary head', D('spacing-1_5')),
    iconTile(),
    kit.add(
      kit.col('title', 0),
      kit.text('Сайт', { size: 16, weight: 500, color: T('theme-caption-color') }),
      kit.text('WEB', { size: 12, color: T('theme-darker-color') })
    )
  )
  // A person of the list stands in the 32 px row of the product presenter
  const listPerson = (name) => kit.add(kit.box('person row', { w: 10, h: 32, dir: 'row', align: 'center', hs: 'auto' }), person(name))
  const list = (title, names) => kit.add(
    kit.col('list ' + title, D('spacing-1')),
    kit.text(title, { size: 14, weight: 600, lh: 1.3, color: T('theme-caption-color') }),
    names.map(listPerson)
  )
  const summary = [head, list('Владельцы (1)', ['Анна Смирнова']), list('Участники (2)', ['Мария Козлова', 'Иван Петров'])]
  wizard('Создание проекта - Шаг 5. Сводка', 0, 3600, 4, summary)

  // ---- Based on a project: the mode on step 1, a "what to take" step, the steps after it filled from the base ----
  const based = ['Основное', 'Что взять из основы', 'Участники и доступ', 'Задачи', 'Workflow', 'Сводка']
  const sub = (text, o = {}) => kit.text(text, { size: 13, color: T('global-secondary-TextColor'), ...o })
  const archiveChip = () => kit.KitChip('Архив', { kind: 'neutral', size: 'extra-small' })
  // The base field: the project in the value, its archive mark after the name
  const baseField = (name, archived) => {
    const b = kit.box('base field', { w: fieldW, h: 32 })
    kit.at(b, select(name, { icon: 'kit/HouseFill' }), 0, 0)
    if (archived) kit.at(b, archiveChip(), 106, 4)
    return b
  }
  const basedBasics = () => [
    row('Способ создания', kit.SegmentedControl(['Пустой проект', 'На основе проекта'], 'На основе проекта')),
    row('Проект-основа', baseField('Сайт 2025', true), { hint: 'Активный или архивный проект', fill: true }),
    row('Тип проекта', select('Default', { disabled: true, chevron: false }), { hint: 'Берётся из проекта-основы, изменить нельзя', fill: true }),
    row('Название', kit.TextInput({ value: 'Сайт 2026', w: fieldW }), { fill: true }),
    row('Идентификатор', kit.TextInput({ value: 'WEB26', w: fieldW }), { hint: 'Префикс номеров задач: WEB26-1', fill: true }),
    row(
      'Описание',
      kit.TextArea({ value: 'Корпоративный сайт компании: каталог услуг, блог и форма обратной связи.', rows: 2, w: fieldW }),
      { hint: 'Подставлено из проекта-основы', fill: true }
    ),
    row('Иконка', iconTile(), { hint: 'Подставлена из проекта-основы' })
  ]
  wizard('Создание проекта на основе - Шаг 1. Основное', 0, 4800, 0, basedBasics(), { steps: based })

  // The base picker: search, active and archived groups, the archive toggle under the list
  {
    const frame = wizard('Создание проекта на основе - Шаг 1. Выбор проекта-основы', 2020, 4800, 0, basedBasics(), { steps: based })
    const popup = kit.box('base popup', { w: fieldW, h: 10, dir: 'column', vs: 'auto', radius: D('small-BorderRadius'), fill: T('theme-popup-color'), stroke: T('theme-popup-divider') })
    popup.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 8, blur: 12, spread: 0, color: { color: '#0E131E', opacity: 0.12 } }]
    kit.add(
      popup,
      kit.add(kit.box('search', { w: fieldW, h: 10, dir: 'row', pad: [12, 12, 12, 12], vs: 'auto' }), kit.SearchInput({ placeholder: 'Поиск проекта', w: fieldW - 24 })),
      kit.Menu([
        { header: 'Активные' },
        { label: 'Маркетинг', icon: 'kit/HouseFill', hint: 'MKT' },
        { label: 'Мобильное приложение', icon: 'kit/HouseFill', hint: 'APP' },
        { label: 'Поддержка', icon: 'kit/HouseFill', hint: 'SUP' },
        { header: 'Архивные' },
        { label: 'Сайт 2025', icon: 'kit/HouseFill', hint: 'Архив · WEB', selected: true },
        { label: 'Лендинг 2024', icon: 'kit/HouseFill', hint: 'Архив · LND' }
      ], { w: fieldW - 2 }),
      kit.add(kit.box('footer', { w: fieldW, h: 10, dir: 'row', pad: [8, 12, 8, 12], vs: 'auto' }), kit.Toggle(true, 'Показывать архивные', { size: 'small' }))
    )
    // Under the base field: the body starts at 494 + 224 + 24, the field 236 further; the row is the second one
    kit.at(frame, popup, 978, 331)
  }

  // "What to take from the base": settings groups and content with counters on the right
  const baseHead = (name, id, archived) => kit.add(
    kit.row('base head', D('spacing-1')),
    sub('Из проекта'),
    kit.icon('kit/HouseFill', P('Porpoise')),
    kit.text(name, { size: 14, weight: 600, color: T('theme-caption-color') }),
    archived ? archiveChip() : null,
    sub(id + ' · тип Default')
  )
  const copyRow = (label, value, o = {}) => kit.add(
    kit.box('copy row ' + label, { w: o.w ?? bodyW, h: 24, dir: 'row', align: 'center', justify: 'space-between' }),
    kit.Checkbox(o.checked ?? true, label, { kind: 'brand', indeterminate: o.indeterminate, disabled: o.disabled, size: o.size }),
    typeof value === 'string' ? sub(value) : value
  )
  const groupTitle = (text) => kit.text(text, { size: 13, weight: 600, color: T('theme-caption-color') })
  const group = (title, rows) => kit.add(kit.col('group ' + title, D('spacing-1')), groupTitle(title), rows)
  const templatesValue = kit.add(
    kit.row('templates value', D('spacing-0_5')),
    kit.KitChip('выбрано 3 из 5', { kind: 'neutral', size: 'extra-small' }),
    kit.IconButton('kit/CaretUpFill', { kind: 'ghost', size: 'extra-small' })
  )
  const template = (title, type, checked) => copyRow(title, type, { checked, size: 'small', w: bodyW - 24 })
  const templateList = kit.add(
    kit.col('templates', D('spacing-0_5'), { pad: [0, 0, 0, 24] }),
    template('Баг-репорт', 'Ошибка', true),
    template('Новая страница сайта', 'Задача', true),
    template('Публикация статьи в блог', 'Задача', false),
    template('Релиз', 'Задача', true),
    template('Еженедельный отчёт', 'Задача', false)
  )
  const footnote = kit.text('Метки общие для всего пространства - их копировать не нужно. Задачи, комментарии и история не копируются.', { size: 12, color: T('global-secondary-TextColor'), w: bodyW })
  wizard('Создание проекта на основе - Шаг 2. Что взять из основы', 0, 6000, 1, [
    baseHead('Сайт 2025', 'WEB', true),
    group('Настройки проекта', [
      copyRow('Участники и роли', '1 владелец, 2 участника'),
      copyRow('Приватность', 'Приватный'),
      copyRow('Исполнитель и статус по умолчанию', 'Не назначен · Todo'),
      copyRow('Workflow для типов задач', '2 из 3 типов задач')
    ]),
    group('Содержимое', [
      copyRow('Шаблоны задач', templatesValue, { checked: false, indeterminate: true }),
      templateList,
      copyRow('Компоненты', '4', { checked: false }),
      copyRow('Этапы (milestones)', '2', { checked: false })
    ]),
    footnote
  ], { steps: based })

  wizard('Создание проекта на основе - Шаг 2. У основы нет шаблонов и workflow', 2020, 6000, 1, [
    baseHead('Поддержка', 'SUP', false),
    kit.Callout('В проекте «Поддержка» нет шаблонов задач, а его типам задач не назначен workflow. Эти пункты недоступны; workflow можно выбрать на шаге Workflow.', { tone: 'warning', w: bodyW }),
    group('Настройки проекта', [
      copyRow('Участники и роли', '1 владелец, 4 участника'),
      copyRow('Приватность', 'Открытый'),
      copyRow('Исполнитель и статус по умолчанию', 'Не назначен · Backlog'),
      copyRow('Workflow для типов задач', 'Нет workflow', { checked: false, disabled: true })
    ]),
    group('Содержимое', [
      copyRow('Шаблоны задач', 'Нет шаблонов', { checked: false, disabled: true }),
      copyRow('Компоненты', '3'),
      copyRow('Этапы (milestones)', 'Нет этапов', { checked: false, disabled: true })
    ]),
    footnote
  ], { steps: based })

  // Members step filled from the base: the callout names the source, the creator's row stays locked
  wizard('Создание проекта на основе - Шаг 3. Участники из основы', 0, 7200, 2, [
    kit.Callout('Участники, роли и настройки доступа взяты из проекта «Сайт 2025». Изменения здесь не затрагивают исходный проект.', { w: bodyW }),
    row('Приватный проект', kit.Toggle(true), { hint: 'Видят только участники' }),
    kit.box('divider', { w: bodyW, h: 1, fill: T('theme-divider-color') }),
    kit.add(
      kit.box('members head', { w: bodyW, h: 32, dir: 'row', align: 'center', justify: 'space-between' }),
      kit.text('Участники · 3', { size: 14, weight: 600, color: T('theme-caption-color') }),
      kit.Button({ kind: 'secondary', size: 'small', label: 'Добавить участника', icon: 'plus' })
    ),
    kit.Table(
      [{ title: 'Сотрудник', w: bodyW - 200 - 56 }, { title: 'Роль', w: 200 }, { title: '', w: 56 }],
      [
        [person('Анна Смирнова'), roleLocked('Владелец'), more()],
        [person('Мария Козлова'), roleCell('Участник'), more()],
        [person('Иван Петров'), roleCell('Участник'), more()]
      ],
      { name: 'Members table' }
    )
  ], { steps: based })

  // Summary: the base block (source, archive mark, what is copied) over the owners and members
  const kv = (key, value) => kit.add(
    kit.box('row ' + key, { w: bodyW - 26, h: 10, dir: 'row', gap: D('spacing-1'), align: 'start', vs: 'auto' }),
    kit.text(key, { size: 13, color: T('global-secondary-TextColor'), w: 152 }),
    typeof value === 'string' ? kit.text(value, { size: 14, color: T('theme-caption-color'), w: bodyW - 26 - 152 - 8 }) : value
  )
  const baseBlock = kit.add(
    kit.box('summary base', { w: bodyW, h: 10, dir: 'column', gap: D('spacing-1'), pad: [12, 12, 12, 12], vs: 'auto', radius: D('medium-BorderRadius'), stroke: T('theme-divider-color') }),
    kit.text('На основе проекта', { size: 14, weight: 600, lh: 1.3, color: T('theme-caption-color') }),
    kv('Основа', kit.add(kit.row('base', D('spacing-1')), kit.icon('kit/HouseFill', P('Porpoise')), kit.text('Сайт 2025 (WEB)', { size: 14, color: T('theme-caption-color') }), archiveChip())),
    kv('Шаблоны задач', '3 из 5'),
    kv('Workflow', '2 из 3 типов задач'),
    kv('Настройки', 'Участники и роли, Приватность, Исполнитель и статус по умолчанию'),
    kv('Не копируется', 'Компоненты, Этапы (milestones)')
  )
  const basedHead = kit.add(
    kit.row('summary head', D('spacing-1_5')),
    iconTile(),
    kit.add(
      kit.col('title', 0),
      kit.text('Сайт 2026', { size: 16, weight: 500, color: T('theme-caption-color') }),
      kit.text('WEB26', { size: 12, color: T('theme-darker-color') })
    )
  )
  wizard('Создание проекта на основе - Шаг 6. Сводка', 2020, 7200, 5, [
    basedHead,
    baseBlock,
    list('Владельцы (1)', ['Анна Смирнова']),
    list('Участники (2)', ['Мария Козлова', 'Иван Петров'])
  ], { steps: based })
}
await kit.settle()
