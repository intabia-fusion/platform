// Board settings page of the tracker (FUSIO-1613, accepted), one frame per tab.
// Imported from the hand-edited fusio-1613.pen by dev/pen/import.mjs; the density samples of the Card tab are kit.IssueCard.

await kit.page('Board settings')
// A condition as in the product: the tinted chip with icons or avatars as values and a separate "+"
const prio = (...levels) => levels.map((l) => kit.PriorityIcon(l))
const addValue = () => kit.IconButton('plus', { kind: 'ghost', size: 'extra-small', name: 'Add value' })
{
  const { main } = kit.Workbench('Настройка доски - Основное', 0, 0, {
    tab: 'Настройки доски',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board', selected: true },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox2 = kit.SettingsLayout(main, {
    back: 'К доске',
    title: 'Настройки доски',
    tabsWidth: 232,
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Колонки', 'board'],
      ['Дорожки', 'timeline'],
      ['Быстрые фильтры', 'star'],
      ['Цвета карточек', 'milestone']
    ],
    tab: 'Основное',
    close: true,
    actions: [
      kit.Button({
        kind: 'ghost',
        size: 'small',
        label: 'Основная доска',
        icon: 'board',
        menu: true,
        name: 'Board in settings'
      })
    ]
  })
  kit.add(contentBox2, kit.SectionTitle('Основное', 'Какие задачи попадают на доску и кто может её менять.', 720))
  kit.add(contentBox2, kit.SettingRow('Название', kit.TextInput({ w: 420, value: 'Основная доска' }), { kind: 'column' }))
  kit.add(contentBox2, kit.SettingRow('Описание', kit.TextArea({ rows: 2, w: 420, placeholder: 'Добавить описание...' }), { kind: 'column' }))
  kit.add(contentBox2, kit.SettingRow(
    'Проекты',
    kit.add(
      kit.row('projects', 6),
      kit.Chip([kit.icon('board', undefined, 14), kit.text('Мобильное приложение · APP', { size: 13 })]),
      kit.Chip([kit.icon('board', undefined, 14), kit.text('Маркетинг · MKT', { size: 13 })]),
      kit.Button({ kind: 'tertiary', size: 'extra-small', label: 'Добавить', icon: 'plus' })
    ),
    { hint: 'Задачи из нескольких проектов на одной доске', kind: 'column', alignTop: true }
  ))
  kit.add(contentBox2, kit.SettingRow(
    'Фильтр доски',
    kit.add(
      kit.col('filter block', 8),
      kit.add(
        kit.box('filters', { w: 480, dir: 'row', gap: 6, wrap: true, vs: 'auto' }),
        kit.FilterChip('Приоритет', 'один из', prio('low', 'medium', 'high', 'urgent'), { condition: true }),
        kit.FilterChip('Статус', 'не равен', kit.StatusIcon('won'), { condition: true }),
        kit.Button({ kind: 'ghost', size: 'extra-small', label: 'Условие', icon: 'plus' })
      ),
      kit.text(
        'Под фильтр попадает 40 из 41 задачи проектов доски. Остальные на доске не видны.',
        { size: 12, color: T('theme-darker-color') }
      )
    ),
    { hint: 'Условия объединяются через «И», как в фильтре списка задач', kind: 'column', alignTop: true }
  ))
  kit.add(contentBox2, kit.SettingRow('Порядок карточек', kit.Dropdown({ values: ['Пользовательский'], kind: 'secondary' }), { kind: 'column' }))
}
{
  const { main } = kit.Workbench('Настройка доски - Участники и доступ', 2020, 0, {
    tab: 'Настройки доски',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board', selected: true },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox2 = kit.SettingsLayout(main, {
    back: 'К доске',
    title: 'Настройки доски',
    tabsWidth: 232,
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Колонки', 'board'],
      ['Дорожки', 'timeline'],
      ['Быстрые фильтры', 'star'],
      ['Цвета карточек', 'milestone']
    ],
    tab: 'Участники и доступ',
    close: true,
    actions: [
      kit.Button({
        kind: 'ghost',
        size: 'small',
        label: 'Основная доска',
        icon: 'board',
        menu: true,
        name: 'Board in settings'
      })
    ]
  })
  kit.add(contentBox2, kit.SectionTitle('Участники и доступ'))
  kit.add(contentBox2, kit.SettingRow(
    'Видимость',
    kit.add(
      kit.col('vis', 10),
      kit.Radio(true, 'Видно всем'),
      kit.Radio(false, 'Только я', 'Личная доска, видна только вам')
    ),
    { kind: 'column', alignTop: true }
  ))
  kit.add(contentBox2, kit.add(
    kit.col('board members', 12, { w: 760, pad: [16, 0, 16, 0] }),
    kit.add(
      kit.box('members head', { w: 760, h: 32, dir: 'row', align: 'center', justify: 'space-between' }),
      kit.text('Участники · 3', { weight: 600, color: T('theme-caption-color') }),
      kit.Button({ kind: 'secondary', size: 'small', label: 'Добавить участника', icon: 'plus' })
    ),
    kit.Table(
      [{ title: 'Сотрудник', w: 504 }, { title: 'Роль', w: 200 }, { title: '', w: 56 }],
      [
        [
          kit.add(kit.row('person', 8), kit.Avatar('СА', 'Sky', 24), kit.text('Анна Смирнова')),
          'Автор',
          ''
        ],
        [
          kit.add(kit.row('person', 8), kit.Avatar('КМ', 'Grass', 24), kit.text('Мария Козлова')),
          'Может править',
          kit.IconButton('more', { kind: 'ghost', size: 'extra-small', name: 'Удалить участника' })
        ],
        [
          kit.add(kit.row('person', 8), kit.Avatar('ПИ', 'Watermelon', 24), kit.text('Иван Петров')),
          'Может править',
          kit.IconButton('more', { kind: 'ghost', size: 'extra-small', name: 'Удалить участника' })
        ]
      ],
      { name: 'Board members table' }
    )
  ))
}
{
  const { main } = kit.Workbench('Настройка доски - Колонки', 0, 1200, {
    tab: 'Настройки доски',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board', selected: true },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox = kit.SettingsLayout(main, {
    back: 'К доске',
    title: 'Настройки доски',
    tabsWidth: 232,
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Колонки', 'board'],
      ['Дорожки', 'timeline'],
      ['Быстрые фильтры', 'star'],
      ['Цвета карточек', 'milestone']
    ],
    tab: 'Колонки',
    close: true,
    actions: [
      kit.Button({
        kind: 'ghost',
        size: 'small',
        label: 'Основная доска',
        icon: 'board',
        menu: true,
        name: 'Board in settings'
      })
    ]
  })
  kit.add(contentBox, kit.SectionTitle(
    'Колонки',
    'Колонка объединяет один или несколько статусов. Перетащите статус в колонку, чтобы задачи в нём появились на доске. Открытые статусы без колонки на доске не видны, закрытые без колонки уходят с доски по замыслу.',
    1218
  ))
  kit.add(contentBox, kit.add(
    kit.box('options', { w: 1218, h: 32, dir: 'row', gap: 32, align: 'center' }),
    kit.Toggle(true, 'WIP-лимиты'),
    kit.Button({ kind: 'secondary', size: 'small', label: 'Добавить колонку', icon: 'plus' })
  ))
  const dropTarget = kit.box(
    'drop target',
    { w: 206, h: 32, fill: '#CF13A20F', stroke: T('primary-button-default'), strokeW: 2, radius: 4 }
  )
  kit.add(contentBox, kit.add(
    kit.box(
      'Columns editor',
      { w: 1218, h: 560, dir: 'row', gap: 12, pad: [12, 12, 12, 12], fill: T('theme-list-row-color'), radius: 8 }
    ),
    kit.add(
      kit.box('Unmapped statuses', {
        w: 220,
        h: 530,
        dir: 'column',
        gap: 8,
        pad: [12, 12, 12, 12],
        fill: T('theme-popup-color'),
        stroke: P('Sunshine'),
        radius: 8
      }),
      kit.text('Статусы без колонки', { weight: 600 }),
      kit.Notice('1 задача не видна на доске', 'warning', { w: 196 }),
      kit.StatusChip('Blocked', 'active', {
        drag: true,
        count: 1,
        w: 196,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      kit.add(
        kit.box(
          'drop zone',
          {
            w: 196,
            h: 64,
            dir: 'row',
            align: 'center',
            justify: 'center',
            stroke: T('theme-button-border'),
            radius: 6
          }
        ),
        kit.text(
          'Перетащите статус сюда,\nчтобы убрать с доски',
          { size: 12, color: T('theme-darker-color'), align: 'center' }
        )
      )
    ),
    kit.add(
      kit.box('Column Backlog', {
        w: 226,
        h: 530,
        dir: 'column',
        gap: 8,
        pad: [10, 10, 10, 10],
        fill: T('theme-popup-color'),
        stroke: T('theme-divider-color'),
        radius: 8
      }),
      kit.add(
        kit.box('head', { w: 206, h: 32, dir: 'row', gap: 4, align: 'center' }),
        kit.icon('drag', T('theme-darker-color')),
        kit.StatusIcon('backlog'),
        kit.add(
          kit.box('name', { w: 130, h: 32, dir: 'row', pad: [0, 8, 0, 8], align: 'center', radius: 6 }),
          kit.text('Backlog', { weight: 600 })
        ),
        kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
      ),
      kit.add(
        kit.box('WIP', { w: 206, h: 28, dir: 'row', gap: 6, align: 'center' }),
        kit.add(
          kit.box('макс', {
            w: 100,
            h: 28,
            dir: 'row',
            gap: 6,
            pad: [0, 8, 0, 8],
            align: 'center',
            fill: T('input-BackgroundColor'),
            radius: 6
          }),
          kit.text('макс', { size: 12, color: T('theme-darker-color') }),
          kit.text('—', { size: 13, color: T('theme-darker-color') })
        )
      ),
      kit.text('1 статус · 4 задачи', { size: 12, color: T('theme-dark-color') }),
      kit.StatusChip('Backlog', 'backlog', {
        drag: true,
        count: 4,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      })
    ),
    kit.add(
      kit.box('Column To Do', {
        w: 226,
        h: 530,
        dir: 'column',
        gap: 8,
        pad: [10, 10, 10, 10],
        fill: T('theme-popup-color'),
        stroke: T('theme-divider-color'),
        radius: 8
      }),
      kit.add(
        kit.box('head', { w: 206, h: 32, dir: 'row', gap: 4, align: 'center' }),
        kit.icon('drag', T('theme-darker-color')),
        kit.StatusIcon('todo'),
        kit.add(
          kit.box('name', { w: 130, h: 32, dir: 'row', pad: [0, 8, 0, 8], align: 'center', radius: 6 }),
          kit.text('To Do', { weight: 600 })
        ),
        kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
      ),
      kit.add(
        kit.box('WIP', { w: 206, h: 28, dir: 'row', gap: 6, align: 'center' }),
        kit.add(
          kit.box('макс', {
            w: 100,
            h: 28,
            dir: 'row',
            gap: 6,
            pad: [0, 8, 0, 8],
            align: 'center',
            fill: T('input-BackgroundColor'),
            radius: 6
          }),
          kit.text('макс', { size: 12, color: T('theme-darker-color') }),
          kit.text('—', { size: 13, color: T('theme-darker-color') })
        )
      ),
      kit.text('3 статуса · 9 задач', { size: 12, color: T('theme-dark-color') }),
      kit.StatusChip('Todo', 'todo', {
        drag: true,
        count: 7,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      kit.StatusChip('Design', 'todo', {
        drag: true,
        count: 1,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      kit.StatusChip('Specification', 'todo', {
        drag: true,
        count: 1,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      dropTarget
    ),
    kit.add(
      kit.box('Column On Hold', {
        w: 226,
        h: 530,
        dir: 'column',
        gap: 8,
        pad: [10, 10, 10, 10],
        fill: T('theme-popup-color'),
        stroke: T('theme-divider-color'),
        radius: 8
      }),
      kit.add(
        kit.box('head', { w: 206, h: 32, dir: 'row', gap: 4, align: 'center' }),
        kit.icon('drag', T('theme-darker-color')),
        kit.StatusIcon('todo'),
        kit.add(
          kit.box('name', { w: 130, h: 32, dir: 'row', pad: [0, 8, 0, 8], align: 'center', radius: 6 }),
          kit.text('On Hold', { weight: 600 })
        ),
        kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
      ),
      kit.add(
        kit.box('WIP', { w: 206, h: 28, dir: 'row', gap: 6, align: 'center' }),
        kit.add(
          kit.box('макс', {
            w: 100,
            h: 28,
            dir: 'row',
            gap: 6,
            pad: [0, 8, 0, 8],
            align: 'center',
            fill: T('input-BackgroundColor'),
            radius: 6
          }),
          kit.text('макс', { size: 12, color: T('theme-darker-color') }),
          kit.text('—', { size: 13, color: T('theme-darker-color') })
        )
      ),
      kit.text('1 статус · 1 задача', { size: 12, color: T('theme-dark-color') }),
      kit.StatusChip('On Hold', 'todo', {
        drag: true,
        count: 1,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      })
    ),
    kit.add(
      kit.box('Column In Progress', {
        w: 226,
        h: 530,
        dir: 'column',
        gap: 8,
        pad: [10, 10, 10, 10],
        fill: T('theme-popup-color'),
        stroke: T('primary-button-default'),
        radius: 8
      }),
      kit.add(
        kit.box('head', { w: 206, h: 32, dir: 'row', gap: 4, align: 'center' }),
        kit.icon('drag', T('theme-darker-color')),
        kit.StatusIcon('active'),
        kit.add(
          kit.box('name', { w: 130, h: 32, dir: 'row', pad: [0, 8, 0, 8], align: 'center', radius: 6 }),
          kit.text('In Progress', { weight: 600 })
        ),
        kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
      ),
      kit.add(
        kit.box('WIP', { w: 206, h: 28, dir: 'row', gap: 6, align: 'center' }),
        kit.add(
          kit.box('макс', {
            w: 100,
            h: 28,
            dir: 'row',
            gap: 6,
            pad: [0, 8, 0, 8],
            align: 'center',
            fill: T('input-BackgroundColor'),
            radius: 6
          }),
          kit.text('макс', { size: 12, color: T('theme-darker-color') }),
          kit.text('8', { size: 13 })
        )
      ),
      kit.text('6 статусов · 10 задач', { size: 12, color: T('theme-dark-color') }),
      kit.StatusChip('In Progress', 'active', {
        drag: true,
        count: 6,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      kit.StatusChip('Development', 'active', {
        drag: true,
        count: 1,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      kit.StatusChip('Prototyping', 'active', {
        drag: true,
        count: 1,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      kit.StatusChip('Integration', 'active', {
        drag: true,
        count: 1,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      kit.StatusChip('Verification', 'active', {
        drag: true,
        count: 0,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      }),
      kit.StatusChip('Approval', 'active', {
        drag: true,
        count: 1,
        w: 206,
        h: 32,
        fill: T('theme-popup-color'),
        stroke: T('theme-button-border'),
        size: 13
      })
    )
  ))

}
{
  const { main } = kit.Workbench('Настройка доски - Дорожки', 2020, 1200, {
    tab: 'Настройки доски',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board', selected: true },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox3 = kit.SettingsLayout(main, {
    back: 'К доске',
    title: 'Настройки доски',
    tabsWidth: 232,
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Колонки', 'board'],
      ['Дорожки', 'timeline'],
      ['Быстрые фильтры', 'star'],
      ['Цвета карточек', 'milestone']
    ],
    tab: 'Дорожки',
    close: true,
    actions: [
      kit.Button({
        kind: 'ghost',
        size: 'small',
        label: 'Основная доска',
        icon: 'board',
        menu: true,
        name: 'Board in settings'
      })
    ]
  })
  kit.add(contentBox3, kit.SectionTitle(
    'Дорожки',
    'Горизонтальная группировка задач на доске. Пользователь может переключить дорожки у себя в параметрах вида.',
    720
  ))
  kit.add(contentBox3, kit.add(
    kit.box('Swimlane by', { w: 720, dir: 'column', gap: 12, vs: 'auto' }),
    kit.Radio(false, 'Нет'),
    kit.add(kit.row('field lane', 12), kit.Radio(true, 'По полю'), kit.Dropdown({ values: ['Исполнитель'], kind: 'secondary' }))
  ))

}
{
  const { main } = kit.Workbench('Настройка доски - Быстрые фильтры', 0, 2400, {
    tab: 'Настройки доски',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board', selected: true },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox4 = kit.SettingsLayout(main, {
    back: 'К доске',
    title: 'Настройки доски',
    tabsWidth: 232,
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Колонки', 'board'],
      ['Дорожки', 'timeline'],
      ['Быстрые фильтры', 'star'],
      ['Цвета карточек', 'milestone']
    ],
    tab: 'Быстрые фильтры',
    close: true,
    actions: [
      kit.Button({
        kind: 'ghost',
        size: 'small',
        label: 'Основная доска',
        icon: 'board',
        menu: true,
        name: 'Board in settings'
      })
    ]
  })
  kit.add(contentBox4, kit.SectionTitle(
    'Быстрые фильтры',
    'Кнопки над доской. Несколько включённых фильтров объединяются через «И».',
    720
  ))
  const drag = (name) => kit.add(kit.row('name', 8), kit.icon('drag', T('theme-darker-color')), kit.text(name, { weight: 500 }))
  const quick = (name, attr, op, value) => [
    drag(name),
    kit.add(kit.row('c', 6), kit.FilterChip(attr, op, value, { plain: true, condition: true }), addValue()),
    kit.IconButton('trash', { kind: 'ghost', size: 'extra-small' })
  ]
  kit.add(contentBox4, kit.Table(
    [{ title: 'Название', w: 200 }, { title: 'Условие', w: 962 }, { title: '', w: 56 }],
    [
      quick('Только мои', 'Исполнитель', 'равен', kit.Avatar('СА', 'Sky', 24)),
      quick('Разработка', 'Исполнитель', 'один из', [kit.Avatar('ПИ', 'Watermelon', 24), kit.Avatar('КМ', 'Grass', 24)]),
      quick('Тестирование', 'Исполнитель', 'равен', kit.Avatar('ВО', 'Crocodile', 24)),
      quick('iOS', 'Компонент', 'равен', 'iOS'),
      quick('Срочные', 'Приоритет', 'равен', prio('urgent'))
    ],
    { name: 'Quick filters table' }
  ))
  kit.add(contentBox4, kit.add(
    kit.row('actions', 8),
    kit.Button({ kind: 'secondary', size: 'small', label: 'Быстрый фильтр', icon: 'plus' })
  ))
}
{
  const { main } = kit.Workbench('Настройка доски - Цвета карточек', 2020, 2400, {
    tab: 'Настройки доски',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board', selected: true },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox5 = kit.SettingsLayout(main, {
    back: 'К доске',
    title: 'Настройки доски',
    tabsWidth: 232,
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Колонки', 'board'],
      ['Дорожки', 'timeline'],
      ['Быстрые фильтры', 'star'],
      ['Цвета карточек', 'milestone']
    ],
    tab: 'Цвета карточек',
    close: true,
    actions: [
      kit.Button({
        kind: 'ghost',
        size: 'small',
        label: 'Основная доска',
        icon: 'board',
        menu: true,
        name: 'Board in settings'
      })
    ]
  })
  kit.add(contentBox5, kit.SectionTitle(
    'Цвета карточек',
    'Рамка карточки окрашивается по первому подходящему правилу. Цвет заголовка колонки от этой настройки не зависит: его задаёт категория статусов, а красным колонка выделяется при превышении WIP-лимита.',
    720
  ))
  kit.add(contentBox5, kit.Table(
    [{ title: 'Цвет', w: 90 }, { title: 'Условие', w: 1072 }, { title: '', w: 56 }],
    [
      [
        kit.add(kit.row('c', 6), kit.icon('drag', T('theme-darker-color')), kit.Swatch(P('Orange'))),
        kit.add(
          kit.row('c', 6),
          kit.FilterChip('Статус', 'равен', [kit.StatusIcon('active'), kit.text('Ready for QA', { size: 14 })], { plain: true, condition: true }),
          addValue()
        ),
        kit.IconButton('trash', { kind: 'ghost', size: 'extra-small' })
      ],
      [
        kit.add(kit.row('c', 6), kit.icon('drag', T('theme-darker-color')), kit.Swatch(P('Firework'))),
        kit.add(
          kit.row('c', 6),
          kit.FilterChip('Статус', 'равен', [kit.StatusIcon('active'), kit.text('Peer Review', { size: 14 })], { plain: true, condition: true }),
          addValue()
        ),
        kit.IconButton('trash', { kind: 'ghost', size: 'extra-small' })
      ]
    ],
    { name: 'Card colors table' }
  ))
  kit.add(contentBox5, kit.Button({ kind: 'secondary', size: 'small', label: 'Правило', icon: 'plus' }))
  kit.add(contentBox5, kit.text('Пример', { size: 12, color: T('theme-darker-color') }))
  kit.add(contentBox5, kit.add(
    kit.box('Preview', { w: 720, dir: 'row', gap: 12, vs: 'auto' }),
    kit.IssueCard(
      {
        id: 'APP-29',
        cat: 'active',
        title: 'Ссылки на товар из внешних источников',
        assignee: ['КМ', 'Grass'],
        est: '3h',
        priority: 'medium',
        accent: P('Orange')
      },
      264
    ),
    kit.IssueCard(
      {
        id: 'APP-27',
        cat: 'active',
        title: 'Проверка количества товара в корзине',
        assignee: ['ПИ', 'Watermelon'],
        est: '3h',
        priority: 'high',
        accent: P('Firework')
      },
      264
    )
  ))
}

await kit.settle()
