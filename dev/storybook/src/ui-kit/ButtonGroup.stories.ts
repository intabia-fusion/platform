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
import { ButtonGroup } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['secondary', 'ghost'] as const
const sizes = ['large', 'medium', 'small', 'extra-small'] as const

const icons = [
  { id: 'references', icon: ui.icon.Link, tooltip: { label: getEmbeddedLabel('Backlinks') } },
  { id: 'history', icon: ui.icon.ClockCounterClockwise, tooltip: { label: getEmbeddedLabel('History') } },
  { id: 'activity', icon: ui.icon.ChartSquare, tooltip: { label: getEmbeddedLabel('Activity') } }
]
const labels = [
  { id: 'activity', label: getEmbeddedLabel('Activity') },
  { id: 'attachments', label: getEmbeddedLabel('Attachments') }
]
const both = [
  { id: 'activity', icon: ui.icon.ChartSquare, label: getEmbeddedLabel('Activity') },
  { id: 'attachments', icon: ui.icon.Paperclip, label: getEmbeddedLabel('Attachments') }
]

const meta = {
  title: 'Buttons/ButtonGroup ⏳',
  id: 'buttons-buttongroup',
  component: ButtonGroup,
  args: { items: icons, selected: 'references', kind: 'ghost', size: 'small', 'aria-label': 'Aside' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** переключатели, из которых включён не больше одного и можно выключить все: боковые панели документа. **Не этот компонент:** всегда выбран ровно один вариант - `SegmentedControl`; разделы экрана - `Tabs`.\n\nВключённый - `selected` кнопки кита (`aria-pressed`); повторный клик выключает (событие `select` с `null`), если не `allowDeselect={false}`. Виды `secondary` и `ghost` (по умолчанию): невыбранные нейтральные, включённый - акцент на подложке (акцентные значки на всех пунктах прятали бы включённый). Размер `small`. Пункту без текста нужен `tooltip` - это имя кнопки. Кнопки получают id `btnGID-<id пункта>`.'
      }
    }
  }
} satisfies Meta<ButtonGroup>

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
          component: ButtonGroup,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { items: icons, selected: 'references' }
        },
        {
          title: 'Content',
          component: ButtonGroup,
          rows: axis('kind', kinds),
          columns: [
            { title: 'icons', props: { items: icons } },
            { title: 'labels', props: { items: labels } },
            { title: 'icon + label', props: { items: both } }
          ],
          props: { selected: 'activity', size: 'small' }
        },
        {
          title: 'States',
          component: ButtonGroup,
          rows: axis('kind', kinds),
          columns: [
            { title: 'none on', props: {} },
            { title: 'one on', props: { selected: 'history' } },
            {
              title: 'disabled item',
              props: {
                selected: 'references',
                items: icons.map((item) => ({ ...item, disabled: item.id === 'activity' }))
              }
            }
          ],
          props: { items: icons, size: 'small' }
        }
      ]
    }
  })
}
