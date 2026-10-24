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

import { Panel } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import PanelExample from './panel/PanelExample.svelte'

const meta = {
  title: 'Panels and dialogs/Panel',
  component: Panel,
  args: {
    closable: true,
    isAside: true,
    floatAside: false,
    isFullSize: false,
    useMaxWidth: undefined,
    adaptive: 'auto',
    scrollExtra: false
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '**Когда:** страница объекта (задача, документ, карточка, файл) в рабочей области или в боковой панели: шапка, содержимое и aside со свойствами. **Не этот компонент:** только шапка вида или виджета - `PanelHeader`; диалог - `Dialog`.\n\n' +
          'Шапка - `PanelHeader`: в начале кнопка закрытия (`closable`, `on:close`) и слот `before`, затем заголовок (слот `title`, обычно `Breadcrumbs`), `presence`, `search`, `extra`, действия (`actions`, `pre-utils`, `utils`), кнопка ширины (`useMaxWidth`, `on:maxWidth`), полного размера (`isFullSize`, `on:fullsize`), переключатель aside и `post-utils`. Aside (`aside`) стоит рядом с содержимым, а в панели уже 900px или с `floatAside` всплывает поверх; несколько aside - группа кнопок `customAside` (`selectedAside`, `on:select`). Слоты `header` (над содержимым), `panel-footer`, `page-header` / `page-footer` (печать). `on:resize` - ширины панели, содержимого и шапки.'
      }
    }
  },
  render: (args) => ({ Component: PanelExample, props: { props: args } })
} satisfies Meta<Panel>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        {
          title: 'Aside',
          component: PanelExample,
          rows: [
            { title: 'toggle', props: {} },
            { title: 'several asides', props: { customAsides: true, props: { selectedAside: 'links' } } },
            { title: 'narrow (floats)', props: { width: '40rem' } },
            { title: 'no aside', props: { withAside: false } }
          ],
          columns: [{ title: 'panel', props: {} }],
          props: {}
        },
        {
          title: 'Header buttons',
          component: PanelExample,
          rows: [
            { title: 'width button', props: { props: { useMaxWidth: true } } },
            { title: 'full size', props: { props: { isFullSize: true } } },
            { title: 'not closable', props: { props: { closable: false } } }
          ],
          columns: [{ title: 'panel', props: {} }],
          props: {}
        }
      ]
    }
  })
}
