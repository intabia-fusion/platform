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
import { IconFile, IconFolder, IconThread } from '@hcengineering/ui'
import { NavItem } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import NavigatorExample from './nav/NavigatorExample.svelte'
import NavItemExample from './nav/NavItemExample.svelte'
import NavItemFrame from './nav/NavItemFrame.svelte'

const label = getEmbeddedLabel('Documents')

const meta = {
  title: 'Navigation/NavItem ⏳',
  id: 'navigation-navitem',
  component: NavItem,
  args: { label, icon: IconFolder, kind: 'link', count: 3, selected: false, expandable: true, open: true },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** строка навигатора слева - страница приложения, объект (канал, карточка, пространство), узел дерева документов, раздел страницы в оглавлении настроек. **Не этот компонент:** заголовок группы строк навигатора - `NavGroup`; вкладки разделов одного экрана - `Tabs`; строка списка в попапе или на панели - `List`.\n\n' +
          'Вся строка - одна кнопка (`aria-current="page"` у выбранной), шеврон и слот `actions` лежат поверх неё отдельными кнопками - вложенных кнопок нет. Виды (`kind`): `link` - иконка и подпись 14px, `object` - иконка на плашке `IconBox`, `anchor` - пункт оглавления 12px вторичным цветом. Выбранная - `--button-selected-*` (акцент темы). `count` - число справа (0 тоже показывается), слот `badge` - свой маркер (непрочитанное), `afterLabel` - иконка после подписи (без звука), `icon` - своя разметка вместо иконки (аватар). `color` - цветной квадрат метки вместо иконки; подпись остаётся основным цветом, и у выбранной тоже. Дерево: `level` - отступ 1.25rem на уровень, `expandable` + `open` (bindable, `on:toggle`) - шеврон и слот `children`, `empty` - место шеврона без кнопки, `collapsed` - что показать в свёрнутом (выбранный потомок). Клик по выбранной раскрываемой строке тоже сворачивает её; с клавиатуры → раскрывает, ← сворачивает (шеврон вне порядка Tab). Запоминать «свёрнуто» - дело места. Обрезанная подпись показывается тултипом.'
      }
    }
  },
  render: (args) => ({ Component: NavItemExample, props: { props: args, withActions: true } })
} satisfies Meta<NavItem>

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
          title: 'Kinds and states',
          component: NavItemFrame,
          rows: axis('kind', ['link', 'object', 'anchor']),
          columns: [
            { title: 'default', props: {} },
            { title: 'selected', props: { selected: true } },
            { title: 'pressed (menu open)', props: { pressed: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { label, icon: IconThread }
        },
        {
          title: 'Content',
          component: NavItemFrame,
          rows: [
            { title: 'link', props: { kind: 'link' } },
            { title: 'object', props: { kind: 'object' } }
          ],
          columns: [
            { title: 'no icon', props: { icon: undefined } },
            { title: 'count', props: { count: 12 } },
            { title: 'count 0', props: { count: 0 } },
            { title: 'description', props: { description: getEmbeddedLabel('12 members') } },
            {
              title: 'identifier',
              props: { identifier: 'TSK-12', label: getEmbeddedLabel('Quarterly planning and retrospective notes') }
            },
            { title: 'color tag', props: { icon: undefined, color: '#F96E50', selected: true } },
            { title: 'long label', props: { label: getEmbeddedLabel('Quarterly planning and retrospective notes') } }
          ],
          props: { label, icon: IconThread }
        },
        {
          title: 'Tree',
          component: NavItemExample,
          rows: axis('level', [0, 1]),
          columns: [
            { title: 'closed', props: { expandable: true } },
            { title: 'open', props: { expandable: true, open: true } },
            { title: 'empty', props: { expandable: true, empty: true } },
            { title: 'selected, open', props: { expandable: true, open: true, selected: true } },
            { title: 'actions + badge', props: { expandable: true, withActions: true, withBadge: true, pressed: true } }
          ],
          props: { icon: IconFile, children: 1 }
        }
      ]
    }
  })
}

export const Navigator: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({ Component: NavigatorExample })
}
