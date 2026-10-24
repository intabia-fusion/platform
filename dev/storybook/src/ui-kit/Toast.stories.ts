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

import { getEmbeddedLabel } from '@hcengineering/platform'
import { Toast } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import ToastExample from './toast/ToastExample.svelte'

const content = 'Your workspace export is ready to download.'

const meta = {
  title: 'Feedback/Toast',
  component: Toast,
  args: { title: getEmbeddedLabel('Export finished'), tone: 'success', closable: true },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** всплывающее уведомление в углу экрана: экспорт готов, ошибка интеграции или оплаты, новое сообщение, «вы остались одни во встрече». **Не этот компонент:** ошибка под формой, которую видно, пока открыт диалог, - `StatusMessage`; вопрос, без ответа на который дальше нельзя, - диалог.\n\nКарточка: значок тона, заголовок, кнопка закрытия; под ними содержимое (default slot) и кнопки (slot `actions`, прижаты к концу). Где и сколько показывать, когда убрать - решает хост уведомлений, карточка рисует только себя (без внешних отступов). `title` - `IntlString`: готовый заголовок уведомления через `getEmbeddedLabel`; slot `title` - заголовок с разметкой (ссылка на задачу). `tone`: `info`, `success`, `warning`, `error` - значок `StatusIcon` (`medium`); без `tone` значка нет. `error` и `warning` - `role="alert"`, остальные - `role="status"`. `closable` - крестик (`IconButton` кита, подпись «Close», `data-id="btnNotifyClose"` для тестов), событие `close`.'
      }
    }
  },
  // Event args (event_close) are Storybook actions, not Toast props.
  render: (args) => ({
    Component: ToastExample,
    props: {
      props: Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith('event_'))),
      content,
      withActions: true
    }
  })
} satisfies Meta<Toast>

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
          title: 'Tones',
          component: ToastExample,
          rows: axis('tone', ['info', 'success', 'warning', 'error', undefined]).map((row) => ({
            ...row,
            title: row.title === 'undefined' ? 'no tone' : row.title
          })),
          columns: [{ title: 'closable, content', props: { closable: true, content } }]
        },
        {
          title: 'Content',
          component: ToastExample,
          rows: [{ title: 'info', props: { tone: 'info', closable: true } }],
          columns: [
            { title: 'title only', props: {} },
            { title: 'content', props: { content } },
            {
              title: 'content + actions',
              props: {
                title: getEmbeddedLabel('You are the last one in the room'),
                content: 'Everybody else has left the meeting.',
                withActions: true
              }
            }
          ]
        }
      ]
    }
  })
}
