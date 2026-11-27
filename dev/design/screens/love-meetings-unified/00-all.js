// Все экраны раздела «Встречи» на одном полотне, 2x2: календарь, список, таблица и «Группы».
// Так макет удобно сверять целиком; отдельные фреймы остаются страницами 01-04.
await kit.page('Встречи - все экраны')
{
  const W = 1920
  const H = 1080
  const GAP = 80
  const screens = [
    ['Встречи - календарь', MT_NAV, mtCalendarPage],
    ['Встречи - список', MT_NAV, mtListPage],
    ['Встречи - таблица', MT_NAV, mtTablePage],
    ['Группы встреч', MT_NAV_GROUPS, mtGroupsPage]
  ]

  const ids = []
  screens.forEach(([name, nav, draw], i) => {
    const x = (i % 2) * (W + GAP)
    const y = Math.floor(i / 2) * (H + GAP)
    const { main, frame } = kit.Workbench(name, x, y, { ...MT_OPTIONS, nav })
    draw(main)
    ids.push(frame.id)
  })
  return ids
}
await kit.settle()
