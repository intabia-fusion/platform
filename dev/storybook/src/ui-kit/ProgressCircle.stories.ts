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

import { ProgressCircle } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const meta = {
  title: 'Feedback/ProgressCircle',
  component: ProgressCircle,
  args: { value: 2, min: 0, max: 5, size: 'small', 'aria-label': 'Approvals' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** компактный прогресс рядом со счётчиком: подзадачи «2/5», согласования «1/3», процент загрузки файла. **Не этот компонент:** полоса расхода или распределения по ширине места - `ProgressBar`; неизвестная длительность - `Spinner`.\n\nКольцо заполняется дуга сине-фиолетовая (`--primary-bg-color`, как у легаси) по часовой стрелке от двенадцати часов, дорожка - бледный разделитель. `value` между `min` и `max` (за пределами - приводится), при нуле и пустом диапазоне дуги нет. Размеры: `small` 1rem (по умолчанию), `extra-small` 0.75rem - в строке мелкого текста. Сам счётчик пишет место рядом. `role="progressbar"` с `aria-valuenow`.'
      }
    }
  }
} satisfies Meta<ProgressCircle>

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
          title: 'Sizes',
          component: ProgressCircle,
          rows: axis('size', ['small', 'extra-small']),
          columns: [
            { title: '0/5', props: { value: 0, max: 5, 'aria-label': 'Progress' } },
            { title: '1/5', props: { value: 1, max: 5, 'aria-label': 'Progress' } },
            { title: '2/5', props: { value: 2, max: 5, 'aria-label': 'Progress' } },
            { title: '4/5', props: { value: 4, max: 5, 'aria-label': 'Progress' } },
            { title: '5/5', props: { value: 5, max: 5, 'aria-label': 'Progress' } },
            { title: '0/0', props: { value: 0, max: 0, 'aria-label': 'Progress' } }
          ]
        }
      ]
    }
  })
}
