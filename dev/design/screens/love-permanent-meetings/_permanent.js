// Общие данные и блоки экранов постоянных встреч (`docs/love.md` §7a.7). Тексты - макеты русского
// интерфейса, держать в шаге с документом.

const PM_GROUPS = [
  { name: 'Разработка', count: 3, meetings: ['Планёрка команды', 'Демо спринта', 'Ретро'] },
  { name: 'Продукт', count: 2, meetings: ['Синк по роадмапу', 'Разбор метрик'] }
]

const PM_MEETINGS = [
  { name: 'Планёрка команды', next: '12 ноября, 10:00', member: true, joinable: true },
  { name: 'Демо спринта', next: '13 ноября, 16:00', member: true, joinable: true },
  { name: 'Ретро', next: '14 ноября, 17:00', member: true, joinable: false },
  { name: 'Синк по роадмапу', next: '17 ноября, 11:00', member: true, joinable: true },
  { name: 'Разбор метрик', next: '18 ноября, 09:30', member: false, joinable: false },
  { name: 'Дежурная', next: undefined, member: false, joinable: false }
]

const PM_MEMBERS = [
  { initials: 'АЗ', name: 'Андрей Зайцев', palette: 'Blueberry' },
  { initials: 'МП', name: 'Мария Петрова', palette: 'Grass' },
  { initials: 'ИС', name: 'Иван Соколов', palette: 'Sky' },
  { initials: 'КД', name: 'Кира Дёмина', palette: 'Coin' }
]

// Строка списка: название, следующее вхождение, копирование гостевой ссылки (только участнику),
// вход и настройки.
function pmRow (m, w) {
  const r = kit.box('Meeting ' + m.name, { w, h: 40, dir: 'row', gap: 8, pad: [0, 12, 0, 12], align: 'center', radius: 6 })
  kit.add(r, kit.icon('calendar', T('theme-dark-color'), 16))
  kit.add(r, kit.text(m.name, { size: 14, color: T('theme-caption-color') }))
  kit.add(r, kit.spacer(1, 1))
  if (m.next !== undefined) kit.add(r, kit.text(m.next, { size: 12, color: T('theme-dark-color') }))
  if (m.member) kit.add(r, kit.IconButton('link', { kind: 'ghost', size: 'small', name: 'CopyLink/' + m.name }))
  if (m.joinable) kit.add(r, kit.IconButton('video', { kind: 'ghost', size: 'small', name: 'Join/' + m.name }))
  kit.add(r, kit.IconButton('settings', { kind: 'ghost', size: 'small', name: 'Settings/' + m.name }))
  return r
}

// Шапка группы: ручка перетаскивания, название, счётчик, переименование.
function pmGroupHeader (group, w) {
  const h = kit.box('Group ' + group.name, {
    w,
    h: 32,
    dir: 'row',
    gap: 8,
    pad: [0, 8, 0, 8],
    align: 'center',
    radius: 6,
    fill: T('theme-bg-accent-color')
  })
  kit.add(h, kit.text('⋮⋮', { size: 12, color: T('theme-dark-color') }))
  kit.add(h, kit.text(group.name, { size: 14, weight: 500, color: T('theme-caption-color') }))
  kit.add(h, kit.spacer(1, 1))
  kit.add(h, kit.Count(group.count))
  kit.add(h, kit.IconButton('edit', { kind: 'ghost', size: 'small', name: 'Rename/' + group.name }))
  return h
}

// Место, куда встанет перетаскиваемая строка.
function pmDropMarker (w) {
  return kit.box('Drop marker', { w, h: 2, fill: T('primary-button-default') })
}

// Поле окна: подпись слева, контрол справа.
function pmField (w, label, control) {
  const r = kit.box('Field ' + label, { w, h: 36, dir: 'row', gap: 12, align: 'center' })
  const l = kit.box('label', { w: 180, h: 20, dir: 'row', align: 'center' })
  kit.add(l, kit.text(label, { size: 13, color: T('theme-dark-color') }))
  kit.add(r, l, control)
  return r
}

// Окно «Новая встреча» / «Настройки встречи» - одно на создание и на правку (`PermanentMeetingForm`).
function pmFormModal (title) {
  const { modal, body } = kit.Modal(title, { w: 620, okLabel: 'Сохранить' })
  kit.add(body, pmField(570, 'Название', kit.EditBox('Планёрка команды', { kind: 'large-style', w: 360 })))

  const dateRow = kit.row('date', 8, {
    w: 360,
    h: 32,
    pad: [0, 8, 0, 8],
    radius: 6,
    stroke: T('input-BorderColor'),
    fill: T('input-BackgroundColor')
  })
  kit.add(dateRow, kit.icon('calendar', T('theme-dark-color'), 14))
  kit.add(dateRow, kit.text('12 ноября 2026', { size: 14, color: T('input-TextColor') }))
  kit.add(dateRow, kit.text('10:00 - 10:30', { size: 14, color: T('input-TextColor') }))
  kit.add(body, pmField(570, 'Дата и время', dateRow))

  kit.add(body, pmField(570, 'Промежуток повторения', kit.EditBox('Каждую неделю', { kind: 'ghost-large', w: 360 })))

  const memberRow = kit.row('members', 4, { w: 360, h: 28, align: 'center' })
  for (const m of PM_MEMBERS) kit.add(memberRow, kit.Avatar(m.initials, m.palette, 24))
  kit.add(memberRow, kit.IconButton('plus', { kind: 'tertiary', size: 'small', name: 'Add member' }))
  kit.add(body, pmField(570, 'Участники', memberRow))

  kit.add(body, pmField(570, 'Напомнить за', kit.EditBox('15 минут', { kind: 'ghost-large', w: 120 })))
  kit.add(body, pmField(570, 'Пароль для гостей', kit.EditBox('Не задан', { kind: 'ghost-large', w: 240 })))
  kit.add(body, pmField(570, 'Комната', kit.EditBox('Переговорная «Синяя»', { kind: 'ghost-large', w: 300 })))
  return { modal, body }
}

// Раскладка раздела офиса: «Встречи» и «Постоянные встречи» в навигаторе.
const PM_NAV = [
  { item: 'Этажи', icon: 'building' },
  { item: 'Встречи', icon: 'calendar' },
  { item: 'Постоянные встречи', icon: 'users', selected: true },
  { group: 'Офис', add: true },
  { space: 'Моя комната', icon: 'calendar', color: 'Porpoise' }
]
