// Постоянная встреча (`PermanentMeeting`): открыта всегда, участников ведёт владелец, а снять
// владельца нельзя - иначе встречу некому будет открывать. Ниже - прошедшие сессии.
await kit.page('Постоянная встреча')
{
  const { main, frame } = kit.Workbench('Постоянная встреча - участники и сессии', 0, 0, {
    tab: 'Встречи',
    tabIcon: 'calendar',
    nav: [
      { item: 'Встречи', icon: 'calendar', selected: true },
      { item: 'Постоянные встречи', icon: 'users', selected: true },
      { group: 'Офис', add: true },
      { space: 'Моя комната', icon: 'calendar', color: 'Porpoise' }
    ]
  })

  const top = kit.PanelHeader(main, {
    icon: 'calendar',
    title: 'Постоянная встреча «Дежурная»',
    actions: [kit.Button({ kind: 'primary', size: 'medium', label: 'Войти' })]
  })

  const content = kit.col('Постоянная встреча', 16, { w: main.width - 32, hs: 'fix' })
  kit.at(main, content, 16, top + 16)

  kit.add(content, kit.text('Без расписания: открывается любым входом, ждать вхождения не нужно', { size: 14, color: T('theme-dark-color') }))

  const linkCol = kit.col('Ссылка', 8, { w: 560, hs: 'fix' })
  kit.add(linkCol, kit.SectionTitle('Ссылка', 'Одна и та же, пока владелец её не отзовёт', 560))
  kit.add(linkCol, linkField('app.fusion.local/meetings/p-4d21c8'))
  kit.add(linkCol, kit.Notice('Кто открывает сессию: любой, у кого есть ссылка', 'info', { w: 480 }))
  kit.add(content, linkCol)

  const membersCol = kit.col('Участники', 8, { w: 560, hs: 'fix' })
  kit.add(membersCol, kit.SectionTitle('Участники', 'Владелец остаётся в списке: сервер возвращает его обратно', 560))
  for (const m of LINK_MEMBERS) kit.add(membersCol, linkMemberRow(m))
  kit.add(membersCol, kit.Button({ kind: 'tertiary', size: 'small', icon: 'plus', label: 'Добавить участника' }))
  kit.add(content, membersCol)

  const sessions = kit.col('Сессии', 8, { w: main.width - 32, hs: 'fix' })
  kit.add(sessions, kit.SectionTitle('Прошедшие сессии', 'Каждая сессия - отдельный протокол, документы встречи живут выше', main.width - 32))
  kit.add(
    sessions,
    kit.Table(
      [
        { title: 'Начало', w: 240 },
        { title: 'Длительность', w: 160 },
        { title: 'Участники', w: 200 },
        { title: 'Запись', w: 240 }
      ],
      LINK_SESSIONS
    )
  )
  kit.add(content, sessions)

  return [frame.id]
}
await kit.settle()
