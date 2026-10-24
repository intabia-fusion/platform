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

import MonthViewExample from './month-view/MonthViewExample.svelte'

const meta = {
  title: 'Dates/MonthView',
  component: MonthViewExample,
  args: { withEvents: true },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '**Когда:** вид «месяц» приложения (календарь, расписание): таблица целых недель на всю высоту, у каждого дня своё содержимое. **Не этот компонент:** выбрать день - `Calendar`; дата с вводом и сохранением - `DatePicker`.\n\nШапка - дни недели (`weekdayFormat`: `long` / `short` / `narrow`), прилипает при прокрутке. `weeks` строк (6 - помещается любой месяц), `rowHeight` - высота строки, без неё строки делят высоту. Номер дня - кнопка: клик шлёт `select` с началом дня, сегодня - цвет бренда, выбранный (`value`) - заливка бренда, дни соседних месяцев - третичным цветом, выходные - лёгкая заливка. Слот `day` (`let:date`, `today`, `selected`, `outside`) - содержимое под номером: события. Клавиатура: одна остановка Tab, стрелки, Home/End по неделе, PageUp/PageDown - месяц (`navigate`, `month` bindable).'
      }
    }
  }
} satisfies Meta<MonthViewExample>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const FixedRows: Story = {
  args: { props: { rowHeight: '8.5rem', weekdayFormat: 'short' }, height: '30rem' }
}

export const Empty: Story = {
  args: { withEvents: false, height: '20rem' }
}
