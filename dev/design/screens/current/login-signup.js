// Current sign-up pages (plugins/login-resources): the form, the code variant, confirmation and the result.
// Geometry follows the sanity stand at 1920x1080; the person is the demo user (DEMO.ru).
await kit.page('Signup')
const head = () => kit.LoginTabs(PLATFORM, TABS, 'Регистрация')
const person = [['Имя', 'Анна'], ['Фамилия', 'Смирнова'], ['Email', EMAIL], ['Номер телефона', '+7-900-123-45-67']]
const empty = () => [kit.LoginField('Имя'), kit.LoginField('Фамилия'), kit.LoginField('Email'), kit.LoginField('Номер телефона')]
const filledFields = () => person.map(([label, value]) => kit.LoginField(label, { value }))
const passwords = (on) => (on ? [kit.LoginField('Пароль', { value: '12345678', password: true }), kit.LoginField('Повторите пароль', { value: '12345678', password: true })] : [kit.LoginField('Пароль'), kit.LoginField('Повторите пароль')])

{
  const { card } = page('Регистрация', 0)
  loginForm(card, {
    head: head(),
    rows: [empty(), passwords(false), consents(false), kit.LoginStatus('Требуется заполнить Имя'), kit.LoginButton('Зарегистрироваться', { disabled: true })],
    providers: true
  })
}
{
  const { card } = page('Регистрация: заполнено', 1)
  loginForm(card, {
    head: head(),
    rows: [filledFields(), passwords(true), consents(true), kit.LoginStatus(), kit.LoginButton('Зарегистрироваться')],
    providers: true
  })
}
{
  const { card } = page('Регистрация по коду', 2)
  loginForm(card, {
    head: head(),
    rows: [filledFields(), consents(false, { password: true }), kit.LoginStatus('Требуется заполнить Имя'), kit.LoginButton('Зарегистрироваться', { disabled: true })],
    providers: true
  })
}
{
  const { card } = page('Регистрация: подтверждение почты', 3)
  const form = kit.LoginForm(card, { pad: [58.6, 40, 40, 40] })
  const w = 380
  const message = kit.box('message', { w, h: 10, dir: 'column', gap: 18.6, align: 'center', vs: 'auto' })
  kit.add(message, kit.text('На Вашу почту отправлено сообщение, c ссылкой для подтверждения email.', { size: 14, weight: 700, lh: 1.3, color: '#333333', w, align: 'center' }), kit.text('Пожалуйста, перейдите по ссылке для завершения регистрации.', { size: 14, lh: 1.3, color: '#333333', w, align: 'center' }))
  kit.add(form, message)
}
{
  const { card } = page('Регистрация завершена', 4)
  const hint = kit.text('Создайте собственное пространство или попросите у владельца существующего пространства ссылку на доступ.', { size: 14, lh: 1.3, color: '#201240', w: 396 })
  loginForm(card, {
    head: kit.LoginTitle('Регистрация завершена', { subtitle: USER }),
    rows: [hint, kit.LoginStatus(), kit.LoginButton('Создать рабочее пространство')],
    links: [['Уже есть рабочее пространство?', 'Выбрать рабочее пространство']]
  })
}
await kit.settle()
