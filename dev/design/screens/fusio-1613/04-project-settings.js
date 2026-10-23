// FUSIO-1613: project settings as a settings page; board settings are a separate page (03).
// Replaces the "Edit project" popup; fields are taken from it (sanity-ws / DefaultProject).
// Entry: the gear in the header of a project view. Exit: "К доске" or the cross.
await kit.page('4. Настройки проекта (to-be)')

const app = DEMO.ru.projects.find((p) => p.id === 'APP')
const settings = (tab, x, y, o = {}) => {
  const { frame, main, panel } = kit.Workbench('Настройки проекта - ' + tab, x, y, { tab: 'Настройки проекта', nav: projectNav(), ...o })
  const content = kit.SettingsLayout(main, { back: 'К доске', close: true, title: 'Настройки проекта', tabs: PROJECT_TABS, tab })
  return { frame, content, panel }
}
const ids = []
const person = (initials, name, pal) => kit.add(kit.row('person', 8), kit.Avatar(initials, pal, 24), kit.text(name, { size: 14 }))

// ---- General -----------------------------------------------------------------
{
  const { frame, content } = settings('Основное', 0, 0)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Основное', 'Изменения сохраняются сразу.', 720))
  kit.add(content,
    kit.FormRow('Тип проекта', kit.add(kit.row('type', 8), kit.Chip([kit.StatusIcon('backlog'), kit.text('Default', { size: 13, color: T('theme-dark-color') })]), kit.Button({ kind: 'tertiary', size: 'extra-small', label: 'Открыть тип проекта' })), { hint: 'Статусы и типы задач берутся из типа' }),
    kit.FormRow('Название', kit.Input({ w: 420, value: app.name })),
    kit.FormRow('Идентификатор', kit.Input({ w: 160, value: app.id }), { hint: `Префикс номеров задач: ${app.id}-6` }),
    kit.FormRow('Описание', kit.Input({ w: 420, value: app.description.replace(/\s*\n\s*/g, ' '), h: 64 })),
    kit.FormRow('Иконка', kit.add(kit.row('icons', 6), ['board', 'star', 'component', 'milestone', 'users'].map((i, n) => {
      const b = kit.box('icon', { w: 32, h: 32, dir: 'row', align: 'center', justify: 'center', radius: 6, fill: n === 0 ? T('theme-button-hovered') : null, stroke: n === 0 ? T('primary-button-default') : T('theme-button-border') })
      return kit.add(b, kit.icon(i, T('theme-dark-color')))
    })))
  )
}

// ---- Members and access ------------------------------------------------------
{
  const { frame, content } = settings('Участники и доступ', 2020, 0)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Участники и доступ', 'Кто видит проект и кто может его настраивать.', 720))
  kit.add(content,
    kit.FormRow('Приватный проект', kit.Toggle(false), { hint: 'Видят только участники' }),
    kit.FormRow('Автовступление', kit.Toggle(false), { hint: 'Новые сотрудники становятся участниками автоматически' }),
    kit.divider(720))
  const role = (r) => kit.Input({ w: 160, value: r, menu: true })
  kit.add(content, kit.add(kit.box('members head', { w: 760, h: 32, dir: 'row', align: 'center', justify: 'space-between' }),
    kit.text('Участники · 4', { size: 14, weight: 600 }), kit.Button({ size: 'small', icon: 'plus', label: 'Добавить участника' })))
  const tw = content.width - 64
  kit.add(content, kit.Table([{ title: 'Сотрудник', w: tw - 256 }, { title: 'Роль', w: 200 }, { title: '', w: 56 }], [
    ...DEMO.ru.people.map((p, i) => [person(p.initials, p.name, p.color), role(i === 0 ? 'Владелец' : 'Участник'), kit.IconButton('more', { kind: 'ghost', size: 'extra-small' })])
  ], { name: 'Members table' }))
}

// ---- Issues defaults ---------------------------------------------------------
{
  const { frame, content } = settings('Задачи', 0, 1200)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Задачи', 'Значения для новых задач проекта.', 720))
  kit.add(content,
    kit.FormRow('Исполнитель по умолчанию', kit.Input({ w: 240, value: 'Не назначен', icon: 'contact/Person', menu: true })),
    kit.FormRow('Статус по умолчанию', kit.Input({ w: 240, value: app.defaultStatus, menu: true })),
    kit.FormRow('Шаблоны задач', kit.Input({ w: 240, value: 'Открыть шаблоны (3)', icon: 'tracker/issuetemplates' })))
}

// ---- Statuses and workflow ---------------------------------------------------
{
  const { frame, content } = settings('Статусы и workflow', 2020, 1200)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Статусы и workflow', 'Статусы задаются типом проекта «Default» и общие для всех его проектов. Доски группируют эти статусы в колонки.', 760))
  const catTitle = { backlog: 'Бэклог', todo: 'К выполнению', active: 'В работе', won: 'Выполнено', lost: 'Отменено' }
  // The project type's own workflow: the first five statuses
  const cats = Object.entries(catTitle).map(([c, t]) => [t, DEMO.ru.statuses.slice(0, 5).filter((st) => st.category === c).map((st) => [st.name, c])])
  const list = kit.box('Statuses', { w: 760, h: 10, dir: 'column', gap: 12, vs: 'auto' })
  for (const [title, sts] of cats) {
    const g = kit.col('category ' + title, 6)
    kit.add(g, kit.text(title, { size: 12, weight: 500, color: T('theme-dark-color'), upper: true }))
    for (const [n, cat, pal] of sts) {
      const r = kit.box('status ' + n, { w: 760, h: 36, dir: 'row', gap: 8, pad: [0, 12, 0, 12], align: 'center', radius: 6, fill: T('theme-list-row-color') })
      kit.add(r, kit.StatusIcon(cat, 14, pal), kit.text(n, { size: 14 }))
      kit.add(g, r)
    }
    kit.add(list, g)
  }
  kit.add(content, list)
  kit.add(content, kit.add(kit.row('actions', 8), kit.Button({ size: 'small', icon: 'gear', label: 'Изменить статусы в типе проекта' }), kit.Button({ kind: 'ghost', size: 'small', icon: 'timeline', label: 'Workflow mapping' })))
}

// ---- Archive -----------------------------------------------------------------
{
  const { frame, content } = settings('Архив', 0, 2400)
  ids.push(frame.id)
  kit.add(content, kit.SectionTitle('Архив', 'Архивный проект скрыт из навигации, задачи остаются доступны по ссылке и в поиске.', 720))
  kit.add(content, kit.Notice('Проект можно вернуть из архива в «All projects».', 'info', { w: 720 }))
  kit.add(content, kit.Button({ kind: 'negative', size: 'small', icon: 'trash', label: 'Архивировать проект' }))
}

// ---- Chat open on the right: settings take the main area, the chat stays ---------
{
  const { frame, content, panel } = settings('Задачи', 2020, 2400, { panel: { w: 400 }, selected: 'chunter/chunter', widgets: ['calendar/calendar', 'chunter/chunter', 'love/office', 'rating/rating', 'view/ai-star'] })
  ids.push(frame.id)
  frame.name = 'Настройки проекта - Задачи, чат справа'
  kit.add(content, kit.SectionTitle('Задачи', 'Значения для новых задач проекта.', 560))
  kit.add(content,
    kit.FormRow('Исполнитель по умолчанию', kit.Input({ w: 240, value: 'Не назначен', icon: 'contact/Person', menu: true }), { w: 560 }),
    kit.FormRow('Статус по умолчанию', kit.Input({ w: 240, value: app.defaultStatus, menu: true }), { w: 560 }))
  const head = kit.box('Chat header', { w: 400, h: 56, dir: 'row', pad: [0, 16, 0, 16], align: 'center', justify: 'space-between' })
  kit.add(head, kit.add(kit.row('title', 8), kit.icon('chunter/chunter', T('theme-caption-color')), kit.text(`Чат · ${app.name}`, { size: 14, weight: 600 })), kit.IconButton('x', { kind: 'ghost', size: 'small', name: 'Close chat' }))
  kit.at(panel, head, 0, 0)
  kit.at(panel, kit.divider(400), 0, 56)
  const msgs = kit.box('Messages', { w: 400, h: 10, dir: 'column', gap: 16, pad: [16, 16, 16, 16], vs: 'auto' })
  const text = ['Поменял исполнителя по умолчанию, проверьте.', 'Ок. Статус по умолчанию оставляем Backlog?', 'Да, Backlog. Шаблоны задач допишу позже.']
  DEMO.ru.people.slice(0, 3).forEach((p, i) => {
    const m = kit.box('message', { w: 368, h: 10, dir: 'row', gap: 10, vs: 'auto' })
    const body = kit.col('body', 2)
    kit.add(body, kit.add(kit.row('author', 8), kit.text(p.name, { size: 13, weight: 600 }), kit.text(`10:${12 + i * 3}`, { size: 12, color: T('theme-darker-color') })), kit.text(text[i], { size: 13, w: 322 }))
    kit.add(msgs, kit.add(m, kit.Avatar(p.initials, p.color, 32), body))
  })
  kit.at(panel, msgs, 0, 57)
  const input = kit.box('Message input', { w: 368, h: 44, dir: 'row', pad: [0, 12, 0, 12], align: 'center', radius: 8, fill: T('input-BackgroundColor'), stroke: T('input-BorderColor') })
  kit.at(panel, kit.add(input, kit.text('Написать сообщение', { size: 14, color: T('input-PlaceholderColor') })), 16, panel.height - 60)
}

await kit.settle()
return ids
