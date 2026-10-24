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
import { IconSettings } from '@hcengineering/ui'
import { IconButton } from '@hcengineering/ui/kit'
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
  'light',
  'dark'
] as const
const sizes = ['extra-large', 'large', 'medium', 'small', 'extra-small', 'min'] as const
const tooltip = { label: getEmbeddedLabel('Settings') }

const meta = {
  title: 'Buttons/IconButton',
  component: IconButton,
  args: { icon: IconSettings, tooltip, kind: 'secondary', size: 'large' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** действие, понятное по иконке: настройки, закрыть, ещё, степпер числа. **Не этот компонент:** иконка без действия рядом с полем - `IconBox`; иконка-значение, которое можно поменять, - `SelectButton` только с иконкой.\n\nДоступное имя обязательно по типам: `tooltip` с `label` или `aria-label`. Остальное - как у `Button`; `min` - самый маленький размер, только для иконок; `tabindex={-1}` - вне порядка Tab (степперы `NumberInput`).'
      }
    }
  }
} satisfies Meta<IconButton>

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
          component: IconButton,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { icon: IconSettings, tooltip }
        },
        {
          title: 'Round',
          component: IconButton,
          rows: axis('kind', kinds),
          columns: axis(
            'size',
            sizes.filter((size) => size !== 'min')
          ),
          props: { icon: IconSettings, tooltip, shape: 'round' }
        },
        {
          title: 'States',
          component: IconButton,
          rows: axis('kind', kinds),
          columns: [
            { title: 'default', props: {} },
            { title: 'pressed', props: { pressed: true } },
            { title: 'selected', props: { selected: true } },
            { title: 'loading', props: { loading: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { icon: IconSettings, tooltip }
        }
      ]
    }
  })
}
