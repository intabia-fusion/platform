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

import { Severity, Status, getEmbeddedLabel } from '@hcengineering/platform'
import { StatusMessage } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import StatusMessageExample from './status-message/StatusMessageExample.svelte'

const code = getEmbeddedLabel('Account with this email already exists')
const long = getEmbeddedLabel(
  'The document could not be signed: the password does not match the account, check it and try again'
)

const meta = {
  title: 'Feedback/StatusMessage',
  component: StatusMessage,
  args: { status: new Status(Severity.ERROR, code, {}), wrap: false },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** результат действия строкой текста со значком: ошибка под формой диалога создания, проверки пароля, подтверждения почты. **Не этот компонент:** всплывающее уведомление - `Toast`; состояние одним значком - `StatusIcon`; состояние словом на подложке - `Chip`.\n\n`status` - `Status` платформы: текст - его `code` с `params` (и переведёнными `notLocalizedParams`), тон - по `severity`: `ERROR` - красный текст (`role="alert"`), `WARNING` и `INFO` - основной цвет текста, тон несёт значок (оранжевый / акцент, `role="status"`); `OK` ничего не рисует. Значок - `StatusIcon` того же тона. По умолчанию одна строка с многоточием, `wrap` - длинный текст переносится.'
      }
    }
  }
} satisfies Meta<StatusMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Variants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        {
          title: 'Severity',
          component: StatusMessage,
          rows: [
            { title: 'one line', props: {} },
            { title: 'wrap', props: { wrap: true } }
          ],
          columns: [
            { title: 'ERROR', props: { status: new Status(Severity.ERROR, code, {}) } },
            { title: 'WARNING', props: { status: new Status(Severity.WARNING, code, {}) } },
            { title: 'INFO', props: { status: new Status(Severity.INFO, code, {}) } },
            { title: 'OK (nothing)', props: { status: new Status(Severity.OK, code, {}) } }
          ]
        },
        {
          title: 'Long text in a 20rem place',
          component: StatusMessageExample,
          rows: [
            { title: 'one line', props: {} },
            { title: 'wrap', props: { wrap: true } }
          ],
          columns: [{ title: 'ERROR', props: { status: new Status(Severity.ERROR, long, {}) } }]
        }
      ]
    }
  })
}
