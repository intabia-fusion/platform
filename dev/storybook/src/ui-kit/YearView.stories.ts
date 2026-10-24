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

import YearViewExample from './month-view/YearViewExample.svelte'

const meta = {
  title: 'Dates/YearView',
  component: YearViewExample,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '**Когда:** вид «год» приложения: двенадцать месяцев сеткой, которая подстраивается под ширину. **Не этот компонент:** один месяц для выбора дня - `Calendar`; месяц с событиями в ячейках - `MonthView`.\n\nКаждый месяц - `Calendar` без стрелок и без года в заголовке (`showYear={false}`), столбцы выходных подсвечены слабым оттенком бренда (`weekends`). Занимает высоту места и прокручивается сам. `marked` - точка под номером дня, у которого что-то есть (события), `dayTooltip` - подсказка дня. Клик по дню шлёт `select`, выбранный день - `value`.'
      }
    }
  }
} satisfies Meta<YearViewExample>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}
