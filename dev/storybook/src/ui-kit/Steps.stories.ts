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
import { Steps } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const items = [
  { id: 'file', label: getEmbeddedLabel('Select file') },
  { id: 'statuses', label: getEmbeddedLabel('Map statuses') },
  { id: 'review', label: getEmbeddedLabel('Review') },
  { id: 'import', label: getEmbeddedLabel('Import the selected task types into the workspace') }
]

const meta = {
  title: 'Navigation/Steps',
  component: Steps,
  args: { items, selected: 'statuses', 'aria-label': 'Import steps' },
  argTypes: { selected: { control: 'inline-radio', options: items.map((item) => item.id) } },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** показать, где пользователь в пошаговом процессе: шаги до текущего пройдены (зелёная отметка), текущий обведён зелёным, следующие - серое кольцо `--global-tertiary-TextColor` (как рамка невыбранного `Checkbox`), линия к ним того же цвета. Нумерованный список `<ol>`, текущий - `aria-current="step"`; не кнопки, по шагам ходят «Назад / Далее». Стоит сбоку в `WizardDialog`. **Не этот компонент:** переключение разделов - `Tabs`; выбор режима - `SegmentedControl`.'
      }
    }
  }
} satisfies Meta<Steps>

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
          title: 'Progress',
          component: Steps,
          rows: [
            { title: 'none current', props: {} },
            ...axis(
              'selected',
              items.map((item) => item.id)
            )
          ],
          columns: [{ title: 'steps', props: {} }],
          props: { items }
        }
      ]
    }
  })
}
