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
import { IconThread } from '@hcengineering/ui'
import { Chip } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['tint', 'solid', 'outline', 'neutral'] as const
const sizes = ['small', 'extra-small'] as const
const label = getEmbeddedLabel('issue.created')

const meta = {
  title: 'Display/Chip',
  component: Chip,
  args: { label, kind: 'tint', size: 'small', removable: true },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** значение, выбранное в поле (тип события, пространство, метка, получатель), со своей кнопкой удаления, или метка из данных со своим цветом. **Не этот компонент:** вкладка открытого объекта - `WorkbenchTab`; состояние значком - `StatusIcon`; кнопка-переключатель - `Button` с `selected`.\n\n Цвет - акцент темы или `color` из данных (цвет метки, выбранный пользователем). Варианты вида на выбор: `tint` - светлая заливка и цветной текст (по умолчанию), `solid` - полная заливка и светлый текст, `outline` - цветная рамка и текст без заливки, `neutral` - плоская серо-голубая плашка и вторичный текст, без рамки (как бейдж в крошках: не похож на кнопку). Счётчик скрытых «+N» - такой же чип с `kind="neutral"`. `icon` - иконка вида значения перед подписью (канал, человек), цветом текста. Кнопка удаления - `IconButton` кита с тултипом «Remove» и именем «Remove {label}» (`ui.string.RemoveItem` с переведённой подписью чипа), `remove` приходит и по Backspace / Delete на ней.'
      }
    }
  }
} satisfies Meta<Chip>

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
          component: Chip,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { label, removable: true }
        },
        {
          title: 'Kinds with the accent and with data colors',
          component: Chip,
          rows: axis('kind', kinds),
          columns: [
            { title: 'accent', props: { label: getEmbeddedLabel('issue.created') } },
            { title: 'accent, removable', props: { label: getEmbeddedLabel('issue.updated'), removable: true } },
            { title: 'data: pink', props: { label: getEmbeddedLabel('Frontend'), color: '#E25F8B', removable: true } },
            { title: 'data: green', props: { label: getEmbeddedLabel('Design'), color: '#4CA185' } },
            { title: 'data: blue', props: { label: getEmbeddedLabel('Backend'), color: '#4E85E8' } }
          ]
        },
        {
          title: 'Content',
          component: Chip,
          rows: axis('size', sizes),
          columns: [
            { title: 'label', props: {} },
            { title: 'removable', props: { removable: true } },
            { title: 'data color', props: { removable: true, color: '#4CA185' } },
            {
              title: 'icon',
              props: { icon: IconThread, kind: 'neutral', label: getEmbeddedLabel('general'), removable: true }
            },
            { title: 'counter', props: { label: getEmbeddedLabel('+3'), kind: 'neutral' } }
          ],
          props: { label }
        }
      ]
    }
  })
}
