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
import { Checkbox } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['primary', 'brand', 'positive', 'negative', 'neutral'] as const
const sizes = ['medium', 'small'] as const

const label = getEmbeddedLabel('Show archived')

const states = [
  { title: 'off', props: {} },
  { title: 'on', props: { checked: true } },
  { title: 'indeterminate', props: { checked: true, indeterminate: true } },
  { title: 'readonly on', props: { readonly: true, checked: true } },
  { title: 'disabled', props: { disabled: true } },
  { title: 'disabled on', props: { disabled: true, checked: true } },
  { title: 'error', props: { error: true } }
]

const meta = {
  title: 'Inputs/Checkbox',
  component: Checkbox,
  args: { label, checked: true, kind: 'primary', size: 'medium' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** включить или выключить одну опцию в форме или фильтре, отметить строки таблицы, задачу или верный ответ; несколько флажков - независимый выбор. **Не этот компонент:** настройка, которая действует сразу, - `Toggle`; один вариант из нескольких - `Radio` / `RadioGroup`; режим вида из 2-5 - `SegmentedControl`.\n\nНативный `input type="checkbox"` в `label`. `on:change` - новое состояние (`boolean`), `bind:checked` работает. `indeterminate` - частичный выбор (шапка таблицы): прочерк, клик снимает его и переключает `checked`. `readonly` - состояние видно как есть, без бледности, но не меняется; `disabled` - бледная рамка и отметка без заливки. Рамка невыбранного - цвета вида, как в легаси (выключенный - серая, ошибка - красная). Вид `kind`: `primary` (акцент, по умолчанию), `brand` (бренд-цвет: выбор в формах, задачи, отметки в меню), `positive` (сделано, верный ответ), `negative` (неверный ответ), `neutral` (серая рамка без заливки и подложка на ховер: отметить прочитанным в инбоксе); `color` - свой цвет рамки и заливки (приоритет задачи). `shape="round"` - круг: задача, которую отмечают выполненной. Без подписи нужен `aria-label` или `aria-labelledby`. `decorative` - только квадрат без input: отметка в строке меню, которая переключается сама. Клик не уходит в строку вокруг, если не `stopPropagation={false}`.'
      }
    }
  }
} satisfies Meta<Checkbox>

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
          title: 'States',
          component: Checkbox,
          rows: axis('kind', kinds),
          columns: states,
          props: { 'aria-label': 'Select' }
        },
        {
          title: 'Sizes and shapes',
          component: Checkbox,
          rows: axis('size', sizes),
          columns: [
            { title: 'off', props: {} },
            { title: 'on', props: { checked: true } },
            { title: 'round', props: { shape: 'round' } },
            { title: 'round on', props: { shape: 'round', checked: true } },
            { title: 'round brand', props: { shape: 'round', kind: 'brand' } },
            { title: 'round brand on', props: { shape: 'round', kind: 'brand', checked: true } },
            { title: 'round color', props: { shape: 'round', color: 'var(--global-urgent-PriorityColor)' } },
            { title: 'round positive on', props: { shape: 'round', kind: 'positive', checked: true } },
            { title: 'round neutral', props: { shape: 'round', kind: 'neutral', checked: false } }
          ],
          props: { 'aria-label': 'Select' }
        },
        {
          title: 'With label',
          component: Checkbox,
          rows: axis('size', sizes),
          columns: [
            { title: 'off', props: {} },
            { title: 'on', props: { checked: true } },
            { title: 'readonly on', props: { readonly: true, checked: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { label }
        },
        {
          title: 'Decorative (inside a menu item)',
          component: Checkbox,
          rows: axis('size', sizes),
          columns: [
            { title: 'off', props: {} },
            { title: 'on', props: { checked: true } },
            { title: 'indeterminate', props: { indeterminate: true } },
            { title: 'disabled on', props: { checked: true, disabled: true } }
          ],
          props: { decorative: true }
        }
      ]
    }
  })
}
