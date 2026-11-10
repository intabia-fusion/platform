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
import ProfileCabinet from './ProfileCabinet.svelte'

const meta = {
  title: 'FUSIO-1620/Глобальный профиль',
  id: 'fusio-1620-profile',
  component: ProfileCabinet,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'Локальная демонстрация кабинета. Изменения существуют только в памяти компонента. API, реальные пространства и сессии не используются. Имя пользователя доступно только для чтения, требования к его редактированию не согласованы.' } }
  },
  args: { initialSection: 'profile', initialState: 'default' },
  argTypes: {
    initialSection: { control: 'select', options: ['profile', 'workspaces'] },
    initialState: { control: 'select', options: ['default', 'editing', 'loading', 'error', 'empty', 'save-error', 'invite-error'] }
  }
} satisfies Meta<ProfileCabinet>

export default meta
type Story = StoryObj<typeof meta>

export const Profile: Story = { name: 'Профиль' }
export const Editing: Story = {
  name: 'Редактирование',
  args: { initialState: 'editing' },
  play: async ({ canvasElement }) => {
    const first = canvasElement.querySelector<HTMLInputElement>('#profile-first')
    if (first == null) throw new Error('Не показана форма редактирования')
    first.value = 'Изменённое имя'
    first.dispatchEvent(new Event('input', { bubbles: true }))
    const checkbox = canvasElement.querySelector<HTMLInputElement>('input[type="checkbox"]')
    checkbox?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const cancel = Array.from(canvasElement.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Отмена')
    cancel?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (canvasElement.querySelector('.public-card h2')?.textContent !== 'Анна Смирнова') throw new Error('Отмена изменила имя')
    if (canvasElement.querySelector('.badge')?.textContent !== 'Публичный') throw new Error('Отмена изменила публичность')
    const edit = Array.from(canvasElement.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Редактировать')
    edit?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (canvasElement.querySelector('#profile-first') == null) throw new Error('Не восстановлена форма редактирования')
  }
}
export const SaveError: Story = {
  name: 'Ошибка сохранения',
  args: { initialState: 'save-error' },
  parameters: { docs: { description: { story: 'Первое сохранение показывает ошибку, повторное сохраняет локально. Форма сохраняет введённые значения.' } } }
}
export const Workspaces: Story = { name: 'Пространства', args: { initialSection: 'workspaces' } }
export const Empty: Story = {
  name: 'Нет пространств',
  args: { initialSection: 'workspaces', initialState: 'empty' },
  play: ({ canvasElement }) => {
    const invite = Array.from(canvasElement.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Создать приглашение')
    if (invite !== undefined) throw new Error('Без пространства нельзя создавать приглашение')
  }
}
export const InviteError: Story = {
  name: 'Ошибка приглашения',
  args: { initialSection: 'workspaces', initialState: 'invite-error' },
  parameters: { docs: { description: { story: 'Первое принятие приглашения завершается ошибкой. Повторная попытка добавляет Research только в локальный список.' } } }
}
export const Loading: Story = { name: 'Загрузка', args: { initialState: 'loading' } }
export const LoadError: Story = { name: 'Ошибка загрузки', args: { initialState: 'error' } }
export const Mobile: Story = {
  name: 'Телефон',
  parameters: { viewport: { defaultViewport: 'mobile1' } }
}
