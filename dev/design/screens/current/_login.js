// Shared texts and demo data of the login screens (plugins/login-assets/lang/ru.json).
// The user is the first person of the demo workspace, the login is the stand account demo1.
const USER = DEMO.ru.people[0].name
const EMAIL = 'demo1'
const WORKSPACE = 'demo-ws'
const PLATFORM = 'Интабия Платформа'
const COPYRIGHT = ['© 2026,', 'Интабия Фьюжн']
const TABS = ['Регистрация', 'Вход']
const PROVIDERS = [['google', 'Войти через Google'], ['github', 'Войти через GitHub']]
const CONSENT = [
  { text: 'Я даю Согласие на обработку персональных данных' },
  { text: 'Я согласен с Лицензионным договором, Пользовательским соглашением, Политикой конфиденциальности' }
]

// Frame number n of a page: two columns, 1200 px apart
const pos = (n) => [(n % 2) * 2040, Math.floor(n / 2) * 1200]
const page = (name, n) => kit.LoginPage(name, ...pos(n), { copyright: COPYRIGHT })

// The usual form of Form.svelte: head, fields 24 px apart, providers and the links under the button.
// o: head, rows[], providers (true: the empty gap of the product, or the buttons), links[[caption, link]]
const loginForm = (card, o) => {
  const form = kit.LoginForm(card, o.pad ? { pad: o.pad } : {})
  const grid = kit.box('form', { w: 396, h: 10, dir: 'column', gap: 24, pad: [24, 0, 0, 0], vs: 'auto' })
  kit.add(grid, o.rows)
  kit.add(form, o.head, grid)
  if (o.providers === true) kit.add(form, kit.spacer(396, 16))
  else if (o.providers) kit.add(form, kit.LoginProviders(o.providers))
  if (o.links) kit.add(form, kit.add(kit.box('footer', { w: 396, h: 10, dir: 'column', pad: [28, 0, 0, 0], vs: 'auto' }), kit.LoginLinks(o.links)))
  return form
}
// Group of option and consent lines, 8 px under each
const consents = (checked, o = {}) => {
  const group = kit.box('consents', { w: 396, h: 10, dir: 'column', gap: 8, pad: [0, 0, 8, 0], vs: 'auto' })
  if (o.password) kit.add(group, kit.LoginCheckbox(false, 'Установить пароль сейчас'))
  return kit.add(group, CONSENT.map((c) => kit.LoginCheckbox(checked, c.text, { invalid: o.invalid })))
}
