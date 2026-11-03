// Ссылка на встречу: панель события серии и попап настроек ссылки (`MeetingLinkPopup`).
// Два состояния: пароль не задан и пароль задан - во втором вместо пароля ссылка отдаётся только после ввода.
await kit.page('Ссылка на встречу')
{
  const { main, frame } = kit.Workbench('Ссылка на встречу - настройки', 0, 0, {
    tab: 'Календарь',
    tabIcon: 'calendar',
    nav: LINK_NAV
  })

  const top = kit.PanelHeader(main, {
    icon: 'calendar',
    title: LINK_MEETING.title,
    actions: [kit.Button({ kind: 'secondary', size: 'medium', label: 'Присоединиться' })]
  })

  const content = kit.col('Встреча', 12, { w: main.width - 32, hs: 'fix' })
  kit.at(main, content, 16, top + 16)
  kit.add(content, kit.text(LINK_MEETING.when, { size: 14, color: T('theme-dark-color') }))
  kit.add(content, kit.text(LINK_MEETING.series, { size: 14, color: T('theme-dark-color') }))
  kit.add(content, kit.Notice('Ссылка постоянная: её можно открыть в любой момент, пока она не отозвана', 'info', { w: 520 }))

  const { modal, body } = kit.Modal('Ссылка на встречу', { w: 560, okLabel: 'Готово' })
  kit.at(main, modal, Math.round((main.width - 560) / 2), 120)

  kit.add(body, linkSetting('Кто открывает сессию', kit.row('access', 16, [kit.Radio(true, 'Гость по ссылке'), kit.Radio(false, 'Только участник')]), 'При «гость по ссылке» он может открыть сессию сам, пока идёт окно вхождения; по умолчанию — только участник'))
  kit.add(body, kit.divider(510))
  kit.add(body, linkSetting('Срок жизни ссылки', kit.EditBox(LINK_MEETING.afterTtl, { w: 240 }), 'Отсчёт идёт только когда будущих вхождений не осталось; «бессрочно» — ссылка не истекает'))
  kit.add(body, kit.divider(510))
  kit.add(body, linkSetting('Когда встреча закончилась', kit.row('past', 16, [kit.Radio(false, 'Ничего не показывать'), kit.Radio(true, 'Последнюю встречу')]), '«Последняя» показывает название и запись последней встречи, «ничего» — не раскрывает ничего'))
  kit.add(body, kit.divider(510))
  kit.add(body, linkSetting('Пароль для гостей', kit.row('password', 8, [kit.text('Не задан', { size: 14, color: T('theme-dark-color') }), kit.Button({ kind: 'tertiary', size: 'small', icon: 'lock', label: 'Задать' })]), 'Пароль хранится только на сервере: до ввода гостю не показываются ни название, ни время'))
  kit.add(body, kit.divider(510))
  kit.add(body, linkSetting('Ссылка', linkField(LINK_MEETING.link), 'Ссылку выдаёт участник встречи; отзыв делает предыдущую ссылку недействительной'))

  const footerLine = kit.row('revoke', 8, { w: 510, hs: 'fix', justify: 'space-between' })
  kit.add(footerLine, kit.text('Версия ссылки: 1', { size: 12, color: T('theme-darker-color') }))
  kit.add(footerLine, kit.Button({ kind: 'tertiary', size: 'small', icon: 'trash', label: 'Отозвать ссылку' }))
  kit.add(body, footerLine)

  return [frame.id]
}
await kit.settle()
