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

import { Menu, type MenuItemId } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'
import type { ComponentProps } from 'svelte'

import Sections from '../helpers/Sections.svelte'
import { actions, classes, languages, mixed, notifications, people, priorities, statuses, table } from './menu/items'
import MenuSlots from './menu/MenuSlots.svelte'

// Single and multiple choice in one story: `selected` takes both shapes.
type Props = Omit<ComponentProps<Menu>, 'selected'> & { selected?: MenuItemId | MenuItemId[] }

// Ready-made setups switched by the `example` control.
const examples = {
  'actions with icons': { items: actions },
  'value with icons': { items: priorities, selected: 'high' },
  'text with search': { items: languages, selected: 'English', withSearch: true },
  multiselect: { items: languages, selected: ['English', 'Deutsch'], multiselect: true },
  descriptions: { items: notifications, selected: 'mentions' },
  headings: { items: table },
  'headings with a divider': { items: table, headings: 'divider', withSearch: true },
  'plain headings': { items: table, headings: 'plain', withSearch: true },
  colors: { items: statuses, selected: 'offer', withSearch: true },
  nested: { items: classes, selected: 'enemy', withSearch: true },
  'submenu and link': { items: mixed },
  '500 rows': { items: people, selected: ['person-3'], multiselect: true, withSearch: true }
} satisfies Record<string, Props>

type Args = Partial<Props> & { example: keyof typeof examples }

// Every key any example sets: a key missing from the next example would otherwise keep its old value.
const defaults: Partial<Props> = { selected: undefined, withSearch: false, multiselect: false, headings: 'lines' }

const one = [{ title: '', props: {} }]

const meta: Meta<Args> = {
  title: 'Menus and lists/Menu',
  component: Menu,
  args: { example: 'actions with icons' },
  argTypes: {
    example: { control: 'select', options: Object.keys(examples), description: 'Ready-made setup of the props below' }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** список в попапе - действия над объектом (контекстное меню, «ещё»), выбор значения или нескольких, с поиском, группами, подменю. Места открывают его через `showPopup(Menu, props, element, onClose, onUpdate)` или рисуют разметкой; кит `MenuButton`, `Dropdown` и `SplitButton` пока открывают легаси `ModernPopup` того же вида.\n\n' +
          '**Не кнопка:** триггер - `MenuButton` (действие или значение на кнопке), `Dropdown` (значение в поле), `SplitButton` (главное действие + связанные). `Menu` - только сам список; закрывает попап событием `close` с id, мультивыбор сообщает `update`. У выбора колонка галки справа есть у каждой строки (отступ от текста spacing-3). Выше 22.625rem строки прокручиваются, край со скрытыми строками затухает.\n\n' +
          '**Клавиатура:** ↑ ↓ Home End - по строкам, → открывает подменю, ← из подменю назад, Enter выбирает; буква на строке ведёт к строке с такого начала подписи (с полем поиска - печатает в поле); ↓ / ↑ из поля - к первой / последней строке. Поиск фильтрует сразу на каждый ввод: оставшиеся строки не пересоздаются (пример «500 rows»).'
      }
    }
  },
  // The example goes last: the boolean controls start at false and would switch its flags off.
  render: ({ example, ...props }) => ({ Component: Menu, props: { ...defaults, ...props, ...examples[example] } })
}

export default meta
type Story = StoryObj<Args>

export const Playground: Story = {}

export const Variants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        {
          title: 'Content',
          component: Menu,
          rows: one,
          columns: [
            { title: 'actions, icons, lines', props: { items: actions } },
            { title: 'text', props: { items: languages.slice(0, 4) } },
            { title: 'description', props: { items: notifications } },
            { title: 'headings="lines" (default)', props: { items: table } },
            { title: 'headings="divider"', props: { items: table, headings: 'divider' } },
            { title: 'headings="plain"', props: { items: table, headings: 'plain' } }
          ],
          props: { autofocus: false }
        },
        {
          title: 'Content',
          component: Menu,
          rows: one,
          columns: [
            { title: 'color', props: { items: statuses, selected: 'offer' } },
            { title: 'children', props: { items: classes } },
            { title: 'submenu only, custom row, link', props: { items: mixed } }
          ],
          props: { autofocus: false }
        },
        {
          title: 'Choice',
          component: Menu,
          rows: one,
          columns: [
            { title: 'nothing checked', props: { items: priorities } },
            { title: 'one checked', props: { items: priorities, selected: 'high' } },
            {
              title: 'multiselect',
              props: { items: languages.slice(0, 4), selected: ['English', 'Deutsch'], multiselect: true }
            },
            { title: 'loading', props: { items: notifications, selected: 'all', loading: true } }
          ],
          props: { autofocus: false }
        },
        {
          title: 'Search',
          component: Menu,
          rows: one,
          columns: [
            { title: 'withSearch', props: { items: languages, withSearch: true } },
            {
              title: 'query, nested levels flat',
              props: { items: classes, withSearch: true, search: 'e', selected: 'enemy' }
            },
            { title: 'no results', props: { items: languages, withSearch: true, search: 'zz' } },
            { title: 'query from outside', props: { items: actions, search: 'op' } }
          ],
          props: { autofocus: false }
        },
        {
          title: 'Width',
          component: Menu,
          rows: one,
          columns: [
            { title: 'fit', props: { items: priorities.slice(0, 3) } },
            { title: 'wide', props: { items: priorities.slice(0, 3), width: 'wide' } },
            { title: 'overflow - faded edge', props: { items: people.slice(0, 12), selected: 'person-3' } }
          ],
          props: { autofocus: false }
        }
      ]
    }
  })
}

/** `actions` - a control next to the search field; `header` - markup between the search and the rows. */
export const Slots: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({ Component: MenuSlots })
}
