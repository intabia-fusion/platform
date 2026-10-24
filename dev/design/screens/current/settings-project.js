// Project settings of the tracker as a page (FUSIO-1613, accepted): the project popup is gone, boards are not a tab.
// Imported from the hand-edited fusio-1613.pen by dev/pen/import.mjs.

await kit.page('Project settings')
{
  const { main } = kit.Workbench('Настройки проекта - Основное', 0, 0, {
    tab: 'Настройки проекта',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board' },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox7 = kit.SettingsLayout(main, {
    back: 'К проекту',
    title: 'Настройки проекта',
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Задачи', 'check'],
      ['Статусы и workflow', 'timeline'],
      ['Архив', 'trash']
    ],
    tab: 'Основное',
    close: true
  })
  kit.add(contentBox7, kit.SectionTitle('Основное', 'Изменения сохраняются сразу.', 720))
  kit.add(contentBox7, kit.FormRow(
    'Тип проекта',
    kit.add(
      kit.row('type', 8),
      kit.Chip([kit.StatusIcon('backlog'), kit.text('Default', { size: 13, color: T('theme-dark-color') })]),
      kit.Button({ kind: 'tertiary', size: 'extra-small', label: 'Открыть тип проекта' })
    ),
    { hint: 'Статусы и типы задач берутся из типа' }
  ))
  kit.add(contentBox7, kit.FormRow('Название', kit.Input({ w: 420, value: 'Мобильное приложение' })))
  kit.add(contentBox7, kit.FormRow('Идентификатор', kit.Input({ w: 160, value: 'APP' }), { hint: 'Префикс номеров задач: APP-6' }))
  kit.add(contentBox7, kit.FormRow(
    'Описание',
    kit.Input({
      w: 420,
      h: 64,
      value: 'Разработка мобильного приложения компании «Демо» для iOS и Android: каталог товаров, личный кабинет, push-уведомления и оплата.'
    })
  ))
  kit.add(contentBox7, kit.FormRow(
    'Иконка',
    kit.add(
      kit.row('icons', 6),
      kit.add(
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
        kit.icon('board')
      ),
      kit.add(
        kit.box(
          'icon',
          {
            w: 32,
            h: 32,
            dir: 'row',
            align: 'center',
            justify: 'center',
            stroke: T('theme-button-border'),
            radius: 6
          }
        ),
        kit.icon('star')
      ),
      kit.add(
        kit.box(
          'icon',
          {
            w: 32,
            h: 32,
            dir: 'row',
            align: 'center',
            justify: 'center',
            stroke: T('theme-button-border'),
            radius: 6
          }
        ),
        kit.icon('component')
      ),
      kit.add(
        kit.box(
          'icon',
          {
            w: 32,
            h: 32,
            dir: 'row',
            align: 'center',
            justify: 'center',
            stroke: T('theme-button-border'),
            radius: 6
          }
        ),
        kit.icon('milestone')
      ),
      kit.add(
        kit.box(
          'icon',
          {
            w: 32,
            h: 32,
            dir: 'row',
            align: 'center',
            justify: 'center',
            stroke: T('theme-button-border'),
            radius: 6
          }
        ),
        kit.icon('users')
      )
    )
  ))
}
{
  const { main } = kit.Workbench('Настройки проекта - Участники и доступ', 2020, 0, {
    tab: 'Настройки проекта',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board' },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox8 = kit.SettingsLayout(main, {
    back: 'К проекту',
    title: 'Настройки проекта',
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Задачи', 'check'],
      ['Статусы и workflow', 'timeline'],
      ['Архив', 'trash']
    ],
    tab: 'Участники и доступ',
    close: true
  })
  kit.add(contentBox8, kit.SectionTitle('Участники и доступ', 'Кто видит проект и кто может его настраивать.', 720))
  kit.add(contentBox8, kit.FormRow('Приватный проект', kit.Toggle(false), { hint: 'Видят только участники' }))
  kit.add(contentBox8, kit.FormRow(
    'Автовступление',
    kit.Toggle(false),
    { hint: 'Новые сотрудники становятся участниками автоматически' }
  ))
  const divider2 = kit.box('divider', { w: 720, h: 1, fill: T('theme-divider-color') })
  kit.add(contentBox8, divider2)
  kit.add(contentBox8, kit.add(
    kit.box('members head', { w: 760, h: 32, dir: 'row', align: 'center', justify: 'space-between' }),
    kit.text('Участники · 4', { weight: 600 }),
    kit.Button({ kind: 'secondary', size: 'small', label: 'Добавить участника', icon: 'plus' })
  ))
  kit.add(contentBox8, kit.Table(
    [{ title: 'Сотрудник', w: 962 }, { title: 'Роль', w: 200 }, { title: '', w: 56 }],
    [
      [
        kit.add(kit.row('person', 8), kit.Avatar('СА', 'Sky', 24), kit.text('Анна Смирнова')),
        kit.Input({ w: 160, value: 'Владелец', menu: true }),
        kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
      ],
      [
        kit.add(kit.row('person', 8), kit.Avatar('КМ', 'Grass', 24), kit.text('Мария Козлова')),
        kit.Input({ w: 160, value: 'Участник', menu: true }),
        kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
      ],
      [
        kit.add(kit.row('person', 8), kit.Avatar('ПИ', 'Watermelon', 24), kit.text('Иван Петров')),
        kit.Input({ w: 160, value: 'Участник', menu: true }),
        kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
      ],
      [
        kit.add(kit.row('person', 8), kit.Avatar('ВО', 'Crocodile', 24), kit.text('Олег Васильев')),
        kit.Input({ w: 160, value: 'Участник', menu: true }),
        kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })
      ]
    ],
    { name: 'Members table' }
  ))
}
{
  const { main } = kit.Workbench('Настройки проекта - Задачи', 0, 1200, {
    tab: 'Настройки проекта',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board' },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox9 = kit.SettingsLayout(main, {
    back: 'К проекту',
    title: 'Настройки проекта',
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Задачи', 'check'],
      ['Статусы и workflow', 'timeline'],
      ['Архив', 'trash']
    ],
    tab: 'Задачи',
    close: true
  })
  kit.add(contentBox9, kit.SectionTitle('Задачи', 'Значения для новых задач проекта.', 720))
  kit.add(contentBox9, kit.FormRow(
    'Исполнитель по умолчанию',
    kit.Input({ w: 240, icon: 'contact/Person', value: 'Не назначен', menu: true })
  ))
  kit.add(contentBox9, kit.FormRow('Статус по умолчанию', kit.Input({ w: 240, value: 'Todo', menu: true })))
  kit.add(contentBox9, kit.FormRow(
    'Шаблоны задач',
    kit.Input({ w: 240, icon: 'tracker/issuetemplates', value: 'Открыть шаблоны (3)' })
  ))
}
{
  const { main } = kit.Workbench('Настройки проекта - Статусы и workflow', 2020, 1200, {
    tab: 'Настройки проекта',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board' },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox10 = kit.SettingsLayout(main, {
    back: 'К проекту',
    title: 'Настройки проекта',
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Задачи', 'check'],
      ['Статусы и workflow', 'timeline'],
      ['Архив', 'trash']
    ],
    tab: 'Статусы и workflow',
    close: true
  })
  kit.add(contentBox10, kit.SectionTitle(
    'Статусы и workflow',
    'Статусы задаются типом проекта «Default» и общие для всех его проектов. Доски группируют эти статусы в колонки.',
    760
  ))
  kit.add(contentBox10, kit.add(
    kit.box('Statuses', { w: 760, dir: 'column', gap: 12, vs: 'auto' }),
    kit.add(
      kit.col('category Бэклог', 6),
      kit.text('БЭКЛОГ', { size: 12, weight: 500, color: T('theme-dark-color'), name: 'Бэклог' }),
      kit.add(
        kit.box('status Backlog', {
          w: 760,
          h: 36,
          dir: 'row',
          gap: 8,
          pad: [0, 12, 0, 12],
          align: 'center',
          fill: T('theme-list-row-color'),
          radius: 6
        }),
        kit.StatusIcon('backlog'),
        kit.text('Backlog')
      )
    ),
    kit.add(
      kit.col('category К выполнению', 6),
      kit.text('К ВЫПОЛНЕНИЮ', { size: 12, weight: 500, color: T('theme-dark-color'), name: 'К выполнению' }),
      kit.add(
        kit.box('status Todo', {
          w: 760,
          h: 36,
          dir: 'row',
          gap: 8,
          pad: [0, 12, 0, 12],
          align: 'center',
          fill: T('theme-list-row-color'),
          radius: 6
        }),
        kit.StatusIcon('todo'),
        kit.text('Todo')
      )
    ),
    kit.add(
      kit.col('category В работе', 6),
      kit.text('В РАБОТЕ', { size: 12, weight: 500, color: T('theme-dark-color'), name: 'В работе' }),
      kit.add(
        kit.box('status In Progress', {
          w: 760,
          h: 36,
          dir: 'row',
          gap: 8,
          pad: [0, 12, 0, 12],
          align: 'center',
          fill: T('theme-list-row-color'),
          radius: 6
        }),
        kit.StatusIcon('active'),
        kit.text('In Progress')
      )
    ),
    kit.add(
      kit.col('category Выполнено', 6),
      kit.text('ВЫПОЛНЕНО', { size: 12, weight: 500, color: T('theme-dark-color'), name: 'Выполнено' }),
      kit.add(
        kit.box('status Done', {
          w: 760,
          h: 36,
          dir: 'row',
          gap: 8,
          pad: [0, 12, 0, 12],
          align: 'center',
          fill: T('theme-list-row-color'),
          radius: 6
        }),
        kit.StatusIcon('won'),
        kit.text('Done')
      )
    ),
    kit.add(
      kit.col('category Отменено', 6),
      kit.text('ОТМЕНЕНО', { size: 12, weight: 500, color: T('theme-dark-color'), name: 'Отменено' }),
      kit.add(
        kit.box('status Canceled', {
          w: 760,
          h: 36,
          dir: 'row',
          gap: 8,
          pad: [0, 12, 0, 12],
          align: 'center',
          fill: T('theme-list-row-color'),
          radius: 6
        }),
        kit.StatusIcon('lost'),
        kit.text('Canceled')
      )
    )
  ))
  kit.add(contentBox10, kit.add(
    kit.row('actions', 8),
    kit.Button({ kind: 'secondary', size: 'small', label: 'Изменить статусы в типе проекта', icon: 'gear' }),
    kit.Button({ kind: 'ghost', size: 'small', label: 'Workflow mapping', icon: 'timeline' })
  ))
}
{
  const { main } = kit.Workbench('Настройки проекта - Архив', 0, 2400, {
    tab: 'Настройки проекта',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board' },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ]
  })
  const contentBox11 = kit.SettingsLayout(main, {
    back: 'К проекту',
    title: 'Настройки проекта',
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Задачи', 'check'],
      ['Статусы и workflow', 'timeline'],
      ['Архив', 'trash']
    ],
    tab: 'Архив',
    close: true
  })
  kit.add(contentBox11, kit.SectionTitle(
    'Архив',
    'Архивный проект скрыт из навигации, задачи остаются доступны по ссылке и в поиске.',
    720
  ))
  kit.add(contentBox11, kit.Notice('Проект можно вернуть из архива в «All projects».', 'info', { w: 720 }))
  kit.add(contentBox11, kit.Button({ kind: 'negative', size: 'small', label: 'Архивировать проект', icon: 'trash' }))
}
{
  const { main, panel } = kit.Workbench('Настройки проекта - Задачи, чат справа', 2020, 2400, {
    tab: 'Настройки проекта',
    nav: [
      { item: 'My issues', icon: 'timeline' },
      { item: 'All issues', icon: 'check' },
      { item: 'Доски', icon: 'board' },
      { item: 'Тестирование', indent: true },
      { item: 'Мой спринт', indent: true },
      { group: 'Your projects', add: true },
      { space: 'Мобильное приложение', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true },
      { space: 'Маркетинг', icon: 'tracker/home', color: 'Porpoise' },
      { item: 'Issues', icon: 'check', indent: true },
      { item: 'Components', icon: 'component', indent: true },
      { item: 'Milestones', icon: 'milestone', indent: true }
    ],
    panel: { w: 400 },
    selected: 'chunter/chunter',
    widgets: ['calendar/calendar', 'chunter/chunter', 'love/office', 'rating/rating', 'view/ai-star']
  })
  const contentBox12 = kit.SettingsLayout(main, {
    back: 'К проекту',
    title: 'Настройки проекта',
    tabs: [
      ['Основное', 'gear'],
      ['Участники и доступ', 'users'],
      ['Задачи', 'check'],
      ['Статусы и workflow', 'timeline'],
      ['Архив', 'trash']
    ],
    tab: 'Задачи',
    close: true
  })
  kit.add(contentBox12, kit.SectionTitle('Задачи', 'Значения для новых задач проекта.', 560))
  kit.add(contentBox12, kit.FormRow(
    'Исполнитель по умолчанию',
    kit.Input({ w: 240, icon: 'contact/Person', value: 'Не назначен', menu: true }),
    { w: 560 }
  ))
  kit.add(contentBox12, kit.FormRow('Статус по умолчанию', kit.Input({ w: 240, value: 'Todo', menu: true }), { w: 560 }))
  kit.at(panel, kit.add(
    kit.box(
      'Chat header',
      { w: 400, h: 56, dir: 'row', pad: [0, 16, 0, 16], align: 'center', justify: 'space-between' }
    ),
    kit.add(
      kit.row('title', 8),
      kit.icon('chunter/chunter', T('theme-caption-color')),
      kit.text('Чат · Мобильное приложение', { weight: 600 })
    ),
    kit.Button({ kind: 'ghost', size: 'small', icon: 'x', name: 'Close chat' })
  ), 0, 0)
  const divider3 = kit.box('divider', { w: 400, h: 1, fill: T('theme-divider-color') })
  kit.at(panel, divider3, 0, 56)
  kit.at(panel, kit.add(
    kit.box('Messages', { w: 400, dir: 'column', gap: 16, pad: [16, 16, 16, 16], vs: 'auto' }),
    kit.add(
      kit.box('message', { w: 368, dir: 'row', gap: 10, vs: 'auto' }),
      kit.Avatar('СА', 'Sky', 32),
      kit.add(
        kit.col('body', 2),
        kit.add(
          kit.row('author', 8),
          kit.text('Анна Смирнова', { size: 13, weight: 600 }),
          kit.text('10:12', { size: 12, color: T('theme-darker-color') })
        ),
        kit.text('Поменял исполнителя по умолчанию, проверьте.', { size: 13, w: 322 })
      )
    ),
    kit.add(
      kit.box('message', { w: 368, dir: 'row', gap: 10, vs: 'auto' }),
      kit.Avatar('КМ', 'Grass', 32),
      kit.add(
        kit.col('body', 2),
        kit.add(
          kit.row('author', 8),
          kit.text('Мария Козлова', { size: 13, weight: 600 }),
          kit.text('10:15', { size: 12, color: T('theme-darker-color') })
        ),
        kit.text('Ок. Статус по умолчанию оставляем Backlog?', { size: 13, w: 322 })
      )
    ),
    kit.add(
      kit.box('message', { w: 368, dir: 'row', gap: 10, vs: 'auto' }),
      kit.Avatar('ПИ', 'Watermelon', 32),
      kit.add(
        kit.col('body', 2),
        kit.add(
          kit.row('author', 8),
          kit.text('Иван Петров', { size: 13, weight: 600 }),
          kit.text('10:18', { size: 12, color: T('theme-darker-color') })
        ),
        kit.text('Да, Backlog. Шаблоны задач допишу позже.', { size: 13, w: 322 })
      )
    )
  ), 0, 57)
  kit.at(panel, kit.add(
    kit.box('Message input', {
      w: 368,
      h: 44,
      dir: 'row',
      pad: [0, 12, 0, 12],
      align: 'center',
      fill: T('input-BackgroundColor'),
      stroke: T('input-BorderColor'),
      radius: 8
    }),
    kit.text('Написать сообщение', { color: T('input-PlaceholderColor') })
  ), 16, 984)
}
await kit.settle()
