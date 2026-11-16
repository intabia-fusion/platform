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
import registerLoginStrings from '../../../../plugins/login-assets/src/lang'
import RegistrationDetails from '../../../../plugins/login-resources/src/components/RegistrationDetails.svelte'

registerLoginStrings()

const meta = {
  id: 'fusio-1620-registration-details',
  title: 'Вход и регистрация/Данные регистрации',
  component: RegistrationDetails,
  args: { saveName: async () => true, saveWorkspace: async () => true }
} satisfies Meta<RegistrationDetails>

export default meta
type Story = StoryObj<typeof meta>

export const Name: Story = { name: 'Имя', args: { initialStep: 'name' } }
export const InvitedName: Story = {
  name: 'Имя по приглашению',
  args: { invited: true, initialStep: 'name', invitationWorkspace: 'Fusion', invitationInviter: 'Anna Smith' },
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const text = canvasElement.textContent ?? ''
    if (!text.includes('Anna Smith') || !text.includes('Fusion')) {
      throw new Error('Контекст приглашения должен сохраняться на шаге имени.')
    }
  }
}
export const RestoredWorkspace: Story = {
  name: 'Восстановление пространства',
  args: { initialStep: 'workspace', initialWorkspace: 'anna Личное пространство' },
  play: ({ canvasElement }) => {
    const workspace = canvasElement.querySelector<HTMLInputElement>('input[name="workspace"]')
    if (workspace?.value !== 'anna Личное пространство') throw new Error('Название пространства не восстановлено.')
    if (workspace.labels?.length !== 1) throw new Error('У поля пространства должна быть подпись.')
  }
}
export const SaveFailed: Story = {
  name: 'Ошибка сохранения имени',
  args: { initialStep: 'name', saveName: async () => false },
  play: async ({ canvasElement }) => {
    const first = canvasElement.querySelector<HTMLInputElement>('input[name="given-name"]')
    const last = canvasElement.querySelector<HTMLInputElement>('input[name="family-name"]')
    if (first === null || last === null) throw new Error('Не найдены поля имени и фамилии.')
    first.value = 'Анна'
    first.dispatchEvent(new Event('input', { bubbles: true }))
    last.value = 'Смирнова'
    last.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 100))
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (canvasElement.querySelector('input[name="workspace"]') !== null) {
      throw new Error('Переход при ошибке сохранения запрещён.')
    }
  }
}
export const Prefill: Story = {
  name: 'Проверка заполнения пространства',
  args: { initialWorkspace: 'anna Личное пространство' },
  play: async ({ canvasElement }) => {
    const workspace = canvasElement.querySelector<HTMLInputElement>('input[name="workspace"]')
    if (workspace?.value !== 'anna Личное пространство') throw new Error('Название пространства не заполнено.')
    workspace.value = 'Другая компания'
    workspace.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (workspace.value !== 'Другая компания') throw new Error('Название пространства должно редактироваться.')
  }
}
