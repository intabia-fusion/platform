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

import ui from '@hcengineering/ui'
import { IconBox } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const sizes = ['large', 'medium', 'small', 'extra-small'] as const

const meta = {
  title: 'Display/IconBox',
  component: IconBox,
  args: { icon: ui.icon.Sliders, size: 'small' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** декоративная иконка вида объекта в ряд с кнопками: у поля названия в диалоге создания, иконка канала. **Не этот компонент:** по иконке кликают (выбор иконки, смена типа) - `IconButton` с подписью.\n\nНе кнопка: `<span aria-hidden="true">` без фокуса. Вид - как у `IconButton kind="secondary"` того же размера, иконка всегда `small`; `shape="round"` - круг на любом размере.'
      }
    }
  }
} satisfies Meta<IconBox>

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
          component: IconBox,
          rows: [
            { title: 'rectangle', props: {} },
            { title: 'round', props: { shape: 'round' } }
          ],
          columns: axis('size', sizes),
          props: { icon: ui.icon.Sliders }
        }
      ]
    }
  })
}
