// Раздел «Постоянные встречи»: группы и перетаскивание (`PermanentMeetingsList`). В строке видно
// следующее вхождение, копирование гостевой ссылки только у встреч, где я участник, вход и настройки.
await kit.page('Постоянные встречи и группы')
{
  const { main, frame } = kit.Workbench('Постоянные встречи - группы', 0, 0, {
    tab: 'Офис',
    tabIcon: 'building',
    nav: PM_NAV
  })

  kit.PanelHeader(main, {
    icon: 'users',
    title: 'Постоянные встречи',
    actions: [
      kit.Button({ kind: 'secondary', size: 'medium', label: 'Объединить в группу' }),
      kit.Button({ kind: 'primary', size: 'medium', icon: 'plus', label: 'Новая встреча' })
    ]
  })

  const content = kit.col('Список', 4, { w: main.width - 32, hs: 'fix' })
  kit.at(main, content, 16, 72)
  kit.add(content, kit.text('Порядок групп и встреч сохраняется сразу: тянем шапку - меняются группы, строку - встречи', { size: 13, color: T('theme-dark-color') }))

  const [dev, product] = PM_GROUPS
  kit.add(content, pmGroupHeader(dev, main.width - 32))
  for (const name of dev.meetings.slice(0, 2)) {
    const m = PM_MEETINGS.find((it) => it.name === name)
    if (m !== undefined) kit.add(content, pmRow(m, main.width - 32))
  }
  // Маркер места вставки: строка «Ретро» перетаскивается в другой конец группы.
  kit.add(content, pmDropMarker(main.width - 32))
  {
    const m = PM_MEETINGS.find((it) => it.name === dev.meetings[2])
    if (m !== undefined) kit.add(content, pmRow(m, main.width - 32))
  }

  kit.add(content, pmGroupHeader(product, main.width - 32))
  for (const name of product.meetings) {
    const m = PM_MEETINGS.find((it) => it.name === name)
    if (m !== undefined) kit.add(content, pmRow(m, main.width - 32))
  }

  kit.add(content, kit.text('Без группы', { size: 13, color: T('theme-dark-color') }))
  for (const m of PM_MEETINGS.filter((it) => it.member === false && it.next === undefined)) {
    kit.add(content, pmRow(m, main.width - 32))
  }

  // Меню объединения: отметки встреч и название новой группы (`MeetingGroupPopup`).
  const { modal, body } = kit.Modal('Объединить в группу', { w: 520, okLabel: 'Объединить' })
  kit.add(body, pmField(470, 'Название группы', kit.EditBox('Дежурства', { kind: 'ghost-large', w: 260 })))
  for (const m of PM_MEETINGS.slice(0, 4)) {
    kit.add(body, kit.Checkbox(m.name === 'Ретро' || m.name === 'Демо спринта', m.name))
  }
  kit.at(main, modal, main.width - 560, 132)

  return [frame.id]
}
await kit.settle()
