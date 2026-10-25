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
import { Section } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import SectionExample from './section/SectionExample.svelte'

const meta = {
  title: 'Menus and lists/Section',
  component: Section,
  args: { label: getEmbeddedLabel('Members'), icon: ui.icon.Folder },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** именованный блок страницы объекта (участники, отклики, активность, версии файла): строка заголовка с иконкой и действиями над содержимым. **Не этот компонент:** блок, который сворачивается, - `AccordionItem`; пустое содержимое секции - `EmptyState size="small"` внутри неё.\n\n`<section>` с именем из заголовка `<h2>`; слот `actions` - кнопки справа в строке заголовка (настройки вида, «+»), default slot - содержимое, всегда на 4px ниже линии. `id` уходит на корень - якорь для прокрутки. Отступ между соседними секциями задаёт место.'
      }
    }
  },
  render: (args) => ({ Component: SectionExample, props: { props: args } })
} satisfies Meta<Section>

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
          title: 'Header',
          component: SectionExample,
          rows: [
            { title: 'icon', props: { props: { icon: ui.icon.Folder } } },
            { title: 'no icon', props: {} }
          ],
          columns: [
            { title: 'actions', props: {} },
            { title: 'no actions', props: { withActions: false } },
            { title: 'empty content', props: { empty: true } }
          ]
        },
        {
          title: 'Long title',
          component: SectionExample,
          rows: [{ title: 'activity', props: { props: { icon: ui.icon.ChartSquare } } }],
          columns: [{ title: 'ellipsis', props: { width: '16rem' } }],
          props: { label: getEmbeddedLabel('Activity and comments of the whole team') }
        }
      ]
    }
  })
}
