// Shared data and blocks of the meeting-link screens. Values are mockups, not a snapshot of the
// stand: `docs/love.md` §7a describes the same states, keep the texts in step with it.

const LINK_MEETING = {
  title: 'Планёрка команды',
  series: 'Каждую среду, 10:00',
  when: 'Среда, 5 ноября · 10:00-10:30',
  next: '12 ноября, 10:00',
  host: 'Андрей Зайцев',
  link: 'app.fusion.local/meetings/9f3c1a',
  password: false,
  start: 'link',
  afterTtl: '7 дней после последней встречи',
  past: 'last'
}

const LINK_MEMBERS = [
  { initials: 'АЗ', name: 'Андрей Зайцев', role: 'Владелец встречи', owner: true, palette: 'Blueberry' },
  { initials: 'МП', name: 'Мария Петрова', role: 'Участник', palette: 'Grass' },
  { initials: 'ИС', name: 'Иван Соколов', role: 'Участник', palette: 'Sky' }
]

const LINK_SESSIONS = [
  ['29 октября, 10:00', '28 мин', '3 участника', 'Запись сохранена'],
  ['22 октября, 10:00', '31 мин', '4 участника', 'Запись сохранена'],
  ['15 октября, 10:00', '19 мин', '2 участника', 'Без записи']
]

// Navigation of the calendar app: the meeting panel opens from an event of the series.
const LINK_NAV = [
  { item: 'Мои события', icon: 'calendar', selected: true },
  { item: 'Все события', icon: 'list' },
  { item: 'Календари', icon: 'timeline' },
  { group: 'Календари', add: true },
  { space: 'Команда', icon: 'calendar', color: 'Porpoise' },
  { space: 'Личный', icon: 'calendar', color: 'Sky' }
]

// A row of the members list: the owner carries the lock, because they cannot be removed.
function linkMemberRow (m) {
  const r = kit.row('Участник ' + m.name, 10, { w: 420, h: 40, hs: 'fix', vs: 'fix' })
  kit.add(r, kit.Avatar(m.initials, m.palette, 28))
  const text = kit.col('text', 2)
  kit.add(text, kit.text(m.name, { size: 14, weight: 500, color: T('theme-content-color') }))
  kit.add(text, kit.text(m.role, { size: 12, color: T('theme-darker-color') }))
  kit.add(r, text)
  kit.add(r, kit.spacer(1, 1))
  kit.add(r, m.owner ? kit.Chip([kit.icon('lock', T('theme-dark-color'), 14), kit.text('Нельзя убрать', { size: 12, color: T('theme-dark-color') })]) : kit.IconButton('x', { kind: 'tertiary', size: 'small' }))
  return r
}

// Два варианта выбора подписи в настройках ссылки: `kit.Radio` есть и в Penpot-ките, и в рекордере Storybook
function linkChoice (first, second) {
  return kit.row('choice', 16, { hs: 'fix' })
}

// One row of the link settings: label on the left, control on the right, hint under it.
function linkSetting (label, control, hint) {
  const r = kit.col('Setting ' + label, 6, { w: 480, hs: 'fix' })
  const top = kit.row('top', 16, { w: 480, hs: 'fix', justify: 'space-between' })
  kit.add(top, kit.text(label, { size: 14, color: T('theme-content-color') }))
  kit.add(top, control)
  kit.add(r, top)
  if (hint) kit.add(r, kit.text(hint, { size: 12, color: T('theme-darker-color'), w: 470 }))
  return r
}

// The guest link field with the copy button, as the panel shows it.
function linkField (value) {
  const f = kit.row('Guest link', 8, { w: 480, hs: 'fix' })
  const field = kit.box('field', { w: 400, h: 32, dir: 'row', pad: [0, 10, 0, 10], align: 'center', radius: 6, fill: T('input-BackgroundColor'), stroke: T('input-BorderColor') })
  kit.add(field, kit.text(value, { size: 14, color: T('input-TextColor') }))
  kit.add(f, field, kit.Button({ kind: 'secondary', size: 'medium', icon: 'clip', label: 'Копировать' }))
  return f
}
