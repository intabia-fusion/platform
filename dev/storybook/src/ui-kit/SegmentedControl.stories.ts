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
import { SegmentedControl } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const sizes = ['medium', 'small', 'extra-small'] as const

const labels = [
  { id: 'all', label: getEmbeddedLabel('All') },
  { id: 'planned', label: getEmbeddedLabel('Planned') },
  { id: 'active', label: getEmbeddedLabel('Active') },
  { id: 'completed', label: getEmbeddedLabel('Completed') }
]
const both = [
  { id: 'messages', icon: ui.icon.Bubble, label: getEmbeddedLabel('Messages') },
  { id: 'files', icon: ui.icon.Folder, label: getEmbeddedLabel('Files') }
]
const views = [
  { id: 'list', icon: ui.icon.PanelRightLine, label: getEmbeddedLabel('List') },
  { id: 'board', icon: ui.icon.PanelRight, label: getEmbeddedLabel('Board') },
  { id: 'files', icon: ui.icon.Folder, label: getEmbeddedLabel('Files') }
]
const period = [
  { id: 'monthly', label: getEmbeddedLabel('Monthly') },
  { id: 'yearly', label: getEmbeddedLabel('Yearly'), badge: getEmbeddedLabel('−20%') }
]

const meta = {
  title: 'Inputs/SegmentedControl ⏳',
  id: 'inputs-segmentedcontrol',
  component: SegmentedControl,
  args: { items: labels, selected: 'all', size: 'small', iconOnly: false, 'aria-label': 'Milestones' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** выбрать значение или режим одного и того же содержимого, вариантов 2-5, выбран всегда ровно один.\n\n**Какой компонент:** `Tabs` - разделы или виды одного экрана, у каждой вкладки своё содержимое под рядом (разделы админки, вкладки документа, типы уведомлений во входящих). `SegmentedControl` - значение или режим одного и того же содержимого из 2-5 вариантов (вид списка, «Все / Активные / Бэклог», месяц / год, период оплаты). `WorkbenchTab` - вкладка открытого объекта в полосе workbench или сайдбара, закрывается и закрепляется. `ButtonGroup` - панели, которые можно включить и выключить все.\n\nСегменты в общей подложке, `role="radiogroup"`, одна остановка Tab, стрелки, Home и End меняют выбор. С `iconOnly` подписи прячутся и становятся тултипом и доступным именем. Переключатели, которые можно выключить все (боковые панели), - `ButtonGroup`.'
      }
    }
  }
} satisfies Meta<SegmentedControl>

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
          component: SegmentedControl,
          rows: [
            { title: 'labels', props: { items: labels, selected: 'planned' } },
            { title: 'icon + label', props: { items: both, selected: 'messages' } },
            { title: 'iconOnly', props: { items: views, selected: 'board', iconOnly: true } },
            { title: 'badge', props: { items: period, selected: 'monthly' } }
          ],
          columns: axis('size', sizes)
        },
        {
          title: 'States',
          component: SegmentedControl,
          rows: [{ title: 'small', props: { items: labels } }],
          columns: [
            { title: 'none selected', props: {} },
            { title: 'first', props: { selected: 'all' } },
            { title: 'last', props: { selected: 'completed' } },
            {
              title: 'disabled segment',
              props: {
                selected: 'all',
                items: labels.map((item) => ({ ...item, disabled: item.id === 'active' }))
              }
            }
          ],
          props: { size: 'small' }
        }
      ]
    }
  })
}
