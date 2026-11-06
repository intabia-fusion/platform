// Раздел «Постоянные встречи»: окно «Новая встреча» (`PermanentMeetingForm`) поверх раздела.
// Одно окно на создание и на правку, поэтому ниже (03) оно же показано из карточки встречи.
await kit.page('Новая постоянная встреча')
{
  const { main, frame } = kit.Workbench('Постоянные встречи - создание', 0, 0, {
    tab: 'Офис',
    tabIcon: 'building',
    nav: PM_NAV
  })

  const top = kit.PanelHeader(main, {
    icon: 'users',
    title: 'Постоянные встречи',
    actions: [
      kit.Button({ kind: 'secondary', size: 'medium', label: 'Объединить в группу' }),
      kit.Button({ kind: 'primary', size: 'medium', icon: 'plus', label: 'Новая встреча' })
    ]
  })

  const content = kit.col('Список', 8, { w: main.width - 32, hs: 'fix' })
  kit.at(main, content, 16, top + 16)
  kit.add(content, kit.text('Постоянные встречи собраны в группы, порядок задаётся перетаскиванием', { size: 13, color: T('theme-dark-color') }))
  for (const g of PM_GROUPS) {
    kit.add(content, pmGroupHeader(g, main.width - 32))
    for (const name of g.meetings) {
      const m = PM_MEETINGS.find((it) => it.name === name)
      if (m !== undefined) kit.add(content, pmRow(m, main.width - 32))
    }
  }
  kit.add(content, kit.text('Без группы', { size: 13, color: T('theme-dark-color') }))
  for (const m of PM_MEETINGS.filter((it) => it.member === false && it.next === undefined)) {
    kit.add(content, pmRow(m, main.width - 32))
  }

  // Окно поверх раздела: то же, что откроет кнопка «Новая встреча».
  const { modal } = pmFormModal('Новая встреча')
  kit.at(main, modal, Math.round((main.width - 620) / 2), 96)

  return [frame.id]
}
await kit.settle()
