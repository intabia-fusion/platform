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
import { DateLabel, DateSelect } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const value = new Date(2026, 9, 24, 9, 30).getTime()
const lastYear = new Date(2025, 2, 3, 18, 5).getTime()
const kinds = ['secondary', 'ghost'] as const
const sizes = ['large', 'medium', 'small', 'extra-small'] as const
const states = [
  { title: 'date', props: { value } },
  { title: 'other year', props: { value: lastYear } },
  { title: 'date and time', props: { value, mode: 'datetime' } },
  { title: 'time', props: { value, mode: 'timeonly' } },
  { title: 'time (attribute)', props: { value, mode: 'time' } },
  { title: 'empty', props: { value: null, placeholder: getEmbeddedLabel('Due date') } }
]
const tones = [
  { title: 'normal', props: {} },
  { title: 'warning', props: { tone: 'warning' } },
  { title: 'critical', props: { tone: 'critical' } },
  { title: 'overdue', props: { tone: 'overdue' } }
]

const inDays = (days: number): number => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.getTime()
}
const dueDates = [
  { title: 'later', props: { value: inDays(30) } },
  { title: 'soon', props: { value: inDays(3) } },
  { title: 'today', props: { value: inDays(0) } },
  { title: 'overdue', props: { value: inDays(-3) } },
  { title: 'closed task', props: { value: inDays(-3), ignoreOverdue: true } }
]

const meta = {
  title: 'Dates/Date',
  component: DateSelect,
  args: { value, kind: 'secondary', size: 'small' },
  argTypes: {
    // An enum: docgen gives it no options.
    mode: {
      control: 'select',
      options: ['date', 'datetime', 'time', 'timeonly']
    }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** дата у задачи, события, атрибута. `DateSelect` - дату можно поменять: кнопка `SelectButton` с датой, клик открывает попап выбора; `DateLabel` - дату только показывают: текст строки с иконкой календаря, не кнопка (таблицы, списки, карточки). **Не этот компонент:** попап выбора как содержимое своего `showPopup` - `DatePicker`; сетка месяца в разметке - `Calendar`; ввод с клавиатуры - `DateInput`; «5 минут назад» - `RelativeTime`.\n\n`value` - timestamp, `null` / `undefined` - даты нет (`placeholder`, по умолчанию «Нет даты»). `mode`: `date` (по умолчанию), `datetime` - дата и `HH:MM`, `time` / `timeonly` - только `HH:MM`; год показывается только не текущий. Попап `DateSelect`: с датой - календарь (`datetime` - и время), в режимах `time` / `timeonly` - только поле времени без месяцев; `shifts` - быстрые сдвиги (по умолчанию включены), `popupLabel` / `popupDetail` - заголовок и подсказка. `on:change` - новый timestamp или `null`, `bind:value` работает. `readonly` - тот же вид без попапа, значение не бледнеет. `tone` - цвет иконки (`warning`, `critical`, `overdue` - перечёркнутая); `due` - тон по близости срока и подсказка «через / просрочено на N дней», `ignoreOverdue` - задача закрыта.'
      }
    }
  }
} satisfies Meta<DateSelect>

export default meta
type Story = StoryObj<typeof meta>

/** DateSelect: the click opens the date popup. */
export const Playground: Story = {}

export const Variants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        { title: 'DateSelect', component: DateSelect, rows: axis('kind', kinds), columns: states },
        {
          title: 'DateSelect sizes',
          component: DateSelect,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { value }
        },
        {
          title: 'DateSelect tone',
          component: DateSelect,
          rows: axis('kind', kinds),
          columns: tones,
          props: { value }
        },
        {
          title: 'DateSelect readonly and disabled',
          component: DateSelect,
          rows: axis('kind', kinds),
          columns: [
            { title: 'readonly', props: { readonly: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { value }
        },
        {
          title: 'DateSelect popup (click): quick shifts',
          component: DateSelect,
          rows: axis('kind', kinds),
          columns: [
            { title: 'shifts (default)', props: {} },
            { title: 'no shifts', props: { shifts: false } }
          ],
          props: { value, mode: 'datetime' }
        },
        {
          title: 'DateSelect popup (click): only the time',
          component: DateSelect,
          rows: axis('kind', kinds),
          columns: [
            { title: 'timeonly', props: { value, mode: 'timeonly' } },
            { title: 'time (attribute), no shifts', props: { value, mode: 'time', shifts: false } },
            { title: 'empty', props: { value: null, mode: 'timeonly', placeholder: getEmbeddedLabel('Time') } }
          ]
        },
        {
          title: 'DateLabel',
          component: DateLabel,
          rows: [
            { title: 'with icon', props: {} },
            { title: 'no icon', props: { showIcon: false } }
          ],
          columns: states
        },
        {
          title: 'due (hover: days left or overdue)',
          component: DateSelect,
          rows: axis('kind', kinds),
          columns: dueDates,
          props: { due: true }
        },
        {
          title: 'DateLabel due',
          component: DateLabel,
          rows: [{ title: 'due', props: {} }],
          columns: dueDates,
          props: { due: true }
        },
        {
          title: 'DateLabel tone',
          component: DateLabel,
          rows: [{ title: 'date', props: {} }],
          columns: tones,
          props: { value }
        }
      ]
    }
  })
}
