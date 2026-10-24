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
import { IconFile } from '@hcengineering/ui'
import { WorkbenchTab } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import WorkbenchTabStrips from './workbench-tab/WorkbenchTabStrips.svelte'

const kinds = ['secondary', 'outline'] as const
const label = getEmbeddedLabel('Release plan')

const meta = {
  title: 'Navigation/WorkbenchTab ⏳',
  id: 'navigation-workbenchtab',
  component: WorkbenchTab,
  args: {
    label,
    icon: IconFile,
    selected: false,
    closable: true,
    preview: false,
    kind: 'secondary',
    orientation: 'horizontal'
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** вкладка открытого объекта в полосе, которую держит место (вкладки workbench, виджеты сайдбара).\n\n**Какой компонент:** `Tabs` - разделы или виды одного экрана, у каждой вкладки своё содержимое под рядом (разделы админки, вкладки документа, типы уведомлений во входящих). `SegmentedControl` - значение или режим одного и того же содержимого из 2-5 вариантов (вид списка, «Все / Активные / Бэклог», месяц / год, период оплаты). `WorkbenchTab` - вкладка открытого объекта в полосе workbench или сайдбара, закрывается и закрепляется. `ButtonGroup` - панели, которые можно включить и выключить все.\n\nМесто оборачивает полосу в `role="tablist"` и задаёт ширину вкладки; стрелки ходят по вкладкам полосы и открывают их, Delete и средняя кнопка мыши закрывают (`closable`); крестик вне порядка Tab. `on:menu` - контекстное меню с событием мыши в `detail`. `kind="outline"` - закреплённая, `preview` - временная (курсив), `orientation="vertical"` - боковая полоса. Ряд вкладок со своим списком - `Tabs`.'
      }
    }
  }
} satisfies Meta<WorkbenchTab>

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
          title: 'Horizontal',
          component: WorkbenchTab,
          rows: axis('kind', kinds),
          columns: [
            { title: 'default', props: {} },
            { title: 'selected', props: { selected: true } },
            { title: 'closable', props: { closable: true } },
            { title: 'selected closable', props: { selected: true, closable: true } },
            { title: 'preview', props: { preview: true, closable: true } },
            { title: 'no icon', props: { icon: undefined } }
          ],
          props: { label, icon: IconFile }
        },
        {
          title: 'Vertical',
          component: WorkbenchTab,
          rows: axis('kind', kinds),
          columns: [
            { title: 'default', props: {} },
            { title: 'selected', props: { selected: true } },
            { title: 'closable', props: { closable: true } },
            { title: 'preview', props: { preview: true, closable: true } }
          ],
          props: { label, icon: IconFile, orientation: 'vertical' }
        }
      ]
    }
  })
}

export const Strips: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({ Component: WorkbenchTabStrips })
}
