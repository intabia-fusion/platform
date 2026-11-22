// Вкладка «Группы» (Р2): заменила «Постоянные встречи». Показывает три набора строк:
// встречи календаря, постоянные встречи и встречи без отображения (нет серии, не видны в календаре).
await kit.page('Группы встреч')
{
  const { main, frame } = kit.Workbench('Группы встреч', 0, 0, { ...MT_OPTIONS, nav: MT_NAV_GROUPS })
  mtGroupsPage(main)
  return [frame.id]
}
await kit.settle()
