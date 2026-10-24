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
import { DatePicker } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import DatePickerVariants from './date/DatePickerVariants.svelte'

const value = new Date(2026, 9, 24, 9, 30).getTime()

const meta = {
  title: 'Dates/DatePicker',
  component: DatePicker,
  args: { value, label: getEmbeddedLabel('Set due date'), shifts: false, range: false, compact: false },
  argTypes: {
    // An enum: docgen gives it no options.
    mode: { control: 'select', options: ['date', 'datetime', 'time', 'timeonly'] }
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '**Когда:** содержимое попапа выбора даты: место открывает его через `showPopup(DatePicker, props, element, (result) => ...)` и получает результат в `close`. **Не этот компонент:** кнопка с датой, которая сама открывает попап, - `DateSelect`; сетка месяца в разметке места - `Calendar`; только ввод с клавиатуры - `DateInput`.\n\nПоверхность попапа как у `Menu`: рамка `--theme-popup-divider` и popover-тень. Полный вид - заголовок (`label`, по умолчанию «Select date») с крестиком, `detail`, поле `DateInput` (фокус при открытии), два месяца (на узком экране один), «Save» `brand`. Без времени клик по дню сразу закрывает с ним (полдень UTC дня, как хранятся даты); с `mode="datetime"` клик только ставит день (время остаётся), закрывает «Save» или Enter; `time` / `timeonly` - только поле `HH:MM` без месяцев (день `value`, без него - сегодня), сдвиги - минуты и часы. `shifts` - колонка быстрых сдвигов слева («через 15 минут», «через день»): строки-варианты на всю ширину колонки, вес 400; клик закрывает с «сейчас + сдвиг». `range` - два поля и диапазон по клику на месяцы, результат `{ value, end }` по порядку. `compact` - один месяц без шапки и кнопок, клик по дню закрывает с ним во времени `value`. Результат `close`: `{ value }` (`null` - дату очистили) или `null` - закрыли крестиком без изменений.'
      }
    }
  }
} satisfies Meta<DatePicker>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => ({ Component: DatePickerVariants })
}
