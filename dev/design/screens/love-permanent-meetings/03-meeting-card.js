// Карточка постоянной встречи: экран встречи, в правой панели галка «Постоянная встреча» -
// по нажатию открывается то же окно настроек, что и создание (`EditPermanentMeeting`).
await kit.page('Карточка постоянной встречи')
{
  const { main, frame, panel } = kit.Workbench('Постоянная встреча - карточка', 0, 0, {
    tab: 'Офис',
    tabIcon: 'building',
    nav: PM_NAV,
    panel: { w: 420 }
  })

  kit.PanelHeader(main, {
    icon: 'users',
    title: 'Планёрка команды',
    actions: [kit.Button({ kind: 'primary', size: 'medium', icon: 'video', label: 'Войти' })]
  })

  const content = kit.col('Встреча', 12, { w: main.width - 32, hs: 'fix' })
  kit.at(main, content, 16, 72)
  kit.add(content, kit.text('Следующее вхождение: 12 ноября, 10:00', { size: 14, color: T('theme-dark-color') }))
  kit.add(content, kit.Notice('Постоянная встреча открыта всегда: сессия появляется при входе, а не по расписанию', 'info', { w: main.width - 32 }))
  kit.add(content, kit.SectionTitle('Участники', 'Владельца и создателя снять нельзя', main.width - 32))
  for (const m of PM_MEMBERS) {
    const r = kit.row('Участник ' + m.name, 8, { w: main.width - 32, h: 32 })
    kit.add(r, kit.Avatar(m.initials, m.palette, 24))
    kit.add(r, kit.text(m.name, { size: 14 }))
    kit.add(content, r)
  }
  kit.add(content, kit.SectionTitle('Прошедшие сессии', 'Каждая сессия - отдельный протокол', main.width - 32))
  kit.add(
    content,
    kit.Table(
      [
        { title: 'Начало', w: 200 },
        { title: 'Длительность', w: 140 },
        { title: 'Участники', w: 160 },
        { title: 'Запись', w: 200 }
      ],
      [
        ['5 ноября, 10:00', '28 мин', '3 участника', 'Запись сохранена'],
        ['29 октября, 10:00', '31 мин', '4 участника', 'Запись сохранена']
      ]
    )
  )

  // Правая панель: свойства встречи и галка «Постоянная встреча».
  if (panel !== undefined) {
    const props = kit.col('Свойства', 10, { w: panel.width - 32, hs: 'fix' })
    kit.at(panel, props, 16, 16)
    kit.add(props, kit.text('Планёрка команды', { size: 18, weight: 500 }))
    kit.add(props, kit.divider(panel.width - 32))
    kit.add(props, kit.Checkbox(true, 'Постоянная встреча'))
    kit.add(props, kit.text('Открывается по кнопке «Настройки»', { size: 12, color: T('theme-darker-color') }))
    kit.add(props, kit.divider(panel.width - 32))
    kit.add(props, kit.text('Повторение: каждую неделю', { size: 13, color: T('theme-caption-color') }))
    kit.add(props, kit.text('Напоминание: за 15 минут', { size: 13, color: T('theme-caption-color') }))
    kit.add(props, kit.text('Пароль для гостей: не задан', { size: 13, color: T('theme-caption-color') }))
    kit.add(props, kit.text('Комната: Переговорная «Синяя»', { size: 13, color: T('theme-caption-color') }))
    kit.add(props, kit.divider(panel.width - 32))
    kit.add(props, kit.text('Гостевая ссылка', { size: 13, weight: 500 }))
    const link = kit.row('link', 8, { w: panel.width - 32, h: 32, align: 'center' })
    kit.add(link, kit.EditBox('app.fusion.local/meetings/p-4d21c8', { w: panel.width - 72 }))
    kit.add(link, kit.IconButton('link', { kind: 'ghost', size: 'small', name: 'Copy link' }))
    kit.add(props, link)
    kit.add(props, kit.Button({ kind: 'tertiary', size: 'small', icon: 'trash', label: 'Удалить встречу' }))
  }

  // Настройки поверх карточки: тот же `PermanentMeetingForm`, но в режиме правки.
  const { modal } = pmFormModal('Настройки встречи')
  kit.at(main, modal, Math.round((main.width - 620) / 2), 120)

  return [frame.id]
}
await kit.settle()
