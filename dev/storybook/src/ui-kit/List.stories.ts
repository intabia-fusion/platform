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

import { List } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import ListExample from './list/ListExample.svelte'

const meta = {
  title: 'Menus and lists/List ⏳',
  id: 'menus-and-lists-list',
  component: List,
  args: { count: 5, inset: true, scroll: true, hoverSelects: true, highlighted: undefined },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** список строк, по которому ходят стрелками и курсором, а Enter или клик выбирают строку: попапы выбора (люди, задачи, упоминания), список чатов, входящие. **Не этот компонент:** строка навигатора слева - `NavItem`; меню действий - `Menu`; выбор значения поля - `Dropdown`.\n\n' +
          'Строки рисует место в слоте `item` (`let:index`, `let:value` из `items`, `let:selected`), перед строкой - слот `category` (заголовок группы). `selection` (bindable) - текущая строка: её двигает курсор (`hoverSelects`), клавиши и метод `select(pos)` (с прокруткой к строке), событие `select` - новый индекс; клик и Enter - `activate` с индексом. Сфокусированный список (он в порядке Tab) сам ходит стрелками, Home / End, PageUp / PageDown; поле, которое держит фокус (поиск попапа), передаёт клавиши в `list.onKeydown(event)` - он вернёт `true`, если клавиша использована. `highlighted` - строка открытого объекта (входящие), цветом выбранного темы. Текущая строка в попапе и на панели - одной нейтральной подложкой (`--button-tertiary-hover-BackgroundColor`), заметной и в тёмной теме. `inset={false}` - строки от края до края; `scroll={false}` - список растёт, прокручивает место; `lazy` + `rowMinHeight` - строки монтируются при появлении. `resize` - список сменил размер (попап перепозиционируется). Роли `listbox` / `option`, `aria-selected` у текущей, `aria-activedescendant` у списка.'
      }
    }
  },
  render: (args) => ({
    Component: ListExample,
    props: { props: args, surface: 'popup', count: args.count }
  })
} satisfies Meta<List>

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
          component: ListExample,
          rows: [
            { title: 'popup', props: { surface: 'popup', props: {} } },
            { title: 'panel', props: { surface: 'panel', props: {} } }
          ],
          columns: [
            { title: 'current row', props: { selection: 1 } },
            { title: 'current + highlighted', props: { selection: 1, highlighted: 3 } },
            { title: 'edge to edge', props: { selection: 1, inset: false } }
          ],
          props: { count: 4 }
        }
      ]
    }
  })
}
