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
import ui from '@hcengineering/ui'
import { Button } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = [
  'primary',
  'brand',
  'secondary',
  'tertiary',
  'ghost',
  'positive',
  'negative',
  'positive-ghost',
  'negative-ghost',
  'chip',
  'light',
  'dark'
] as const
const sizes = ['extra-large', 'large', 'medium', 'small', 'extra-small', 'min'] as const
const label = getEmbeddedLabel('Button')

const meta = {
  title: 'Buttons/Button',
  component: Button,
  args: { label, icon: ui.icon.Plus, kind: 'secondary', size: 'large' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** действие по клику: сохранить, создать, открыть свой попап (`hasMenu`), включить или выключить (`selected`). **Не этот компонент:** только иконка - `IconButton`; выбор пункта из списка - `MenuButton`; значение, которое можно поменять, - `SelectButton`; главное действие с меню связанных - `SplitButton`; переход по адресу в тексте - `Link`.\n\n`pressed` - серый вид нажатия (открытый попап, с `hasMenu` - `aria-expanded`), `selected` - переключатель (`aria-pressed`, заливка `--button-selected-*` у `secondary`, `tertiary`, `ghost`). `loading` блокирует кнопку и ставит вместо иконки `Spinner` кита цвета иконки (`aria-busy`). Клик не уходит дальше кнопки, пока не `stopPropagation={false}`; `tabindex={-1}` убирает кнопку из порядка Tab, когда до действия есть другой путь с клавиатуры.'
      }
    }
  }
} satisfies Meta<Button>

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
          component: Button,
          rows: axis('kind', kinds),
          columns: axis(
            'size',
            sizes.filter((size) => size !== 'min')
          ),
          props: { label, icon: ui.icon.Plus }
        },
        {
          title: 'Round',
          component: Button,
          rows: axis('kind', kinds),
          columns: axis(
            'size',
            sizes.filter((size) => size !== 'min')
          ),
          props: { label, icon: ui.icon.Plus, shape: 'round' }
        },
        {
          title: 'States',
          component: Button,
          rows: axis('kind', kinds),
          columns: [
            { title: 'default', props: {} },
            { title: 'pressed', props: { pressed: true } },
            { title: 'selected', props: { selected: true } },
            { title: 'menu open', props: { hasMenu: true, pressed: true } },
            { title: 'loading', props: { loading: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { label, icon: ui.icon.Plus }
        }
      ]
    }
  })
}
