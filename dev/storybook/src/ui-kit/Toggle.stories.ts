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
import { Toggle } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const sizes = ['large', 'medium', 'small', 'extra-small'] as const

const label = getEmbeddedLabel('Make private')
const description = getEmbeddedLabel('Only members can see it')

const states = [
  { title: 'off', props: {} },
  { title: 'on', props: { checked: true } },
  { title: 'disabled', props: { disabled: true } },
  { title: 'disabled on', props: { disabled: true, checked: true } },
  { title: 'readonly on', props: { readonly: true, checked: true } }
]

const meta = {
  title: 'Inputs/Toggle',
  component: Toggle,
  args: { label, checked: true, size: 'medium' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** настройка вкл / выкл, которая действует сразу, без кнопки «Сохранить» (уведомления, приватность, видимость атрибута). **Не этот компонент:** опция в форме, которая применится по отправке, или выбор строк - `Checkbox`; один из нескольких режимов - `SegmentedControl`.\n\nНативный `input type="checkbox" role="switch"`. `on:change` - новое состояние (`boolean`), `bind:checked` работает. Подпись `label` и `description` - справа (по умолчанию) или слева (`labelPosition="start"`), `fullWidth` разносит подпись и переключатель по краям строки. Без подписи нужен `tooltip` с `label`, `aria-label` или `aria-labelledby`. `readonly` - состояние видно как есть, без бледности, но не меняется; `disabled` - серый трек без цвета вида, включённое видно по бегунку справа. Вид `kind`: `brand` (по умолчанию), `primary`, `positive`, `negative`; размеры `large`, `medium` (по умолчанию), `small`, `extra-small`.'
      }
    }
  }
} satisfies Meta<Toggle>

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
          title: 'Kinds',
          component: Toggle,
          rows: axis('kind', ['brand', 'primary', 'positive', 'negative']),
          columns: [
            { title: 'off', props: {} },
            { title: 'on', props: { checked: true } },
            { title: 'on, label', props: { checked: true, label: getEmbeddedLabel('Make private') } },
            { title: 'disabled on', props: { checked: true, disabled: true } }
          ],
          props: { size: 'medium', 'aria-label': 'Make private' }
        },
        {
          title: 'Sizes',
          component: Toggle,
          rows: states,
          columns: axis('size', sizes),
          props: { 'aria-label': 'Make private' }
        },
        {
          title: 'With label',
          component: Toggle,
          rows: states,
          columns: axis('size', sizes),
          props: { label }
        },
        {
          title: 'Label position and description',
          component: Toggle,
          rows: [
            { title: 'end', props: {} },
            { title: 'end + description', props: { description } },
            { title: 'start', props: { labelPosition: 'start' } },
            { title: 'start + description', props: { labelPosition: 'start', description } }
          ],
          columns: [
            { title: 'medium', props: {} },
            { title: 'medium disabled', props: { disabled: true } },
            { title: 'extra-small', props: { size: 'extra-small' } }
          ],
          props: { label, checked: true }
        }
      ]
    }
  })
}
