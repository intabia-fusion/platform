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
import { Tabs } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const sizes = ['medium', 'small'] as const

const labels = [
  { id: 'general', label: getEmbeddedLabel('General') },
  { id: 'workspaces', label: getEmbeddedLabel('Workspaces') },
  { id: 'accounts', label: getEmbeddedLabel('Accounts') },
  { id: 'statistics', label: getEmbeddedLabel('Statistics') }
]
const icons = [
  { id: 'activity', icon: ui.icon.ChartSquare, label: getEmbeddedLabel('Activity') },
  { id: 'attachments', icon: ui.icon.Paperclip, label: getEmbeddedLabel('Attachments') },
  { id: 'settings', icon: ui.icon.Sliders, label: getEmbeddedLabel('Settings') }
]

const meta = {
  title: 'Navigation/Tabs',
  component: Tabs,
  args: { items: labels, selected: 'general', size: 'medium', 'aria-label': 'Admin' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** разделы или виды одного экрана - у каждой вкладки своё содержимое под рядом (разделы админки, вкладки документа, типы уведомлений во входящих). Само содержимое рисует место. Вкладок может быть много: ряд прокручивается.\n\n**Не Tabs:** значение или режим одного и того же содержимого из 2-5 вариантов (вид списка, «Все / Активные», месяц / год) - `SegmentedControl`; вкладки открытых объектов workbench и сайдбара - `WorkbenchTab`; включаемые и выключаемые панели - `ButtonGroup`.\n\nВид - подчёркивание акцентом под выбранной, ряд тянется на высоту шапки места. Стрелки, Home, End выбирают вкладку сразу, `role="tablist"`.'
      }
    }
  }
} satisfies Meta<Tabs>

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
          component: Tabs,
          rows: axis('size', sizes),
          columns: [
            { title: 'labels', props: { items: labels, selected: 'workspaces' } },
            { title: 'icon + label', props: { items: icons, selected: 'activity' } }
          ]
        },
        {
          title: 'States',
          component: Tabs,
          rows: axis('size', sizes),
          columns: [
            { title: 'none selected', props: {} },
            {
              title: 'disabled tab',
              props: {
                selected: 'general',
                items: labels.map((item) => ({ ...item, disabled: item.id === 'accounts' }))
              }
            }
          ],
          props: { items: labels }
        }
      ]
    }
  })
}
