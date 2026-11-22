// «Встречи» - представление «Таблица» (Р1): колонки страницы постоянных встреч переехали в раздел встреч.
await kit.page('Встречи - таблица')
{
  const { main, frame } = kit.Workbench('Встречи - таблица', 0, 0, { ...MT_OPTIONS, nav: MT_NAV })
  mtTablePage(main)
  return [frame.id]
}
await kit.settle()
