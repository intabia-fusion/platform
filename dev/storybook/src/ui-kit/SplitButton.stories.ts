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
import { SplitButton } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['primary', 'brand', 'secondary', 'ghost', 'positive', 'negative', 'light', 'dark'] as const
const sizes = ['extra-large', 'large', 'medium', 'small', 'extra-small'] as const
const label = getEmbeddedLabel('Create issue')
const iconOnly = { icon: ui.icon.Sliders, tooltip: { label: getEmbeddedLabel('Settings') } }

const meta = {
  title: 'Buttons/SplitButton',
  component: SplitButton,
  args: { label, kind: 'brand', size: 'medium' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** главное действие и меню связанных в одном контроле: «Создать задачу» + «Создать и открыть», устройство + выбор устройства. **Не этот компонент:** одно действие - `Button`; только меню - `MenuButton`.\n\nС текстом - половинки со своей заливкой и зазором, только иконка - общий контур и узкая стрелка. `items` открывает список сам (`on:selected`), без них - `on:menu` с кликом, попап места и `menuPressed`. Во время `loading` кнопка меню темнеет вместе с главной и меню не открывает. `tertiary` и state-ghost виды не поддерживаются: без заливки половинки не читаются.'
      }
    }
  }
} satisfies Meta<SplitButton>

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
          component: SplitButton,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { label }
        },
        {
          title: 'States',
          component: SplitButton,
          rows: axis('kind', kinds),
          columns: [
            { title: 'default', props: {} },
            { title: 'with icon', props: { icon: ui.icon.Plus } },
            { title: 'menu open', props: { menuPressed: true } },
            { title: 'loading', props: { loading: true } },
            { title: 'disabled', props: { disabled: true } },
            { title: 'no menu', props: { hasMenu: false } }
          ],
          props: { label, size: 'medium' }
        },
        {
          title: 'Icon only: compact (one contour, narrow menu)',
          component: SplitButton,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: iconOnly
        },
        {
          title: 'Icon only: states',
          component: SplitButton,
          rows: axis('kind', kinds),
          columns: [
            { title: 'default', props: {} },
            { title: 'menu up', props: { menuIcon: ui.icon.ChevronUpSmall } },
            { title: 'menu open', props: { menuPressed: true } },
            { title: 'loading', props: { loading: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { ...iconOnly, size: 'large' }
        },
        {
          title: 'Fill, aligned to the start (side panel)',
          component: SplitButton,
          rows: [{ title: 'brand', props: { kind: 'brand' } }],
          columns: [{ title: 'fill', props: {} }],
          props: {
            label: getEmbeddedLabel('New issue'),
            icon: ui.icon.Plus,
            fill: true,
            alignStart: true,
            size: 'medium'
          }
        }
      ]
    }
  })
}
