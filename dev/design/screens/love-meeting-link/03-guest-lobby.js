// Гостевой лобби (`GuestMeetingApp`): три состояния одной ссылки. Экран стилизован под LoginApp,
// поэтому собран на логин-ките: тёмный фон, белая карточка 460, поля и кнопки как на входе.
await kit.page('Гостевой лобби')
{
  // 1. У ссылки есть пароль: ни названия, ни времени не видно, пока пароль не введён
  {
    const { card } = kit.LoginPage('Лобби - нужен пароль', 0, 0)
    const form = kit.LoginForm(card)
    kit.add(form, kit.LoginTitle('Встреча защищена паролем', { subtitle: 'Введите пароль, который дал организатор' }))
    kit.add(form, kit.spacer(396, 8))
    kit.add(form, kit.LoginField('Пароль', { password: true }))
    kit.add(form, kit.LoginStatus('Неверный пароль'))
    kit.add(form, kit.LoginButton('Продолжить'))
    kit.add(form, kit.spacer(396, 8))
    kit.add(form, kit.text('10 неверных попыток закрывают вход на 15 минут', { size: 12, lh: 1.3, color: '#9CA3AF', w: 396 }))
  }

  // 2. Сессии нет: встреча впереди, ссылка постоянная - можно вернуться в любом вхождении
  {
    const { card } = kit.LoginPage('Лобби - ждём начала', 1980, 0)
    const form = kit.LoginForm(card)
    kit.add(form, kit.LoginTitle(LINK_MEETING.title, { subtitle: LINK_MEETING.when }))
    kit.add(form, kit.spacer(396, 8))
    kit.add(form, kit.Notice('Встреча ещё не началась. Ссылка постоянная - заходите к началу или ждите хоста', 'info', { w: 396 }))
    kit.add(form, kit.spacer(396, 8))
    kit.add(form, kit.LoginField('Имя'))
    kit.add(form, kit.LoginField('Фамилия'))
    kit.add(form, kit.LoginStatus())
    kit.add(form, kit.LoginButton('Войти в комнату'))
  }

  // 3. Сессия идёт: гость сразу попадает в комнату
  {
    const { card } = kit.LoginPage('Лобби - встреча идёт', 2 * 1980, 0)
    const form = kit.LoginForm(card)
    kit.add(form, kit.LoginTitle(LINK_MEETING.title, { subtitle: 'Идёт сейчас · началась в 10:00' }))
    kit.add(form, kit.spacer(396, 8))
    kit.add(form, kit.row('in-room', 8, [kit.Avatar('АЗ', 'Blueberry', 24), kit.text('В комнате: Андрей Зайцев', { size: 14, lh: 1.3, color: '#333333' })]))
    kit.add(form, kit.spacer(396, 8))
    kit.add(form, kit.LoginField('Имя'))
    kit.add(form, kit.LoginField('Фамилия'))
    kit.add(form, kit.LoginStatus())
    kit.add(form, kit.LoginButton('Присоединиться'))
  }

  return []
}
await kit.settle()
