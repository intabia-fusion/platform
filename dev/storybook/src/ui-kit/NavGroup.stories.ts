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
import { NavGroup } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import NavigatorExample from './nav/NavigatorExample.svelte'
import NavGroupExample from './nav/NavGroupExample.svelte'

const label = getEmbeddedLabel('Spaces')

const meta = {
  title: 'Navigation/NavGroup ⏳',
  id: 'navigation-navgroup',
  component: NavGroup,
  args: { label, kind: 'section', expandable: true, open: true, divider: true, highlighted: false },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** заголовок группы строк навигатора слева - секция (Starred, Spaces, настройки) или пространство внутри секции. **Не этот компонент:** сворачиваемая секция содержимого страницы или панели (план дня, этажи, формы) - `AccordionItem`; сама строка навигатора - `NavItem`.\n\n' +
          '`section` - подпись капсом 12px вторичным цветом, линия сверху (`divider={false}` убирает); `nested` - пространство в секции: иконка на плашке, без линии, у раскрытого подпись на подложке. `expandable` - шеврон, вся шапка переключает `open` (bindable, `on:toggle`), содержимое при закрытии остаётся смонтированным; без него шапка - просто заголовок. `selected` (true/false) делает шапку строкой выбора (`on:select`), шеврон переключает отдельно (с клавиатуры → и ← на шапке); у выбранного `nested` справа стрелка. `highlighted` - внутри выбранный пункт, подпись основным цветом (без подложки: рядом с плашкой иконки вышло бы две); `pressed` - открыто меню группы. Слоты: `tools` - кнопки при наведении (создать, меню), `extra` - всегда видимые контролы (селектор проекта), `afterLabel` - после подписи, `collapsed` - что показать в свёрнутой (выбранный пункт).'
      }
    }
  },
  render: (args) => ({ Component: NavGroupExample, props: { props: args, withTools: true } })
} satisfies Meta<NavGroup>

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
          title: 'Kinds',
          component: NavGroupExample,
          rows: [
            { title: 'section', props: { kind: 'section' } },
            { title: 'section, no divider', props: { kind: 'section', divider: false } },
            { title: 'nested', props: { kind: 'nested', icon: ui.icon.Folder } }
          ],
          columns: [
            { title: 'heading', props: {} },
            { title: 'expandable, open', props: { expandable: true } },
            { title: 'closed', props: { expandable: true, open: false } },
            { title: 'highlighted', props: { expandable: true, highlighted: true, selectedRow: 1 } },
            { title: 'tools (hover)', props: { expandable: true, withTools: true, pressed: true } }
          ],
          props: { label }
        },
        {
          title: 'Selectable header',
          component: NavGroupExample,
          rows: [
            { title: 'section', props: { kind: 'section' } },
            { title: 'nested', props: { kind: 'nested', icon: ui.icon.Folder } }
          ],
          columns: [
            { title: 'not selected', props: { selected: false } },
            { title: 'selected', props: { selected: true } },
            { title: 'selected, closed', props: { selected: true, open: false } },
            { title: 'empty', props: { selected: false, empty: true } }
          ],
          props: { label, expandable: true, rows: 1 }
        }
      ]
    }
  })
}

export const Navigator: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({ Component: NavigatorExample })
}
