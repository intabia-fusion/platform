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

import * as Calendar from '../ui-kit/Calendar.stories'
import * as DatePicker from '../ui-kit/DatePicker.stories'
import StoryStack from './StoryStack.svelte'
import { entry, type StackGroup } from './stack'

const meta = {
  title: 'Overview/Date popups',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const kit: StackGroup[] = [
  {
    title: 'Дата',
    entries: [
      entry('DatePicker', DatePicker, 'Variants', 'попап выбора даты, времени и диапазона, со сдвигами'),
      entry('Calendar', Calendar, 'Variants', 'сетка месяца внутри DatePicker и мест')
    ]
  }
]

export const Components: Story = {
  name: 'Date popups',
  render: () => ({
    Component: StoryStack,
    props: {
      intro:
        'Попапы дат кита на одной странице: открыты прямо на странице, чтобы сравнить поля, календари и сдвиги рядом. Заголовок открывает собственную историю компонента.',
      groups: kit
    }
  })
}
