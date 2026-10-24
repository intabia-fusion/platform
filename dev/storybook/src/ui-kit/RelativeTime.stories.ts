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

import { RelativeTime } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// The text is relative to now: the stories take fixed offsets from the moment they open.
const now = Date.now()

const meta = {
  title: 'Dates/RelativeTime',
  component: RelativeTime,
  args: { value: now - 5 * MINUTE, format: 'ago', exact: false },
  argTypes: {
    format: { control: 'inline-radio', options: ['ago', 'countdown', 'offset'] }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** время относительно сейчас или события текстом строки: «5 минут назад» у версии и ответа (`ago`), таймер «повторить через 0:59» (`countdown`), «за 15 минут» у напоминания (`offset`). **Не этот компонент:** дата и время как они есть - `DateLabel`; длительность задачи - `formatDuration`.\n\n`ago` - `<time>` с полной датой во всплывающей подсказке, обновляется раз в 10 с; `countdown` - `<time role="timer">`, раз в секунду: `MM:SS`, `H:MM:SS`, с суток - «N дней»; по истечении текст пропадает и приходит `timeout`; новый `value` перезапускает отсчёт. `offset` - `value` - сдвиг в мс от события: положительный «через N», отрицательный «за N»; `exact` - `1d 2h 30m`. Шрифт и цвет - места.'
      }
    }
  }
} satisfies Meta<RelativeTime>

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
          title: 'ago',
          component: RelativeTime,
          rows: [{ title: 'ago', props: { format: 'ago' } }],
          columns: [
            { title: 'now', props: { value: now } },
            { title: '5 minutes', props: { value: now - 5 * MINUTE } },
            { title: '3 hours', props: { value: now - 3 * HOUR } },
            { title: '1 day', props: { value: now - DAY } },
            { title: '2 months', props: { value: now - 62 * DAY } },
            { title: '2 years', props: { value: now - 800 * DAY } }
          ]
        },
        {
          title: 'countdown',
          component: RelativeTime,
          rows: [{ title: 'countdown', props: { format: 'countdown' } }],
          columns: [
            { title: 'a minute', props: { value: now + 59 * 1000 } },
            { title: 'an hour', props: { value: now + HOUR + 5 * MINUTE } },
            { title: 'days', props: { value: now + 3 * DAY + HOUR } },
            { title: 'over', props: { value: now - 1000 } }
          ]
        },
        {
          title: 'offset',
          component: RelativeTime,
          rows: [
            { title: 'largest unit', props: { format: 'offset' } },
            { title: 'exact', props: { format: 'offset', exact: true } }
          ],
          columns: [
            { title: '-15 minutes', props: { value: -15 * MINUTE } },
            { title: '-1 day', props: { value: -DAY } },
            { title: '+30 minutes', props: { value: 30 * MINUTE } },
            { title: '+4 hours', props: { value: 4 * HOUR } },
            { title: '+1d 2h 30m', props: { value: DAY + 2 * HOUR + 30 * MINUTE } }
          ]
        }
      ]
    }
  })
}
