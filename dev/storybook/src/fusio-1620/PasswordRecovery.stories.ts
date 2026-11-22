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
import PasswordRecovery from './PasswordRecovery.svelte'

registerLoginStrings()

const meta = {
  id: 'fusio-1620-password-recovery',
  title: 'Вход и регистрация/Восстановление пароля',
  component: PasswordRecovery,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'Действующие формы в демонстрационной оболочке. Запросы не отправляются.' } }
  }
} satisfies Meta<PasswordRecovery>

export default meta
type Story = StoryObj<typeof meta>

export const Request: Story = { name: 'Запрос ссылки', args: { step: 'request' } }
export const Restore: Story = { name: 'Новый пароль', args: { step: 'restore' } }
