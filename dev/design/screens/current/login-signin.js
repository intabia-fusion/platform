// Current sign-in pages (plugins/login-resources): password, one-time code, providers.
// Geometry follows the sanity stand at 1920x1080; the person is the demo user (DEMO.ru).
await kit.page('Login')
const head = () => kit.LoginTabs(PLATFORM, TABS, 'Вход')
const required = 'Требуется заполнить Email'

// ---- Password ----
{
  const { card } = page('Вход по паролю', 0)
  loginForm(card, {
    head: head(),
    rows: [kit.LoginField('Email'), kit.LoginField('Пароль'), kit.LoginStatus(required), kit.LoginButton('Вход', { disabled: true })],
    providers: true,
    links: [['Забыли пароль?', 'Восстановить']]
  })
  kit.add(card, kit.LoginAction('Войти с кодом'))
}
{
  const { card } = page('Вход по паролю: заполнено', 1)
  loginForm(card, {
    head: head(),
    rows: [kit.LoginField('Email', { value: EMAIL }), kit.LoginField('Пароль', { value: '12345678', password: true }), kit.LoginStatus(), kit.LoginButton('Вход')],
    providers: true,
    links: [['Забыли пароль?', 'Восстановить']]
  })
  kit.add(card, kit.LoginAction('Войти с кодом'))
}
{
  const { card } = page('Вход по паролю: неверный пароль', 2)
  loginForm(card, {
    head: head(),
    rows: [kit.LoginField('Email', { value: EMAIL }), kit.LoginField('Пароль', { value: '12345678', password: true, error: true }), kit.LoginStatus('Неверный пароль', { kind: 'error' }), kit.LoginButton('Вход')],
    providers: true,
    links: [['Забыли пароль?', 'Восстановить']]
  })
  kit.add(card, kit.LoginAction('Войти с кодом'))
}
{
  const { card } = page('Вход через провайдера', 3)
  loginForm(card, {
    head: head(),
    rows: [kit.LoginField('Email', { value: EMAIL }), kit.LoginField('Пароль', { value: '12345678', password: true }), kit.LoginStatus(), kit.LoginButton('Вход')],
    providers: PROVIDERS,
    links: [['Забыли пароль?', 'Восстановить']]
  })
  kit.add(card, kit.LoginAction('Войти с кодом'))
}

// ---- One-time code ----
{
  const { card } = page('Вход по коду', 4)
  loginForm(card, {
    head: head(),
    rows: [kit.LoginField('Email'), kit.LoginStatus(required), kit.LoginButton('Вход', { disabled: true })],
    providers: true
  })
  kit.add(card, kit.LoginAction('Войти с паролем'))
}
{
  const { card } = page('Вход по коду: ввод кода', 5)
  const form = kit.LoginForm(card, { pad: [16, 24, 16, 24] })
  const body = kit.box('body', { w: 412, h: 10, dir: 'column', pad: [24, 0, 0, 0], vs: 'auto' })
  const footer = kit.box('footer', { w: 412, h: 74, dir: 'column', gap: 4, pad: [24, 0, 0, 0] })
  kit.add(footer, kit.text('Не нашли код? Проверьте папку со спамом.', { size: 12.8, lh: 1.3, color: '#00000066' }), kit.text('Изменить email', { size: 12.8, lh: 1.3, color: '#333333' }))
  kit.add(form, kit.LoginOtpHeader('Введите код', 'Мы отправили код на', EMAIL), kit.add(body, kit.LoginCode('482913')), footer, kit.box('status', { w: 412, h: 46, pad: [8, 0, 0, 0] }))
}

// ---- Providers only ----
{
  const { card } = page('Вход: только провайдеры', 6)
  const form = kit.LoginForm(card, { pad: [64, 80, 64, 80] })
  kit.add(form, kit.LoginTabs(null, ['Вход'], 'Вход', 300), kit.LoginProviders(PROVIDERS, 300))
}
await kit.settle()
