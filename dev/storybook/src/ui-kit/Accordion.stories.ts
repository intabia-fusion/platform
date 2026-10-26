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
import { AccordionItem } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import AccordionExample from './accordion/AccordionExample.svelte'

const HOUR = 60 * 60 * 1000

const meta = {
  title: 'Menus and lists/Accordion',
  component: AccordionItem,
  args: { label: getEmbeddedLabel('Today'), size: 'large', open: true, counter: 3, duration: 2.5 * HOUR },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** блок с заголовком, который сворачивается: секции плана дня и этажей (`large`), подгруппы в них (`medium`), компактные раскрывашки в формах, отчётах и списках админки (`small`). **Не этот компонент:** обрезка длинного текста по высоте - `ShowMore`; блок страницы объекта, который не сворачивается, - `Section`.\n\n`AccordionItem` - раскрывающаяся секция: шапка - кнопка с `aria-expanded`/`aria-controls`, содержимое при закрытии остаётся смонтированным (`hidden`); у `large` и `medium` оно - регион с именем заголовка, у `small` нет (длинные списки и деревья не засоряют ориентиры). `large` - секция с шевроном и заголовком 16px, `medium` - подгруппа внутри неё: заголовок капсом на плашке, пунктир между соседними. `open` - bindable, `on:toggle` с новым состоянием; запомнить его место решает само. `selected` (true/false) делает заголовок отдельной кнопкой выбора (`on:select`), раскрывает шеврон; `disabled` выключает только шеврон. Слоты: `meta` - после счётчика и длительности, `actions` - справа, вне кнопки шапки. `sticky` прилипает к верху прокрутки, шапка непрозрачная: фон - `--accordion-header-BackgroundColor`, по умолчанию `--theme-panel-color`. `small` - шеврон и заголовок 14px без разделителей, у выключенной место шеврона остаётся (строки списка выровнены); `filled` - шапка на подложке (строки-блоки); `lazy` - содержимое рисуется при первом раскрытии и дальше остаётся.'
      }
    }
  },
  render: (args) => ({ Component: AccordionExample, props: { props: args, withActions: true } })
} satisfies Meta<AccordionItem>

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
          component: AccordionExample,
          rows: axis('size', ['large', 'medium']),
          columns: [
            { title: 'closed', props: {} },
            { title: 'open', props: { open: true } },
            { title: 'icon', props: { open: true, icon: ui.icon.Folder } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { label: getEmbeddedLabel('Product'), rows: 1, width: '18rem' }
        },
        {
          title: 'Header content',
          component: AccordionExample,
          rows: axis('size', ['large', 'medium']),
          columns: [
            { title: 'counter', props: { counter: 4 } },
            { title: 'counter + duration', props: { counter: 4, duration: 2.5 * HOUR } },
            { title: 'meta slot', props: { counter: 4, duration: 2.5 * HOUR, planned: '1h' } },
            { title: 'actions', props: { counter: 4, withActions: true } }
          ],
          props: { label: getEmbeddedLabel('Today'), rows: 0, width: '18rem' }
        },
        {
          title: 'Selectable',
          component: AccordionExample,
          rows: [
            { title: 'not selected', props: { selected: false } },
            { title: 'selected', props: { selected: true } },
            { title: 'selected, open', props: { selected: true, open: true } }
          ],
          columns: [
            { title: 'large', props: {} },
            { title: 'with actions', props: { withActions: true } },
            { title: 'medium', props: { size: 'medium' } },
            { title: 'small', props: { size: 'small' } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { label: getEmbeddedLabel('Floor 2'), rows: 1, width: '15rem' }
        },
        {
          title: 'Small (disclosure)',
          component: AccordionExample,
          rows: [
            { title: 'plain', props: {} },
            { title: 'filled', props: { filled: true } }
          ],
          columns: [
            { title: 'closed', props: {} },
            { title: 'open', props: { open: true } },
            { title: 'counter + meta', props: { counter: 12, planned: '2h' } },
            { title: 'actions', props: { withActions: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { label: getEmbeddedLabel('Reported time'), size: 'small', rows: 2, width: '15rem' }
        }
      ]
    }
  })
}
