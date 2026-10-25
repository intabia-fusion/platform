// Task boards of the tracker (FUSIO-1613, accepted): board view, board switcher, column statuses, kanban with lanes.
// Imported from the hand-edited fusio-1613.pen by dev/pen/import.mjs; the cards are kit.IssueCard, the card density is its `density`.

await kit.page('Task boards')
{
  const { main } = kit.Workbench('Доска - вид', 0, 0, {
    tab: 'Основная доска',
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
  const sep = kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') })
  kit.SpaceHeader(main, {
    view: 'board',
    titleNode: kit.Button(
      { kind: 'ghost', size: 'small', label: 'Основная доска', icon: 'board', menu: true, name: 'Board selector' }
    ),
    actions: [
      kit.Notice('1 статус без колонки · 1 задача не видна', 'warning', { pill: true }),
      kit.Button({ kind: 'ghost', size: 'medium', label: 'Настройки доски', icon: 'gear', name: 'Board settings' })
    ],
    filters: [
      sep,
      kit.QuickFilter('Только мои', false),
      kit.QuickFilter('Разработка', false),
      kit.QuickFilter('Тестирование', true),
      kit.QuickFilter('iOS', false),
      kit.QuickFilter('Срочные', false)
    ],
    tabs: []
  })
  kit.at(main, kit.add(
    kit.box('Board', { w: 1515, h: 931, dir: 'column', gap: 8, pad: [12, 16, 0, 16] }),
    kit.add(
      kit.box('Column headers', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('Column To Do', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('To Do', 'todo', 9, 234)
      ),
      kit.add(
        kit.box('Column On Hold', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('On Hold', 'todo', 1, 234)
      ),
      kit.add(
        kit.box('Column In Progress', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('In Progress', 'active', 10, 234, { limit: 8, over: true })
      ),
      kit.add(
        kit.box('Column Peer Review', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Peer Review', 'active', 2, 234)
      ),
      kit.add(
        kit.box('Column Ready for QA', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Ready for QA', 'active', 1, 234, { limit: 12 })
      ),
      kit.add(
        kit.box('Column Done', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Done', 'won', 9, 234)
      )
    ),
    kit.add(
      kit.box('Swimlane Внеочередные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Внеочередные', { weight: 600 }),
      kit.Count(2),
      kit.text('Приоритет = Urgent', { size: 12, color: T('theme-darker-color') })
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-6',
          cat: 'active',
          title: 'Интеграция с платёжным провайдером',
          assignee: ['ПИ', 'Watermelon'],
          est: '21h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-7',
          cat: 'won',
          title: 'Баг: краш при открытии профиля на Android 12',
          assignee: ['ВО', 'Crocodile'],
          est: '3h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['баг', 'Firework']]
        })
      )
    ),
    kit.add(
      kit.box('Swimlane Все остальные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Все остальные', { weight: 600 }),
      kit.Count(37)
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-2',
          cat: 'todo',
          title: 'Подготовить пресс-релиз о запуске приложения',
          assignee: ['СА', 'Sky'],
          est: '4h',
          priority: 'medium'
        }),
        kit.IssueCard({
          id: 'MKT-5',
          cat: 'todo',
          title: 'Email-рассылка по базе подписчиков',
          assignee: ['СА', 'Sky'],
          est: '3h',
          priority: 'high'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-22',
          cat: 'todo',
          title: 'Поддержка Apple Pay',
          assignee: ['ПИ', 'Watermelon'],
          est: '8h',
          priority: 'medium'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-1',
          cat: 'active',
          title: 'Запуск рекламной кампании в соцсетях',
          assignee: ['СА', 'Sky'],
          est: '16h',
          priority: 'high'
        }),
        kit.IssueCard({
          id: 'APP-3',
          cat: 'active',
          title: 'Push-уведомления о статусе заказа',
          assignee: ['ПИ', 'Watermelon'],
          est: '13h',
          priority: 'high',
          sub: '1/2',
          component: 'iOS',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-27',
          cat: 'active',
          title: 'Проверка количества товара в корзине',
          assignee: ['ПИ', 'Watermelon'],
          est: '3h',
          priority: 'high',
          accent: P('Firework')
        }),
        kit.IssueCard({
          id: 'APP-28',
          cat: 'active',
          title: 'Рефакторинг API-клиента',
          assignee: ['ПИ', 'Watermelon'],
          est: '5h',
          priority: 'medium',
          accent: P('Firework')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-29',
          cat: 'active',
          title: 'Ссылки на товар из внешних источников',
          assignee: ['КМ', 'Grass'],
          est: '3h',
          priority: 'medium',
          accent: P('Orange')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-4',
          cat: 'won',
          title: 'Обновить лендинг на сайте',
          assignee: ['КМ', 'Grass'],
          est: '6h',
          priority: 'medium'
        }),
        kit.IssueCard({ id: 'MKT-6', cat: 'lost', title: 'Партнёрство с блогерами-техноблогерами', priority: 'low' })
      )
    )
  ), 0, 113)
  kit.at(main, kit.add(
    kit.box('Color legend', { w: 1483, dir: 'row', gap: 20, align: 'center', wrap: true, vs: 'auto' }),
    kit.text('Цвета', { size: 12, weight: 600, color: T('theme-dark-color') }),
    kit.add(
      kit.row('header categories', 4),
      kit.Swatch(PB('Porpoise'), 14),
      kit.Swatch(PB('Cerulean'), 14),
      kit.Swatch(PB('Grass'), 14),
      kit.text('заголовок колонки - категория её статусов', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(T('theme-state-negative-color'), 14),
      kit.text(
        'красный лимит в заголовке - превышен WIP-лимит (In Progress: 10 из 8)',
        { size: 12, color: T('theme-dark-color'), name: 'In Progress: превышен WIP-лимит (10 из 8' }
      )
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Orange'), 14),
      kit.text('рамка карточки: статус Ready for QA', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: статус Peer Review', { size: 12, color: T('theme-dark-color') })
    )
  ), 16, 1000)
}
{
  const { main } = kit.Workbench('Доска - выбор доски', 2020, 0, {
    tab: 'Основная доска',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { group: 'Доски', add: true },
      { item: 'Основная доска', icon: 'board', selected: true },
      { item: 'Релиз 1.0', icon: 'board' },
      { item: 'Тестирование', icon: 'board' },
      { item: 'Мой спринт', icon: 'board' },
      { group: 'Сохранённые фильтры', add: true },
      { item: 'Срочные без исполнителя', indent: true },
      { item: 'Мои на ревью', indent: true },
      { item: 'Баги iOS', indent: true },
      { item: 'Просроченные', indent: true },
      { item: 'Без оценки', indent: true },
      { item: 'Созданные мной за неделю', indent: true },
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
  const sep2 = kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') })
  kit.SpaceHeader(main, {
    view: 'board',
    titleNode: kit.Button(
      { kind: 'ghost', size: 'small', label: 'Основная доска', icon: 'board', menu: true, name: 'Board selector' }
    ),
    actions: [
      kit.Notice('1 статус без колонки · 1 задача не видна', 'warning', { pill: true }),
      kit.Button({ kind: 'ghost', size: 'medium', label: 'Настройки доски', icon: 'gear', name: 'Board settings' })
    ],
    filters: [
      sep2,
      kit.QuickFilter('Только мои', false),
      kit.QuickFilter('Разработка', false),
      kit.QuickFilter('Тестирование', true),
      kit.QuickFilter('iOS', false),
      kit.QuickFilter('Срочные', false)
    ],
    tabs: []
  })
  kit.at(main, kit.add(
    kit.box('Board', { w: 1515, h: 931, dir: 'column', gap: 8, pad: [12, 16, 0, 16] }),
    kit.add(
      kit.box('Column headers', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('Column To Do', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('To Do', 'todo', 9, 234)
      ),
      kit.add(
        kit.box('Column On Hold', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('On Hold', 'todo', 1, 234)
      ),
      kit.add(
        kit.box('Column In Progress', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('In Progress', 'active', 10, 234, { limit: 8, over: true })
      ),
      kit.add(
        kit.box('Column Peer Review', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Peer Review', 'active', 2, 234)
      ),
      kit.add(
        kit.box('Column Ready for QA', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Ready for QA', 'active', 1, 234, { limit: 12 })
      ),
      kit.add(
        kit.box('Column Done', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Done', 'won', 9, 234)
      )
    ),
    kit.add(
      kit.box('Swimlane Внеочередные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Внеочередные', { weight: 600 }),
      kit.Count(2),
      kit.text('Приоритет = Urgent', { size: 12, color: T('theme-darker-color') })
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-6',
          cat: 'active',
          title: 'Интеграция с платёжным провайдером',
          assignee: ['ПИ', 'Watermelon'],
          est: '21h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-7',
          cat: 'won',
          title: 'Баг: краш при открытии профиля на Android 12',
          assignee: ['ВО', 'Crocodile'],
          est: '3h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['баг', 'Firework']]
        })
      )
    ),
    kit.add(
      kit.box('Swimlane Все остальные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Все остальные', { weight: 600 }),
      kit.Count(37)
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-2',
          cat: 'todo',
          title: 'Подготовить пресс-релиз о запуске приложения',
          assignee: ['СА', 'Sky'],
          est: '4h',
          priority: 'medium'
        }),
        kit.IssueCard({
          id: 'MKT-5',
          cat: 'todo',
          title: 'Email-рассылка по базе подписчиков',
          assignee: ['СА', 'Sky'],
          est: '3h',
          priority: 'high'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-22',
          cat: 'todo',
          title: 'Поддержка Apple Pay',
          assignee: ['ПИ', 'Watermelon'],
          est: '8h',
          priority: 'medium'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-1',
          cat: 'active',
          title: 'Запуск рекламной кампании в соцсетях',
          assignee: ['СА', 'Sky'],
          est: '16h',
          priority: 'high'
        }),
        kit.IssueCard({
          id: 'APP-3',
          cat: 'active',
          title: 'Push-уведомления о статусе заказа',
          assignee: ['ПИ', 'Watermelon'],
          est: '13h',
          priority: 'high',
          sub: '1/2',
          component: 'iOS',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-27',
          cat: 'active',
          title: 'Проверка количества товара в корзине',
          assignee: ['ПИ', 'Watermelon'],
          est: '3h',
          priority: 'high',
          accent: P('Firework')
        }),
        kit.IssueCard({
          id: 'APP-28',
          cat: 'active',
          title: 'Рефакторинг API-клиента',
          assignee: ['ПИ', 'Watermelon'],
          est: '5h',
          priority: 'medium',
          accent: P('Firework')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-29',
          cat: 'active',
          title: 'Ссылки на товар из внешних источников',
          assignee: ['КМ', 'Grass'],
          est: '3h',
          priority: 'medium',
          accent: P('Orange')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-4',
          cat: 'won',
          title: 'Обновить лендинг на сайте',
          assignee: ['КМ', 'Grass'],
          est: '6h',
          priority: 'medium'
        }),
        kit.IssueCard({ id: 'MKT-6', cat: 'lost', title: 'Партнёрство с блогерами-техноблогерами', priority: 'low' })
      )
    )
  ), 0, 113)
  kit.at(main, kit.add(
    kit.box('Color legend', { w: 1483, dir: 'row', gap: 20, align: 'center', wrap: true, vs: 'auto' }),
    kit.text('Цвета', { size: 12, weight: 600, color: T('theme-dark-color') }),
    kit.add(
      kit.row('header categories', 4),
      kit.Swatch(PB('Porpoise'), 14),
      kit.Swatch(PB('Cerulean'), 14),
      kit.Swatch(PB('Grass'), 14),
      kit.text('заголовок колонки - категория её статусов', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(T('theme-state-negative-color'), 14),
      kit.text(
        'красный лимит в заголовке - превышен WIP-лимит (In Progress: 10 из 8)',
        { size: 12, color: T('theme-dark-color'), name: 'In Progress: превышен WIP-лимит (10 из 8' }
      )
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Orange'), 14),
      kit.text('рамка карточки: статус Ready for QA', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: статус Peer Review', { size: 12, color: T('theme-dark-color') })
    )
  ), 16, 1000)
  kit.at(main, kit.Menu(
    [
      { header: 'Мобильное приложение · APP' },
      { label: 'Релиз 1.0', icon: 'board' },
      { label: 'Тестирование', icon: 'kit/PushPin', hint: 'в навигаторе' },
      '-',
      { header: 'Несколько проектов' },
      { label: 'Основная доска', icon: 'board', hint: 'APP · MKT', selected: true },
      '-',
      { header: 'Мои доски' },
      { label: 'Мой спринт', icon: 'kit/PushPin', hint: 'в навигаторе' },
      '-',
      { label: 'Создать доску', icon: 'plus', accent: true },
      { label: 'Настройки доски', icon: 'gear' }
    ],
    { w: 320, name: 'Board selector popup' }
  ), 208, 46)
}
{
  const { main } = kit.Workbench('Доска - вход в настройки', 0, 1200, {
    tab: 'Основная доска',
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
  const sep3 = kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') })
  kit.SpaceHeader(main, {
    view: 'board',
    titleNode: kit.Button(
      { kind: 'ghost', size: 'small', label: 'Основная доска', icon: 'board', menu: true, name: 'Board selector' }
    ),
    actions: [
      kit.Notice('1 статус без колонки · 1 задача не видна', 'warning', { pill: true }),
      kit.Button({ kind: 'ghost', size: 'medium', label: 'Настройки доски', icon: 'gear', name: 'Board settings' })
    ],
    filters: [
      sep3,
      kit.QuickFilter('Только мои', false),
      kit.QuickFilter('Разработка', false),
      kit.QuickFilter('Тестирование', true),
      kit.QuickFilter('iOS', false),
      kit.QuickFilter('Срочные', false)
    ],
    tabs: []
  })
  kit.at(main, kit.add(
    kit.box('Board', { w: 1515, h: 931, dir: 'column', gap: 8, pad: [12, 16, 0, 16] }),
    kit.add(
      kit.box('Column headers', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('Column To Do', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('To Do', 'todo', 9, 234)
      ),
      kit.add(
        kit.box('Column On Hold', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('On Hold', 'todo', 1, 234)
      ),
      kit.add(
        kit.box('Column In Progress', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('In Progress', 'active', 10, 234, { limit: 8, over: true })
      ),
      kit.add(
        kit.box('Column Peer Review', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Peer Review', 'active', 2, 234)
      ),
      kit.add(
        kit.box('Column Ready for QA', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Ready for QA', 'active', 1, 234, { limit: 12 })
      ),
      kit.add(
        kit.box('Column Done', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Done', 'won', 9, 234)
      )
    ),
    kit.add(
      kit.box('Swimlane Внеочередные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Внеочередные', { weight: 600 }),
      kit.Count(2),
      kit.text('Приоритет = Urgent', { size: 12, color: T('theme-darker-color') })
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-6',
          cat: 'active',
          title: 'Интеграция с платёжным провайдером',
          assignee: ['ПИ', 'Watermelon'],
          est: '21h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-7',
          cat: 'won',
          title: 'Баг: краш при открытии профиля на Android 12',
          assignee: ['ВО', 'Crocodile'],
          est: '3h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['баг', 'Firework']]
        })
      )
    ),
    kit.add(
      kit.box('Swimlane Все остальные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Все остальные', { weight: 600 }),
      kit.Count(37)
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-2',
          cat: 'todo',
          title: 'Подготовить пресс-релиз о запуске приложения',
          assignee: ['СА', 'Sky'],
          est: '4h',
          priority: 'medium'
        }),
        kit.IssueCard({
          id: 'MKT-5',
          cat: 'todo',
          title: 'Email-рассылка по базе подписчиков',
          assignee: ['СА', 'Sky'],
          est: '3h',
          priority: 'high'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-22',
          cat: 'todo',
          title: 'Поддержка Apple Pay',
          assignee: ['ПИ', 'Watermelon'],
          est: '8h',
          priority: 'medium'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-1',
          cat: 'active',
          title: 'Запуск рекламной кампании в соцсетях',
          assignee: ['СА', 'Sky'],
          est: '16h',
          priority: 'high'
        }),
        kit.IssueCard({
          id: 'APP-3',
          cat: 'active',
          title: 'Push-уведомления о статусе заказа',
          assignee: ['ПИ', 'Watermelon'],
          est: '13h',
          priority: 'high',
          sub: '1/2',
          component: 'iOS',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-27',
          cat: 'active',
          title: 'Проверка количества товара в корзине',
          assignee: ['ПИ', 'Watermelon'],
          est: '3h',
          priority: 'high',
          accent: P('Firework')
        }),
        kit.IssueCard({
          id: 'APP-28',
          cat: 'active',
          title: 'Рефакторинг API-клиента',
          assignee: ['ПИ', 'Watermelon'],
          est: '5h',
          priority: 'medium',
          accent: P('Firework')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-29',
          cat: 'active',
          title: 'Ссылки на товар из внешних источников',
          assignee: ['КМ', 'Grass'],
          est: '3h',
          priority: 'medium',
          accent: P('Orange')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-4',
          cat: 'won',
          title: 'Обновить лендинг на сайте',
          assignee: ['КМ', 'Grass'],
          est: '6h',
          priority: 'medium'
        }),
        kit.IssueCard({ id: 'MKT-6', cat: 'lost', title: 'Партнёрство с блогерами-техноблогерами', priority: 'low' })
      )
    )
  ), 0, 113)
  kit.at(main, kit.add(
    kit.box('Color legend', { w: 1483, dir: 'row', gap: 20, align: 'center', wrap: true, vs: 'auto' }),
    kit.text('Цвета', { size: 12, weight: 600, color: T('theme-dark-color') }),
    kit.add(
      kit.row('header categories', 4),
      kit.Swatch(PB('Porpoise'), 14),
      kit.Swatch(PB('Cerulean'), 14),
      kit.Swatch(PB('Grass'), 14),
      kit.text('заголовок колонки - категория её статусов', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(T('theme-state-negative-color'), 14),
      kit.text(
        'красный лимит в заголовке - превышен WIP-лимит (In Progress: 10 из 8)',
        { size: 12, color: T('theme-dark-color'), name: 'In Progress: превышен WIP-лимит (10 из 8' }
      )
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Orange'), 14),
      kit.text('рамка карточки: статус Ready for QA', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: статус Peer Review', { size: 12, color: T('theme-dark-color') })
    )
  ), 16, 1000)
  kit.at(main, kit.add(
    kit.box(
      'Tooltip',
      { w: 350, h: 28, dir: 'row', pad: [0, 10, 0, 10], align: 'center', fill: T('theme-tooltip-bg'), radius: 4 }
    ),
    kit.text('Настройки доски: колонки, дорожки, фильтры, цвета', { size: 12, color: T('theme-tooltip-color') })
  ), 1108, 52)
}
{
  const { main } = kit.Workbench('Доска - статусы без колонки', 2020, 1200, {
    tab: 'Основная доска',
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
  const sep4 = kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') })
  kit.SpaceHeader(main, {
    view: 'board',
    titleNode: kit.Button(
      { kind: 'ghost', size: 'small', label: 'Основная доска', icon: 'board', menu: true, name: 'Board selector' }
    ),
    actions: [
      kit.Notice('1 статус без колонки · 1 задача не видна', 'warning', { pill: true }),
      kit.Button({ kind: 'ghost', size: 'medium', label: 'Настройки доски', icon: 'gear', name: 'Board settings' })
    ],
    filters: [
      sep4,
      kit.QuickFilter('Только мои', false),
      kit.QuickFilter('Разработка', false),
      kit.QuickFilter('Тестирование', true),
      kit.QuickFilter('iOS', false),
      kit.QuickFilter('Срочные', false)
    ],
    tabs: []
  })
  kit.at(main, kit.add(
    kit.box('Board', { w: 1515, h: 931, dir: 'column', gap: 8, pad: [12, 16, 0, 16] }),
    kit.add(
      kit.box('Column headers', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('Column To Do', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('To Do', 'todo', 9, 234)
      ),
      kit.add(
        kit.box('Column On Hold', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('On Hold', 'todo', 1, 234)
      ),
      kit.add(
        kit.box('Column In Progress', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('In Progress', 'active', 10, 234, { limit: 8, over: true })
      ),
      kit.add(
        kit.box('Column Peer Review', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Peer Review', 'active', 2, 234)
      ),
      kit.add(
        kit.box('Column Ready for QA', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Ready for QA', 'active', 1, 234, { limit: 12 })
      ),
      kit.add(
        kit.box('Column Done', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Done', 'won', 9, 234)
      )
    ),
    kit.add(
      kit.box('Swimlane Внеочередные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Внеочередные', { weight: 600 }),
      kit.Count(2),
      kit.text('Приоритет = Urgent', { size: 12, color: T('theme-darker-color') })
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-6',
          cat: 'active',
          title: 'Интеграция с платёжным провайдером',
          assignee: ['ПИ', 'Watermelon'],
          est: '21h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-7',
          cat: 'won',
          title: 'Баг: краш при открытии профиля на Android 12',
          assignee: ['ВО', 'Crocodile'],
          est: '3h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['баг', 'Firework']]
        })
      )
    ),
    kit.add(
      kit.box('Swimlane Все остальные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Все остальные', { weight: 600 }),
      kit.Count(37)
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-2',
          cat: 'todo',
          title: 'Подготовить пресс-релиз о запуске приложения',
          assignee: ['СА', 'Sky'],
          est: '4h',
          priority: 'medium'
        }),
        kit.IssueCard({
          id: 'MKT-5',
          cat: 'todo',
          title: 'Email-рассылка по базе подписчиков',
          assignee: ['СА', 'Sky'],
          est: '3h',
          priority: 'high'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-22',
          cat: 'todo',
          title: 'Поддержка Apple Pay',
          assignee: ['ПИ', 'Watermelon'],
          est: '8h',
          priority: 'medium'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-1',
          cat: 'active',
          title: 'Запуск рекламной кампании в соцсетях',
          assignee: ['СА', 'Sky'],
          est: '16h',
          priority: 'high'
        }),
        kit.IssueCard({
          id: 'APP-3',
          cat: 'active',
          title: 'Push-уведомления о статусе заказа',
          assignee: ['ПИ', 'Watermelon'],
          est: '13h',
          priority: 'high',
          sub: '1/2',
          component: 'iOS',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-27',
          cat: 'active',
          title: 'Проверка количества товара в корзине',
          assignee: ['ПИ', 'Watermelon'],
          est: '3h',
          priority: 'high',
          accent: P('Firework')
        }),
        kit.IssueCard({
          id: 'APP-28',
          cat: 'active',
          title: 'Рефакторинг API-клиента',
          assignee: ['ПИ', 'Watermelon'],
          est: '5h',
          priority: 'medium',
          accent: P('Firework')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-29',
          cat: 'active',
          title: 'Ссылки на товар из внешних источников',
          assignee: ['КМ', 'Grass'],
          est: '3h',
          priority: 'medium',
          accent: P('Orange')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-4',
          cat: 'won',
          title: 'Обновить лендинг на сайте',
          assignee: ['КМ', 'Grass'],
          est: '6h',
          priority: 'medium'
        }),
        kit.IssueCard({ id: 'MKT-6', cat: 'lost', title: 'Партнёрство с блогерами-техноблогерами', priority: 'low' })
      )
    )
  ), 0, 113)
  kit.at(main, kit.add(
    kit.box('Color legend', { w: 1483, dir: 'row', gap: 20, align: 'center', wrap: true, vs: 'auto' }),
    kit.text('Цвета', { size: 12, weight: 600, color: T('theme-dark-color') }),
    kit.add(
      kit.row('header categories', 4),
      kit.Swatch(PB('Porpoise'), 14),
      kit.Swatch(PB('Cerulean'), 14),
      kit.Swatch(PB('Grass'), 14),
      kit.text('заголовок колонки - категория её статусов', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(T('theme-state-negative-color'), 14),
      kit.text(
        'красный лимит в заголовке - превышен WIP-лимит (In Progress: 10 из 8)',
        { size: 12, color: T('theme-dark-color'), name: 'In Progress: превышен WIP-лимит (10 из 8' }
      )
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Orange'), 14),
      kit.text('рамка карточки: статус Ready for QA', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: статус Peer Review', { size: 12, color: T('theme-dark-color') })
    )
  ), 16, 1000)
  const unmappedStatusesPopoverShadow = kit.add(
    kit.box('Unmapped statuses popover', {
      w: 380,
      dir: 'column',
      gap: 10,
      pad: [16, 16, 16, 16],
      vs: 'auto',
      fill: T('theme-popup-color'),
      stroke: T('theme-popup-divider'),
      radius: 8
    }),
    kit.text('Статусы без колонки', { weight: 600 }),
    kit.text(
      'Задачи в этих статусах не попадают ни в одну колонку, поэтому на доске их не видно. Добавьте статус в колонку, и задачи появятся.',
      { size: 13, color: T('theme-dark-color'), w: 348 }
    ),
    kit.StatusChip(
      'Blocked',
      'active',
      { count: 1, w: 348, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.add(
      kit.row('actions', 8),
      kit.Button({ kind: 'secondary', size: 'small', label: 'Показать задачи', icon: 'list' }),
      kit.Button({ kind: 'primary', size: 'small', label: 'Добавить в колонку', icon: 'plus' })
    )
  )
  unmappedStatusesPopoverShadow.shadows = [
    {
      style: 'drop-shadow',
      offsetX: 0,
      offsetY: 8,
      blur: 24,
      spread: 0,
      color: { color: '#000000', opacity: 0.149 }
    }
  ]
  kit.at(main, unmappedStatusesPopoverShadow, 1000, 50)
}
{
  const { main } = kit.Workbench('Доска - статусы колонки', 0, 2400, {
    tab: 'Основная доска',
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
  const sep5 = kit.box('sep', { w: 1, h: 20, fill: T('theme-divider-color') })
  kit.SpaceHeader(main, {
    view: 'board',
    titleNode: kit.Button(
      { kind: 'ghost', size: 'small', label: 'Основная доска', icon: 'board', menu: true, name: 'Board selector' }
    ),
    actions: [
      kit.Notice('1 статус без колонки · 1 задача не видна', 'warning', { pill: true }),
      kit.Button({ kind: 'ghost', size: 'medium', label: 'Настройки доски', icon: 'gear', name: 'Board settings' })
    ],
    filters: [
      sep5,
      kit.QuickFilter('Только мои', false),
      kit.QuickFilter('Разработка', false),
      kit.QuickFilter('Тестирование', true),
      kit.QuickFilter('iOS', false),
      kit.QuickFilter('Срочные', false)
    ],
    tabs: []
  })
  kit.at(main, kit.add(
    kit.box('Board', { w: 1515, h: 931, dir: 'column', gap: 8, pad: [12, 16, 0, 16] }),
    kit.add(
      kit.box('Column headers', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('Column To Do', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('To Do', 'todo', 9, 234)
      ),
      kit.add(
        kit.box('Column On Hold', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('On Hold', 'todo', 1, 234)
      ),
      kit.add(
        kit.box('Column In Progress', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('In Progress', 'active', 10, 234, { limit: 8, over: true })
      ),
      kit.add(
        kit.box('Column Peer Review', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Peer Review', 'active', 2, 234)
      ),
      kit.add(
        kit.box('Column Ready for QA', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Ready for QA', 'active', 1, 234, { limit: 12 })
      ),
      kit.add(
        kit.box('Column Done', { w: 234, dir: 'column', gap: 6, vs: 'auto' }),
        kit.ColumnHeader('Done', 'won', 9, 234)
      )
    ),
    kit.add(
      kit.box('Swimlane Внеочередные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Внеочередные', { weight: 600 }),
      kit.Count(2),
      kit.text('Приоритет = Urgent', { size: 12, color: T('theme-darker-color') })
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-6',
          cat: 'active',
          title: 'Интеграция с платёжным провайдером',
          assignee: ['ПИ', 'Watermelon'],
          est: '21h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 234,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-7',
          cat: 'won',
          title: 'Баг: краш при открытии профиля на Android 12',
          assignee: ['ВО', 'Crocodile'],
          est: '3h',
          priority: 'urgent',
          milestone: 'Релиз 1.0',
          labels: [['баг', 'Firework']]
        })
      )
    ),
    kit.add(
      kit.box('Swimlane Все остальные', {
        w: 1483,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Все остальные', { weight: 600 }),
      kit.Count(37)
    ),
    kit.add(
      kit.box('Lane cells', { w: 1483, dir: 'row', gap: 12, vs: 'auto' }),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-2',
          cat: 'todo',
          title: 'Подготовить пресс-релиз о запуске приложения',
          assignee: ['СА', 'Sky'],
          est: '4h',
          priority: 'medium'
        }),
        kit.IssueCard({
          id: 'MKT-5',
          cat: 'todo',
          title: 'Email-рассылка по базе подписчиков',
          assignee: ['СА', 'Sky'],
          est: '3h',
          priority: 'high'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-22',
          cat: 'todo',
          title: 'Поддержка Apple Pay',
          assignee: ['ПИ', 'Watermelon'],
          est: '8h',
          priority: 'medium'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-1',
          cat: 'active',
          title: 'Запуск рекламной кампании в соцсетях',
          assignee: ['СА', 'Sky'],
          est: '16h',
          priority: 'high'
        }),
        kit.IssueCard({
          id: 'APP-3',
          cat: 'active',
          title: 'Push-уведомления о статусе заказа',
          assignee: ['ПИ', 'Watermelon'],
          est: '13h',
          priority: 'high',
          sub: '1/2',
          component: 'iOS',
          milestone: 'Релиз 1.0',
          labels: [['срочно', 'Pink']]
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-27',
          cat: 'active',
          title: 'Проверка количества товара в корзине',
          assignee: ['ПИ', 'Watermelon'],
          est: '3h',
          priority: 'high',
          accent: P('Firework')
        }),
        kit.IssueCard({
          id: 'APP-28',
          cat: 'active',
          title: 'Рефакторинг API-клиента',
          assignee: ['ПИ', 'Watermelon'],
          est: '5h',
          priority: 'medium',
          accent: P('Firework')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-29',
          cat: 'active',
          title: 'Ссылки на товар из внешних источников',
          assignee: ['КМ', 'Grass'],
          est: '3h',
          priority: 'medium',
          accent: P('Orange')
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 234,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'MKT-4',
          cat: 'won',
          title: 'Обновить лендинг на сайте',
          assignee: ['КМ', 'Grass'],
          est: '6h',
          priority: 'medium'
        }),
        kit.IssueCard({ id: 'MKT-6', cat: 'lost', title: 'Партнёрство с блогерами-техноблогерами', priority: 'low' })
      )
    )
  ), 0, 113)
  kit.at(main, kit.add(
    kit.box('Color legend', { w: 1483, dir: 'row', gap: 20, align: 'center', wrap: true, vs: 'auto' }),
    kit.text('Цвета', { size: 12, weight: 600, color: T('theme-dark-color') }),
    kit.add(
      kit.row('header categories', 4),
      kit.Swatch(PB('Porpoise'), 14),
      kit.Swatch(PB('Cerulean'), 14),
      kit.Swatch(PB('Grass'), 14),
      kit.text('заголовок колонки - категория её статусов', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(T('theme-state-negative-color'), 14),
      kit.text(
        'красный лимит в заголовке - превышен WIP-лимит (In Progress: 10 из 8)',
        { size: 12, color: T('theme-dark-color'), name: 'In Progress: превышен WIP-лимит (10 из 8' }
      )
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Orange'), 14),
      kit.text('рамка карточки: статус Ready for QA', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: статус Peer Review', { size: 12, color: T('theme-dark-color') })
    )
  ), 16, 1000)
  const columnStatusesPopoverShadow = kit.add(
    kit.box('Column statuses popover', {
      w: 262,
      dir: 'column',
      gap: 8,
      pad: [8, 8, 8, 8],
      vs: 'auto',
      fill: T('theme-popup-color'),
      stroke: T('theme-popup-divider'),
      radius: 12
    }),
    kit.text('Статусы колонки', { size: 12, weight: 500, color: T('theme-darker-color') }),
    kit.StatusChip(
      'In Progress',
      'active',
      { count: 6, w: 244, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Development',
      'active',
      { count: 1, w: 244, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Prototyping',
      'active',
      { count: 1, w: 244, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Integration',
      'active',
      { count: 1, w: 244, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Verification',
      'active',
      { count: 0, w: 244, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Approval',
      'active',
      { count: 1, w: 244, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    )
  )
  columnStatusesPopoverShadow.shadows = [
    {
      style: 'drop-shadow',
      offsetX: 0,
      offsetY: 0,
      blur: 8,
      spread: 0,
      color: { color: '#000000', opacity: 0.2 }
    }
  ]
  // The product tooltip points at the column: a rotated square behind the popup, centered on the column (x 508, w 234)
  kit.at(main, kit.box('Tooltip arrow', { w: 14, h: 14, fill: T('theme-popup-color'), stroke: T('theme-popup-divider'), rot: 45, clip: false }), 618, 163)
  kit.at(main, columnStatusesPopoverShadow, 494, 169)
}
{
  const { main } = kit.Workbench('Стало - канбан', 2020, 2400, {
    tab: 'Tracker',
    nav: [
      { item: 'My issues', icon: 'kit/Crosshair' },
      { item: 'All issues', icon: 'kit/CheckSquare', selected: true },
      { divider: true },
      { item: 'All projects', icon: 'kit/BulletList' },
      { item: 'Labels', icon: 'kit/Tags' },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'kit/CheckSquare', indent: true },
      { item: 'Components', icon: 'kit/Diamond', indent: true },
      { item: 'Milestones', icon: 'kit/Signpost', indent: true },
      { item: 'Templates', icon: 'kit/Layout', indent: true },
      { space: 'Маркетинг', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'kit/CheckSquare', indent: true },
      { item: 'Components', icon: 'kit/Diamond', indent: true },
      { item: 'Milestones', icon: 'kit/Signpost', indent: true },
      { item: 'Templates', icon: 'kit/Layout', indent: true }
    ]
  })
  kit.SpaceHeader(main, { view: 'board', title: 'All issues', titleIcon: 'kit/CheckSquare' })
  // Columns follow the demo statuses: by category, the demo order inside it; the first five fit the window
  const d = DEMO.ru
  const columns = ['backlog', 'todo', 'active', 'won', 'lost'].flatMap((cat) => d.statuses.filter((st) => st.category === cat)).slice(0, 5)
  const issues = d.projects.flatMap((project) => project.issues)
  const person = (name) => d.people.find((it) => it.name === name)
  const cardOf = (i, cat) => ({
    id: i.id,
    cat,
    title: i.title,
    priority: i.priority,
    ...(person(i.assignee) !== undefined ? { assignee: [person(i.assignee).initials, person(i.assignee).color] } : {}),
    ...(i.component !== undefined ? { component: i.component } : {}),
    ...(i.milestone !== undefined ? { milestone: i.milestone } : {}),
    ...(i.estimation !== undefined ? { est: i.estimation + 'h' } : {})
  })
  const board = kit.box('Kanban', { w: 2264, h: 930, dir: 'row', pad: [24, 0, 0, 24] })
  for (const st of columns) {
    const all = issues.filter((i) => i.status === st.name)
    kit.add(board, kit.KanbanColumn({ name: st.name, cat: st.category, count: all.length, cards: all.slice(0, 4).map((i) => cardOf(i, st.category)) }, 320, 898))
  }
  kit.at(main, board, 2, 114)
}
{
  const { main } = kit.Workbench('Стало - канбан с дорожками', 0, 3600, {
    tab: 'Tracker',
    nav: [
      { item: 'My issues', icon: 'kit/Crosshair' },
      { item: 'All issues', icon: 'kit/CheckSquare', selected: true },
      { divider: true },
      { item: 'All projects', icon: 'kit/BulletList' },
      { item: 'Labels', icon: 'kit/Tags' },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'kit/CheckSquare', indent: true },
      { item: 'Components', icon: 'kit/Diamond', indent: true },
      { item: 'Milestones', icon: 'kit/Signpost', indent: true },
      { item: 'Templates', icon: 'kit/Layout', indent: true },
      { space: 'Маркетинг', icon: 'kit/HouseFill', color: 'Porpoise' },
      { item: 'Issues', icon: 'kit/CheckSquare', indent: true },
      { item: 'Components', icon: 'kit/Diamond', indent: true },
      { item: 'Milestones', icon: 'kit/Signpost', indent: true },
      { item: 'Templates', icon: 'kit/Layout', indent: true }
    ]
  })
  kit.SpaceHeader(main, { view: 'board', title: 'All issues', titleIcon: 'kit/CheckSquare' })
  // Columns follow the demo statuses: by category, the demo order inside it; the first five fit the window
  const d = DEMO.ru
  const columns = ['backlog', 'todo', 'active', 'won', 'lost'].flatMap((cat) => d.statuses.filter((st) => st.category === cat)).slice(0, 5)
  const issues = d.projects.flatMap((project) => project.issues)
  const person = (name) => d.people.find((it) => it.name === name)
  const cardOf = (i, cat) => ({
    id: i.id,
    cat,
    title: i.title,
    priority: i.priority,
    ...(person(i.assignee) !== undefined ? { assignee: [person(i.assignee).initials, person(i.assignee).color] } : {}),
    ...(i.component !== undefined ? { component: i.component } : {}),
    ...(i.milestone !== undefined ? { milestone: i.milestone } : {}),
    ...(i.estimation !== undefined ? { est: i.estimation + 'h' } : {})
  })
  const board = kit.box('Kanban', { w: 2264, h: 930, dir: 'column', gap: 8, pad: [24, 24, 0, 24] })
  kit.add(board, kit.add(
    kit.row('Column headers', 0, { align: 'start', clip: false }),
    columns.map((st) => kit.KanbanColumn({ name: st.name, cat: st.category, count: issues.filter((i) => i.status === st.name).length, cards: [] }, 320, 44))
  ))
  // The lane header is tinted by the priority, as in the product
  for (const [level, title, pal] of [['urgent', 'Urgent', 'Orange'], ['high', 'High', 'Sunshine'], ['medium', 'Medium', 'Ocean']]) {
    const inLane = issues.filter((i) => i.priority === level)
    const head = kit.box('Swimlane ' + title, { w: 2214, h: 32, dir: 'row', gap: 8, pad: [0, 8, 0, 8], align: 'center', fill: PB(pal), radius: 4 })
    kit.add(head, kit.icon('chevronD', PT(pal)), kit.PriorityIcon(level), kit.text(title, { weight: 600, color: PT(pal) }), kit.Count(inLane.length))
    const row = kit.row('Lane cells', 26, { align: 'start', pad: [0, 13, 0, 13], clip: false })
    for (const st of columns) {
      const cards = inLane.filter((i) => i.status === st.name).slice(0, 2).map((i) => kit.IssueCard(cardOf(i, st.category), 278))
      kit.add(row, kit.add(kit.box('cell', { w: 294, h: 56, dir: 'column', gap: 8, pad: [8, 8, 8, 8], vs: cards.length > 0 ? 'auto' : 'fix', fill: T('theme-kanban-card-bg-color'), radius: 8, clip: false }), cards))
    }
    kit.add(board, head, row)
  }
  kit.at(main, board, 2, 114)
}
await kit.settle()
