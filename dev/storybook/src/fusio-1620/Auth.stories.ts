//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import type { Meta, StoryObj } from '@storybook/svelte'
import AuthFlow from './AuthFlow.svelte'
import { demoInvitation } from './demo'

const meta = {
  id: 'fusio-1620-auth',
  title: 'FUSIO-1620/Вход и регистрация',
  component: AuthFlow,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Локальный прототип без API и писем. Код подтверждения: 482913. Токен приглашения (inviteId): 162020261110. Ожидание повторной отправки и срок кода - 60 секунд. Пять неверных кодов блокируют повторные попытки на час. Согласия сохраняются при возврате между этапами текущего сценария.'
      }
    }
  },
  argTypes: {
    initialStep: { control: 'select', options: ['email', 'otp', 'workspace', 'name', 'done'] },
    initialState: { control: 'select', options: ['default', 'invalid', 'expired', 'rate-limit', 'locked', 'sending', 'resend'] },
    returning: { control: 'boolean', description: 'После подтверждения кода открывается личный кабинет без повторного ввода имени.' },
    initialEmail: { control: 'text' },
    initialInvitation: { control: 'text' },
    invitedWorkspace: { control: 'text' },
    invitedBy: { control: 'text' }
  },
  args: { initialStep: 'email', initialState: 'default', returning: false, initialEmail: '' }
} satisfies Meta<AuthFlow>

export default meta
type Story = StoryObj<typeof meta>

export const Email: Story = {
  name: '01 Почта',
  play: ({ canvasElement }) => {
    const email = canvasElement.querySelector('input[type="email"]')
    const consents = canvasElement.querySelectorAll('input[type="checkbox"]')
    if (email === null || consents.length !== 2) throw new Error('Нужны email и два обязательных согласия.')
    if (canvasElement.querySelector('input[type="password"]') !== null) throw new Error('На первом этапе пароль не запрашивается.')
  }
}
export const FilledEmail: Story = { name: '02 Заполненная почта', args: { initialEmail: 'anna.smirnova@intabia.io' } }
export const InvalidEmail: Story = { name: '03 Ошибка почты', args: { initialEmail: 'anna@', initialState: 'invalid' } }
export const Sending: Story = { name: '04 Отправка кода', args: { initialEmail: 'anna.smirnova@intabia.io', initialState: 'sending' } }
export const Otp: Story = {
  name: '05 Код из письма',
  args: { initialStep: 'otp', initialEmail: 'anna.smirnova@intabia.io' },
  play: ({ canvasElement }) => {
    const cells = canvasElement.querySelectorAll('input[autocomplete="one-time-code"], input[autocomplete="off"]')
    if (cells.length !== 6) throw new Error('Код должен вводиться в шесть настоящих полей.')
    const resend = [...canvasElement.querySelectorAll('button')].find((button) => button.textContent?.includes('Отправить код повторно'))
    if (resend?.disabled !== true) throw new Error('Повторная отправка должна ожидать завершения таймера.')
  }
}
export const InvalidOtp: Story = {
  name: '06 Неверный код',
  args: { ...Otp.args, initialState: 'invalid' },
  play: ({ canvasElement }) => {
    if (canvasElement.querySelector('[role="alert"]')?.textContent?.includes('Неверный код') !== true) throw new Error('Ошибка кода должна быть доступна для чтения.')
    if (canvasElement.querySelectorAll('input[aria-invalid="true"]').length !== 6) throw new Error('Все поля кода должны обозначать ошибку.')
  }
}
export const ExpiredOtp: Story = { name: '07 Истекший код', args: { ...Otp.args, initialState: 'expired' } }
export const ResendOtp: Story = { name: '08 Повторная отправка доступна', args: { ...Otp.args, initialState: 'resend' } }
export const RateLimited: Story = {
  name: '09 HTTP 429',
  args: { ...Otp.args, initialState: 'rate-limit' },
  play: ({ canvasElement }) => {
    const cells = canvasElement.querySelectorAll<HTMLInputElement>('input')
    if (cells.length !== 6 || [...cells].some((cell) => !cell.disabled)) throw new Error('HTTP 429 блокирует ввод и проверку кода до следующей попытки.')
  }
}
export const LockedOtp: Story = { name: '10 TooManyOtpAttempts', args: { ...Otp.args, initialState: 'locked' } }
export const EmailRateLimited: Story = { name: '11 Ограничение отправки', args: { initialState: 'rate-limit', initialEmail: 'anna.smirnova@intabia.io' } }
export const Workspace: Story = {
  name: '12 Создание пространства',
  args: { initialStep: 'workspace' },
  play: ({ canvasElement }) => {
    if (canvasElement.querySelector('#auth-workspace') === null) throw new Error('Нужно поле названия пространства.')
    if (canvasElement.querySelector('#auth-invitation') !== null) throw new Error('Обычная регистрация не запрашивает токен приглашения.')
    if (canvasElement.querySelectorAll('form').length !== 1) throw new Error('Должна оставаться только форма создания пространства.')
  }
}
export const Name: Story = { name: '13 Имя и фамилия', args: { initialStep: 'name' } }
export const Done: Story = { name: '14 Регистрация завершена', args: { initialStep: 'done' } }
export const Returning: Story = { name: '15 Повторный вход', args: { returning: true, initialEmail: 'anna.smirnova@intabia.io' } }
export const ReturningOtp: Story = { name: '16 Код повторного входа', args: { ...Otp.args, returning: true } }
export const Mobile: Story = {
  name: '17 Узкий экран',
  parameters: { viewport: { viewports: { phone: { name: '390 px', styles: { width: '390px', height: '844px' } } }, defaultViewport: 'phone' } }
}

export const InvitedEmail: Story = {
  name: '18 Приглашение: почта',
  args: { initialInvitation: demoInvitation.token, invitedBy: demoInvitation.invitedBy, invitedWorkspace: demoInvitation.workspace },
  play: ({ canvasElement }) => {
    const context = canvasElement.querySelector('[data-testid="invitation-context"]')?.textContent ?? ''
    if (!context.includes(demoInvitation.invitedBy) || !context.includes(demoInvitation.workspace)) throw new Error('Нужно показать отправителя и пространство приглашения.')
    if (canvasElement.querySelector('input[type="email"]') === null) throw new Error('Приглашение начинается с подтверждения почты.')
  }
}
export const InvitedOtp: Story = { name: '19 Приглашение: код', args: { ...InvitedEmail.args, ...Otp.args } }
export const InvitedName: Story = {
  name: '20 Приглашение: имя и фамилия',
  args: { ...InvitedEmail.args, initialStep: 'name' },
  play: ({ canvasElement }) => {
    if (canvasElement.querySelector('#auth-first-name') === null || canvasElement.querySelector('#auth-last-name') === null) throw new Error('Нужны имя и фамилия приглашенного пользователя.')
    if (canvasElement.querySelector('#auth-workspace') !== null) throw new Error('Приглашенный пользователь не создает пространство.')
    if (canvasElement.querySelector('[data-testid="invitation-context"]') === null) throw new Error('Контекст приглашения сохраняется при вводе имени.')
  }
}
export const InvalidInvitation: Story = {
  name: '21 Недействительное приглашение',
  args: { ...InvitedEmail.args, initialInvitation: 'invalid-invite', initialStep: 'workspace' },
  play: ({ canvasElement }) => {
    if (canvasElement.querySelector('[role="alert"]')?.textContent?.includes('Приглашение не найдено') !== true) throw new Error('Нужно сообщить об ошибке приглашения.')
    if (canvasElement.querySelector('form') !== null) throw new Error('Недействительное приглашение не допускает обход через обычную регистрацию.')
  }
}
