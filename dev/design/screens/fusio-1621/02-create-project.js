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
        { item: 'My issues', icon: 'tracker/myissues' },
        { item: 'All issues', icon: 'tracker/issues' },
        { divider: true },
        { item: 'All projects', icon: 'tracker/list' },
        { item: 'Labels', icon: 'tracker/labels' },
        { group: 'Your projects', add: true },
        { space: mkt.name, icon: 'tracker/home', color: 'Porpoise' },
        { item: 'Issues', icon: 'tracker/issues', selected: true, indent: true },
        { item: 'Components', icon: 'tracker/components', indent: true },
        { item: 'Milestones', icon: 'tracker/milestone', indent: true },
        { item: 'Templates', icon: 'tracker/issuetemplates', indent: true }
      ]
    })
    kit.SpaceHeader(main, { view: 'list', title: 'Issues', titleIcon: 'tracker/issues' })
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
    const dialog = kit.KitWizardDialog('Создать проект', steps, step, [content], {
      w: dialogW,
      submitLabel: 'Создать',
      earlySubmit: true,
      ...o
    })
    // The dialog is 618 high: the body of 448 + 48, the header 57, the footer 65 and the border
    kit.at(frame, dialog, (1920 - dialogW) / 2, 1080 * 0.15)
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
    kit.icon('tracker/home', P('Porpoise'))
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
    row('Исполнитель по умолчанию', select('Не назначен', { icon: 'contact/Person', w: 240 })),
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
}
await kit.settle()
