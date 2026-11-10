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

import Scenario from './Scenario.svelte'
import { demoInvitation } from './demo'

const meta = {
  id: 'fusio-1620-scenario',
  title: 'FUSIO-1620/Сценарии',
  component: Scenario,
  tags: ['screen', '!autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Интерактивный прототип на локальных данных. Обычная регистрация создаёт пространство; регистрация по ссылке показывает пригласившего и пространство, затем присоединяет к нему. Письма и запросы аккаунтов не отправляются. Код: 482913.'
      }
    }
  },
  args: { returning: false }
} satisfies Meta<Scenario>

export default meta
type Story = StoryObj<typeof meta>

export const Registration: Story = { name: 'Регистрация до профиля' }
export const Returning: Story = { name: 'Повторный вход до профиля', args: { returning: true } }
export const Invitation: Story = {
  name: 'Регистрация по приглашению',
  args: { inviteId: demoInvitation.token, invitedWorkspace: demoInvitation.workspace, invitedBy: demoInvitation.invitedBy }
}
export const ReturningInvitation: Story = {
  name: 'Вход по приглашению',
  args: { ...Invitation.args, returning: true }
}
