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

import { DateInput } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const value = new Date(2026, 9, 24, 9, 30).getTime()
const kinds = ['secondary', 'ghost'] as const
const sizes = ['large', 'medium', 'small', 'extra-small'] as const

const meta = {
  title: 'Dates/DateInput',
  component: DateInput,
  args: { value, kind: 'secondary', size: 'small', clearable: false, disabled: false, 'aria-label': 'Date' },
  argTypes: {
    // An enum: docgen gives it no options.
    mode: { control: 'select', options: ['date', 'datetime', 'time', 'timeonly'] }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** дату или время набирают с клавиатуры: поле ввода в `DatePicker`, время начала и конца события, часы доступности в расписании. **Не этот компонент:** выбор мышью по сетке - `Calendar`; дата на кнопке с попапом - `DateSelect`; число - `NumberInput`.\n\nЧасти - `spinbutton` (`DD.MM.YYYY`, с `datetime` ещё `HH:MM`, `time` / `timeonly` - только время дня `value`). Цифры набираются по частям, заполненная часть передаёт фокус следующей; лишняя цифра не нужна, если вторая уже не помещается (`4` в дне). ↑/↓ - шаг по кругу внутри части, ←/→ - соседняя часть, Backspace - очистить часть (`change` с `null`), Enter - `submit`. `change` приходит на каждое полное значение, не на каждую цифру. `secondary` - поле с заливкой и кольцом фокуса (и по клику), `ghost` - только цифры, подложка при наведении и в фокусе (строка редактора события). Высоты, шрифт и отступ текста от края - как у `TextInput` того же размера. `clearable` - кнопка очистки.'
      }
    }
  }
} satisfies Meta<DateInput>

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
          title: 'Modes',
          component: DateInput,
          rows: axis('kind', kinds),
          columns: [
            { title: 'date', props: { value } },
            { title: 'date and time', props: { value, mode: 'datetime' } },
            { title: 'time', props: { value, mode: 'time' } },
            { title: 'empty', props: { value: null } },
            { title: 'empty with time', props: { value: null, mode: 'datetime' } }
          ],
          props: { 'aria-label': 'Date' }
        },
        {
          title: 'Sizes',
          component: DateInput,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { value, mode: 'datetime', 'aria-label': 'Date' }
        },
        {
          title: 'States',
          component: DateInput,
          rows: axis('kind', kinds),
          columns: [
            { title: 'clearable', props: { clearable: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { value, 'aria-label': 'Date' }
        }
      ]
    }
  })
}
