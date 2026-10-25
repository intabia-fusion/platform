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
      kit.QuickFilter('Срочные', false),
      kit.QuickFilter('Блокеры', false)
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
      kit.text('рамка карточки: Ready for QA дольше 5 дней', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: Peer Review дольше 3 дней', { size: 12, color: T('theme-dark-color') })
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
      kit.QuickFilter('Срочные', false),
      kit.QuickFilter('Блокеры', false)
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
      kit.text('рамка карточки: Ready for QA дольше 5 дней', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: Peer Review дольше 3 дней', { size: 12, color: T('theme-dark-color') })
    )
  ), 16, 1000)
  kit.at(main, kit.Menu(
    [
      { header: 'Мобильное приложение · APP' },
      { label: 'Релиз 1.0', icon: 'board', hint: 'Веха' },
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
  ), 140, 46)
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
      kit.QuickFilter('Срочные', false),
      kit.QuickFilter('Блокеры', false)
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
      kit.text('рамка карточки: Ready for QA дольше 5 дней', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: Peer Review дольше 3 дней', { size: 12, color: T('theme-dark-color') })
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
      kit.QuickFilter('Срочные', false),
      kit.QuickFilter('Блокеры', false)
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
      kit.text('рамка карточки: Ready for QA дольше 5 дней', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: Peer Review дольше 3 дней', { size: 12, color: T('theme-dark-color') })
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
  kit.at(main, unmappedStatusesPopoverShadow, 1038, 50)
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
      kit.QuickFilter('Срочные', false),
      kit.QuickFilter('Блокеры', false)
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
      kit.text('рамка карточки: Ready for QA дольше 5 дней', { size: 12, color: T('theme-dark-color') })
    ),
    kit.add(
      kit.row('legend item', 6),
      kit.Swatch(P('Firework'), 14),
      kit.text('рамка карточки: Peer Review дольше 3 дней', { size: 12, color: T('theme-dark-color') })
    )
  ), 16, 1000)
  const columnStatusesPopoverShadow = kit.add(
    kit.box('Column statuses popover', {
      w: 260,
      dir: 'column',
      gap: 10,
      pad: [16, 16, 16, 16],
      vs: 'auto',
      fill: T('theme-popup-color'),
      stroke: T('theme-popup-divider'),
      radius: 8
    }),
    kit.text('Статусы колонки', { size: 12, weight: 500, color: T('theme-darker-color') }),
    kit.StatusChip(
      'In Progress',
      'active',
      { count: 6, w: 228, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Development',
      'active',
      { count: 1, w: 228, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Prototyping',
      'active',
      { count: 1, w: 228, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Integration',
      'active',
      { count: 1, w: 228, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Verification',
      'active',
      { count: 0, w: 228, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    ),
    kit.StatusChip(
      'Approval',
      'active',
      { count: 1, w: 228, h: 32, fill: T('theme-popup-color'), stroke: T('theme-button-border'), size: 13 }
    )
  )
  columnStatusesPopoverShadow.shadows = [
    {
      style: 'drop-shadow',
      offsetX: 0,
      offsetY: 8,
      blur: 24,
      spread: 0,
      color: { color: '#000000', opacity: 0.149 }
    }
  ]
  kit.at(main, columnStatusesPopoverShadow, 508, 169)
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
  kit.at(main, kit.add(
    kit.box('Kanban', { w: 2264, h: 930, dir: 'row', pad: [24, 0, 0, 24] }),
    kit.KanbanColumn(
      {
        name: 'Todo',
        cat: 'todo',
        count: 2,
        cards: [
          {
            id: 'MKT-2',
            cat: 'todo',
            title: 'Подготовить пресс-релиз о запуске приложения',
            assignee: ['СА', 'Sky'],
            est: '4h',
            priority: 'medium'
          },
          {
            id: 'MKT-5',
            cat: 'todo',
            title: 'Email-рассылка по базе подписчиков',
            assignee: ['СА', 'Sky'],
            est: '3h',
            priority: 'high'
          }
        ]
      },
      320,
      898
    ),
    kit.KanbanColumn(
      {
        name: 'On Hold',
        cat: 'todo',
        count: 1,
        cards: [
          {
            id: 'APP-22',
            cat: 'todo',
            title: 'Поддержка Apple Pay',
            assignee: ['ПИ', 'Watermelon'],
            est: '8h',
            priority: 'medium'
          }
        ]
      },
      320,
      898
    ),
    kit.KanbanColumn(
      {
        name: 'In Progress',
        cat: 'active',
        count: 3,
        tools: true,
        cards: [
          {
            id: 'APP-6',
            cat: 'active',
            title: 'Интеграция с платёжным провайдером',
            assignee: ['ПИ', 'Watermelon'],
            est: '21h',
            priority: 'urgent',
            milestone: 'Релиз 1.0',
            labels: [['срочно', 'Pink']]
          },
          {
            id: 'MKT-1',
            cat: 'active',
            title: 'Запуск рекламной кампании в соцсетях',
            assignee: ['СА', 'Sky'],
            est: '16h',
            priority: 'high'
          },
          {
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
          }
        ]
      },
      320,
      898
    ),
    kit.KanbanColumn(
      {
        name: 'Peer Review',
        cat: 'active',
        count: 2,
        cards: [
          {
            id: 'APP-27',
            cat: 'active',
            title: 'Проверка количества товара в корзине',
            assignee: ['ПИ', 'Watermelon'],
            est: '3h',
            priority: 'high'
          },
          {
            id: 'APP-28',
            cat: 'active',
            title: 'Рефакторинг API-клиента',
            assignee: ['ПИ', 'Watermelon'],
            est: '5h',
            priority: 'medium'
          }
        ]
      },
      320,
      898
    ),
    kit.KanbanColumn(
      {
        name: 'Ready for QA',
        cat: 'active',
        count: 1,
        cards: [
          {
            id: 'APP-29',
            cat: 'active',
            title: 'Ссылки на товар из внешних источников',
            assignee: ['КМ', 'Grass'],
            est: '3h',
            priority: 'medium'
          }
        ]
      },
      320,
      898
    ),
    kit.KanbanColumn(
      {
        name: 'Done',
        cat: 'won',
        count: 2,
        cards: [
          {
            id: 'APP-7',
            cat: 'won',
            title: 'Баг: краш при открытии профиля на Android 12',
            assignee: ['ВО', 'Crocodile'],
            est: '3h',
            priority: 'urgent',
            milestone: 'Релиз 1.0',
            labels: [['баг', 'Firework']]
          },
          {
            id: 'MKT-4',
            cat: 'won',
            title: 'Обновить лендинг на сайте',
            assignee: ['КМ', 'Grass'],
            est: '6h',
            priority: 'medium'
          }
        ]
      },
      320,
      898
    ),
    kit.KanbanColumn(
      {
        name: 'Canceled',
        cat: 'lost',
        count: 1,
        cards: [{ id: 'MKT-6', cat: 'lost', title: 'Партнёрство с блогерами-техноблогерами', priority: 'low' }]
      },
      320,
      898
    )
  ), 2, 114)
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
  kit.at(main, kit.add(
    kit.box('Kanban', { w: 2264, h: 930, dir: 'column', gap: 8, pad: [24, 24, 0, 24] }),
    kit.add(
      kit.row('Column headers', 0, { align: 'start', clip: false }),
      kit.KanbanColumn({ name: 'Todo', cat: 'todo', count: 2, cards: [] }, 320, 44),
      kit.KanbanColumn({ name: 'On Hold', cat: 'todo', count: 1, cards: [] }, 320, 44),
      kit.KanbanColumn({ name: 'In Progress', cat: 'active', count: 3, tools: true, cards: [] }, 320, 44),
      kit.KanbanColumn({ name: 'Peer Review', cat: 'active', count: 2, cards: [] }, 320, 44),
      kit.KanbanColumn({ name: 'Ready for QA', cat: 'active', count: 1, cards: [] }, 320, 44),
      kit.KanbanColumn({ name: 'Done', cat: 'won', count: 2, cards: [] }, 320, 44),
      kit.KanbanColumn({ name: 'Canceled', cat: 'lost', count: 1, cards: [] }, 320, 44)
    ),
    kit.add(
      kit.box('Swimlane Urgent', {
        w: 2214,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Urgent', { weight: 600, name: 'Внеочередные' }),
      kit.Count(2)
    ),
    kit.add(
      kit.row('Lane cells', 26, { align: 'start', pad: [0, 13, 0, 13], clip: false }),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
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
          w: 294,
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
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
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
          w: 294,
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
      ),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      })
    ),
    kit.add(
      kit.box('Swimlane High', {
        w: 2214,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('High', { weight: 600, name: 'Внеочередные' }),
      kit.Count(4)
    ),
    kit.add(
      kit.row('Lane cells', 26, { align: 'start', pad: [0, 13, 0, 13], clip: false }),
      kit.add(
        kit.box('cell', {
          w: 294,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
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
      kit.box('cell', {
        w: 294,
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
          w: 294,
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
          w: 294,
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
          priority: 'high'
        })
      ),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      })
    ),
    kit.add(
      kit.box('Swimlane Medium', {
        w: 2214,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Medium', { weight: 600, name: 'Внеочередные' }),
      kit.Count(5)
    ),
    kit.add(
      kit.row('Lane cells', 26, { align: 'start', pad: [0, 13, 0, 13], clip: false }),
      kit.add(
        kit.box('cell', {
          w: 294,
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
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 294,
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
      kit.box('cell', {
        w: 294,
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
          w: 294,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({
          id: 'APP-28',
          cat: 'active',
          title: 'Рефакторинг API-клиента',
          assignee: ['ПИ', 'Watermelon'],
          est: '5h',
          priority: 'medium'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 294,
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
          priority: 'medium'
        })
      ),
      kit.add(
        kit.box('cell', {
          w: 294,
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
        })
      ),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      })
    ),
    kit.add(
      kit.box('Swimlane Low', {
        w: 2214,
        h: 32,
        dir: 'row',
        gap: 8,
        pad: [0, 8, 0, 8],
        align: 'center',
        fill: T('theme-list-row-color'),
        radius: 4
      }),
      kit.icon('chevronD'),
      kit.text('Low', { weight: 600, name: 'Внеочередные' }),
      kit.Count(1)
    ),
    kit.add(
      kit.row('Lane cells', 26, { align: 'start', pad: [0, 13, 0, 13], clip: false }),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
        h: 56,
        dir: 'column',
        gap: 8,
        pad: [8, 8, 8, 8],
        fill: T('theme-kanban-card-bg-color'),
        radius: 8,
        clip: false
      }),
      kit.box('cell', {
        w: 294,
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
          w: 294,
          dir: 'column',
          gap: 8,
          pad: [8, 8, 8, 8],
          vs: 'auto',
          fill: T('theme-kanban-card-bg-color'),
          radius: 8,
          clip: false
        }),
        kit.IssueCard({ id: 'MKT-6', cat: 'lost', title: 'Партнёрство с блогерами-техноблогерами', priority: 'low' })
      )
    )
  ), 2, 114)
}
await kit.settle()
