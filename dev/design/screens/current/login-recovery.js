// Current password recovery, link confirmation and profile pages (plugins/login-resources).
// Geometry follows the sanity stand at 1920x1080; the person is the demo user (DEMO.ru).
await kit.page('Login recovery')
const title = () => kit.LoginTitle('Восстановление пароля')
const centered = (card, texts) => {
  const form = kit.LoginForm(card, { pad: [40, 40, 40, 40] })
  const box = kit.box('message', { w: 380, h: 10, dir: 'column', gap: 18.6, align: 'center', vs: 'auto' })
  kit.add(form, kit.add(box, texts.map(([t, bold]) => kit.text(t, { size: 14, weight: bold ? 700 : 400, lh: 1.3, color: '#333333', w: 380, align: 'center' }))))
}

{
  const { card } = page('Восстановление пароля', 0)
  loginForm(card, {
    head: title(),
    rows: [kit.LoginField('Email'), kit.LoginStatus('Требуется заполнить Email'), kit.LoginButton('Восстановить', { disabled: true })],
    links: [['Знаете пароль?', 'Вход'], ['Нет учетной записи?', 'Зарегистрироваться']]
  })
}
{
  const { card } = page('Восстановление пароля: новый пароль', 1)
  loginForm(card, {
    head: title(),
    rows: [kit.LoginField('Пароль'), kit.LoginField('Повторите пароль'), kit.LoginStatus('Требуется заполнить Пароль'), kit.LoginButton('Восстановить', { disabled: true })]
  })
}
{
  const { card } = page('Смена пароля', 2)
  loginForm(card, {
    head: kit.LoginTitle('Изменить пароль'),
    rows: [kit.LoginField('Текущий пароль'), kit.LoginField('Новый пароль'), kit.LoginField('Повторите новый пароль'), kit.LoginStatus('Требуется заполнить Текущий пароль'), kit.LoginButton('Изменить пароль', { disabled: true })]
  })
}
{
  const { card } = page('Подтверждение: проверка ссылки', 3)
  centered(card, [['Проверяем ссылку...', false]])
}
{
  const { card } = page('Подтверждение: уже зарегистрированы', 4)
  loginForm(card, { head: kit.LoginTitle('Вы уже зарегистрированы в платформе'), rows: [kit.LoginStatus(), kit.LoginButton('Продолжить')] })
}
{
  const { card } = page('Подтверждение: ссылка недействительна', 5)
  loginForm(card, { head: kit.LoginTitle('Ссылка недействительна'), rows: [kit.LoginStatus(), kit.LoginButton('Вход')] })
}
{
  const { card } = page('Вход по ссылке', 6)
  loginForm(card, { head: kit.LoginTitle('Вход в аккаунт'), rows: [kit.LoginStatus(), kit.LoginButton('Вход')] })
}
{
  const { card } = page('Как вас зовут', 7)
  loginForm(card, {
    head: kit.LoginTitle('Как вас зовут?'),
    rows: [kit.LoginField('Имя', { value: 'Анна' }), kit.LoginField('Фамилия'), kit.LoginStatus(), kit.LoginButton('Продолжить')]
  })
}
await kit.settle()
