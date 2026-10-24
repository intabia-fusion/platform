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

import { Calendar } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import CalendarWithLegend from './calendar/CalendarWithLegend.svelte'

const value = new Date(2026, 9, 24, 9, 30).getTime()
const start = new Date(2026, 9, 12).getTime()
const end = new Date(2026, 9, 21).getTime()
const month = new Date(2026, 9, 1).getTime()

const meta = {
  title: 'Dates/Calendar',
  component: Calendar,
  args: { value, navigation: 'both', range: false },
  argTypes: {
    navigation: { control: 'inline-radio', options: ['both', 'previous', 'next', 'none'] }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** сетка месяца прямо в разметке места - выбрать день или диапазон дней (боковая панель планировщика, свой попап). **Не этот компонент:** дата с вводом, заголовком и сохранением в попапе - `DatePicker`; дата на кнопке, которую можно поменять, - `DateSelect`; ввод даты с клавиатуры - `DateInput`.\n\nДни соседних месяцев до конца недели - бледные и некликабельные, выбранный день и концы диапазона - заливка бренда (`--button-brand-*`, у легаси был розовым), сегодня - цвет бренда, вес 500 (как у выбранного), и внутри диапазона тоже, дни внутри диапазона - светлая полоса того же цвета. Клик ставит `value` (bindable) и шлёт `select` с днём во времени `value`; с `range` клики строят диапазон (`value` - начало, `end` - конец, событие `range`). `month` (bindable) - показываемый месяц, `navigation` - какие стрелки в шапке (два месяца рядом делят их), `navigate` - новый месяц. Клавиатура: одна остановка Tab, стрелки, Home/End по неделе, PageUp/PageDown по месяцам. Слот `header` - легенда рядом с названием месяца. Отступов вокруг нет - их задаёт место.'
      }
    }
  }
} satisfies Meta<Calendar>

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
          title: 'Selection',
          component: Calendar,
          rows: [{ title: 'October 2026', props: { month } }],
          columns: [
            { title: 'day', props: { value } },
            { title: 'range', props: { range: true, value: start, end } },
            { title: 'range started', props: { range: true, value: start, end: null } },
            { title: 'nothing', props: { value: null } }
          ]
        },
        {
          title: 'Navigation',
          component: Calendar,
          rows: [{ title: 'arrows', props: { value } }],
          columns: axis('navigation', ['both', 'previous', 'next', 'none'])
        },
        {
          title: 'Header slot (planner sidebar)',
          component: CalendarWithLegend,
          rows: [{ title: 'legend', props: { value, month } }],
          columns: [{ title: '', props: {} }]
        }
      ]
    }
  })
}
