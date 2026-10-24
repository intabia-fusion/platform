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

import type { Meta, StoryObj } from '@storybook/svelte'

import * as Dropdown from '../ui-kit/Dropdown.stories'
import * as Menu from '../ui-kit/Menu.stories'
import * as MenuButton from '../ui-kit/MenuButton.stories'
import * as Toast from '../ui-kit/Toast.stories'
import StoryStack from './StoryStack.svelte'
import { entry, type StackGroup } from './stack'

const meta = {
  title: 'Overview/Popups and menus',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const kit: StackGroup[] = [
  {
    title: 'Меню',
    entries: [
      entry('Menu', Menu, 'Variants', 'содержимое любого попапа со списком: действия, выбор, поиск, вложенность'),
      entry('Menu: слоты', Menu, 'Slots'),
      entry('MenuButton', MenuButton, 'Variants', 'кнопка, открывающая Menu'),
      entry('Dropdown', Dropdown, 'Variants', 'поле со значением, открывающее Menu'),
      entry('Dropdown: своя разметка значения', Dropdown, 'CustomValue')
    ]
  },
  {
    title: 'Уведомления',
    entries: [entry('Toast', Toast, 'Variants')]
  }
]

export const Components: Story = {
  name: 'Popups and menus',
  render: () => ({
    Component: StoryStack,
    props: {
      intro:
        'Все попапы и меню кита на одной странице (попапы дат - в Overview/Date popups): списки открыты прямо на странице, чтобы сравнить строки, отступы, поиск и выбор рядом. Заголовок открывает собственную историю компонента.',
      groups: kit
    }
  })
}
