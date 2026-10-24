// Current workspace pages (plugins/login-resources): list, creation and joining by invitation.
// Layout follows the code (the list needs a signed-in account, the stand screens were measured logged out);
// the person and the workspace are the demo ones (DEMO.ru).
await kit.page('Login workspaces')
const LIST = 428
const ARROW = 'Выбрать рабочее пространство'

// Header of the list: back button, the person (14 px, 8 above and 12 below) and the 20 px of the empty status
const listHead = (form) => {
  const person = kit.box('person', { w: LIST, h: 10, dir: 'column', pad: [8, 0, 12, 0], vs: 'auto' })
  kit.add(person, kit.text(USER, { size: 14, weight: 600, lh: 1.3, color: '#201240' }))
  kit.add(form, kit.LoginBackTitle(ARROW), person, kit.spacer(LIST, 20))
}
const footer = (form, rows) => kit.add(form, kit.add(kit.box('footer', { w: LIST, h: 10, dir: 'column', pad: [56, 0, 0, 0], vs: 'auto' }), kit.LoginLinks(rows, { accent: true, w: LIST })))
const initial = (card, title, description) => {
  const form = kit.LoginForm(card)
  const box = kit.box('invitation', { w: 396, h: 10, dir: 'column', gap: 8, align: 'center', vs: 'auto' })
  kit.add(form, kit.add(box, kit.text(title, { size: 28, weight: 700, lh: 1.3, color: '#333333', w: 396, align: 'center' }), kit.text(description, { size: 14, lh: 1.3, color: '#201240', w: 396, align: 'center' })))
}
// "Back" of the invitation steps: a ghost button in a padded row
const back = (card) => {
  const row = kit.box('back row', { w: 460, h: 60, dir: 'row', pad: [8, 8, 8, 8], align: 'center' })
  const button = kit.box('back', { w: 10, h: 44, dir: 'row', pad: [0, 16, 0, 16], align: 'center', hs: 'auto', radius: 8 })
  kit.add(card, kit.add(row, kit.add(button, kit.text('Назад', { size: 15.2, lh: 1, color: '#201240' }))))
}

{
  const { card } = page('Выбор рабочего пространства', 0)
  const form = kit.LoginForm(card, { pad: [16, 16, 16, 16] })
  listHead(form)
  const list = kit.box('workspaces', { w: LIST, h: 10, dir: 'column', pad: [2, 0, 14, 0], vs: 'auto' })
  kit.add(form, kit.add(list, kit.LoginWorkspace(WORKSPACE, '(2 days)')))
  footer(form, [['Хотите создать другое рабочее пространство?', 'Создать рабочее пространство'], ['Не видите ваше рабочее пространство?', 'Сменить пользователя']])
}
{
  const { card } = page('Нет рабочих пространств', 1)
  const form = kit.LoginForm(card, { pad: [16, 16, 16, 16] })
  listHead(form)
  kit.add(form, kit.box('workspaces', { w: LIST, h: 10, dir: 'column', pad: [2, 0, 2, 0], vs: 'auto' }), kit.LoginButton('Создать рабочее пространство', { w: LIST }))
  footer(form, [['Не видите ваше рабочее пространство?', 'Сменить пользователя']])
}
{
  const { card } = page('Создание рабочего пространства', 2)
  loginForm(card, {
    head: kit.LoginTitle('Создать рабочее пространство', { subtitle: USER }),
    rows: [kit.LoginField('Рабочее пространство'), kit.LoginStatus('Требуется заполнить Рабочее пространство'), kit.LoginButton('Создать рабочее пространство', { disabled: true })],
    links: [['Уже есть рабочее пространство?', 'Выбрать рабочее пространство']]
  })
}
{
  const { card } = page('Приглашение', 3)
  const form = kit.LoginForm(card)
  const box = kit.box('invitation', { w: 396, h: 10, dir: 'column', align: 'center', vs: 'auto' })
  const actions = kit.box('actions', { w: 300, h: 10, dir: 'column', gap: 12, pad: [16, 0, 0, 0], vs: 'auto' })
  kit.add(actions, kit.LoginButton('Присоединиться как ' + USER, { w: 300 }), kit.LoginButton('Создать новый аккаунт', { kind: 'default', w: 300 }), kit.LoginButton('Присоединиться с существующим аккаунтом', { kind: 'default', w: 300 }))
  const name = kit.box('workspace', { w: 396, h: 10, dir: 'row', pad: [0, 0, 24, 0], justify: 'center', vs: 'auto' })
  kit.add(name, kit.text(WORKSPACE, { size: 24, weight: 600, lh: 1.3, color: '#000061' }))
  kit.add(form, kit.add(box, kit.text('Присоединиться к', { size: 28, weight: 700, lh: 1.3, color: '#333333' }), name, actions))
}
{
  const { card } = page('Приглашение: регистрация', 4)
  back(card)
  loginForm(card, {
    head: kit.LoginTitle('Зарегистрироваться и присоединиться', { subtitle: WORKSPACE }),
    rows: [[kit.LoginField('Имя'), kit.LoginField('Фамилия'), kit.LoginField('Email'), kit.LoginField('Номер телефона')], consents(false, { password: true }), kit.LoginStatus('Требуется заполнить Имя'), kit.LoginButton('Зарегистрироваться и присоединиться', { disabled: true })],
    providers: true
  })
}
{
  const { card } = page('Приглашение: срок истёк', 5)
  initial(card, 'Срок приглашения истёк', 'Пожалуйста, запросите новую ссылку')
}
{
  const { card } = page('Приглашение: нет свободных мест', 6)
  initial(card, 'Нет свободных мест', 'В рабочем пространстве достигнут лимит мест по тарифу. Пожалуйста, обратитесь к администратору пространства.')
}
{
  const { card } = page('Приглашение: обработка', 7)
  const box = kit.box('processing', { w: 460, h: 10, dir: 'column', gap: 16, pad: [16, 0, 16, 0], align: 'center', vs: 'auto' })
  kit.add(card, kit.add(box, kit.text('Обработка приглашения, пожалуйста, подождите...', { size: 14, lh: 1.3, color: '#333333' }), kit.box('spinner', { w: 32, h: 32, radius: 16, stroke: '#CF13A2', strokeW: 3 })))
}
await kit.settle()
