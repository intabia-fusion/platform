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
import { Radio, RadioGroup } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['primary', 'brand', 'positive', 'negative'] as const
const sizes = ['medium', 'small'] as const

const items = [
  { value: 'full', label: getEmbeddedLabel('Full rights') },
  { value: 'readonly', label: getEmbeddedLabel('Read only') },
  { value: 'none', label: getEmbeddedLabel('No access'), disabled: true }
]

const states = [
  { title: 'off', props: {} },
  { title: 'on', props: { group: 'a' } },
  { title: 'readonly on', props: { group: 'a', readonly: true } },
  { title: 'disabled', props: { disabled: true } },
  { title: 'disabled on', props: { group: 'a', disabled: true } },
  { title: 'error', props: { error: true } }
]

const meta = {
  title: 'Inputs/Radio',
  component: RadioGroup,
  args: { items, selected: 'full', size: 'medium', kind: 'primary', 'aria-label': 'Access' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** выбрать один вариант из нескольких взаимоисключающих в форме, когда все варианты видны сразу (права ключа, окончание повтора, ответ теста). **Не этот компонент:** режим или вид того же содержимого - `SegmentedControl`; длинный список - `Dropdown`; независимые опции - `Checkbox`.\n\nНативные `input type="radio"`. `RadioGroup` - вертикальный список пунктов `items` (`value`, `label`, `disabled`) с `role="radiogroup"` и общим `name`: стрелки переключают пункты нативно; `bind:selected` и `on:change` (значение пункта). `Radio` - один пункт, когда рядом с ним своя разметка (поле, дата, карточка шаблона): `value`, `group` (`bind:group`), общий `name` для набора, `on:change` - его значение, когда он выбран. `readonly` - выбор виден как есть, без бледности, но не меняется. Вид `kind`: `primary` (по умолчанию), `brand` (бренд-цвет, как у флажков форм), `positive` (верный ответ), `negative` (неверный); рамка невыбранного - цвета вида, как у `Checkbox` (выключенный - серая, ошибка - красная). Клик не уходит в строку вокруг, если не `stopPropagation={false}`. Без подписи нужен `aria-label` или `aria-labelledby`.'
      }
    }
  }
} satisfies Meta<RadioGroup>

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
          component: Radio,
          rows: axis('kind', kinds),
          columns: states,
          props: { value: 'a', group: null, 'aria-label': 'Option' }
        },
        {
          title: 'Sizes with label',
          component: Radio,
          rows: axis('size', sizes),
          columns: [
            { title: 'off', props: {} },
            { title: 'on', props: { group: 'a' } },
            { title: 'readonly on', props: { group: 'a', readonly: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { value: 'a', group: null, label: getEmbeddedLabel('Each month') }
        },
        {
          title: 'RadioGroup',
          component: RadioGroup,
          rows: axis('size', sizes),
          columns: [
            { title: 'default', props: {} },
            { title: 'readonly', props: { readonly: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { items, selected: 'full', 'aria-label': 'Access' }
        }
      ]
    }
  })
}
