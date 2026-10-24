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

import * as Checkbox from '../ui-kit/Checkbox.stories'
import * as CodeInput from '../ui-kit/CodeInput.stories'
import * as DateStories from '../ui-kit/Date.stories'
import * as DateInput from '../ui-kit/DateInput.stories'
import * as Dropdown from '../ui-kit/Dropdown.stories'
import * as NumberInput from '../ui-kit/NumberInput.stories'
import * as Radio from '../ui-kit/Radio.stories'
import * as SearchInput from '../ui-kit/SearchInput.stories'
import * as SegmentedControl from '../ui-kit/SegmentedControl.stories'
import * as SelectButton from '../ui-kit/SelectButton.stories'
import * as Slider from '../ui-kit/Slider.stories'
import * as TextArea from '../ui-kit/TextArea.stories'
import * as TextInput from '../ui-kit/TextInput.stories'
import * as Toggle from '../ui-kit/Toggle.stories'
import StoryStack from './StoryStack.svelte'
import { entry, type StackGroup } from './stack'

const meta = {
  title: 'Overview/Inputs and forms',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const kit: StackGroup[] = [
  {
    title: 'Текст',
    entries: [
      entry('TextInput', TextInput, 'Variants'),
      entry('TextArea', TextArea, 'Variants'),
      entry('NumberInput', NumberInput, 'Variants'),
      entry('SearchInput', SearchInput, 'Variants'),
      entry('CodeInput', CodeInput, 'Variants')
    ]
  },
  {
    title: 'Дата и время',
    entries: [entry('DateInput', DateInput, 'Variants'), entry('DateSelect, DateLabel', DateStories, 'Variants')]
  },
  {
    title: 'Выбор',
    entries: [
      entry('Checkbox', Checkbox, 'Variants'),
      entry('Radio, RadioGroup', Radio, 'Variants'),
      entry('Toggle', Toggle, 'Variants'),
      entry('SegmentedControl ⏳', SegmentedControl, 'Variants'),
      entry('Slider', Slider, 'Variants'),
      entry('SelectButton', SelectButton, 'Variants'),
      entry('Dropdown', Dropdown, 'Variants')
    ]
  }
]

export const Components: Story = {
  name: 'Kit',
  render: () => ({
    Component: StoryStack,
    props: {
      intro:
        'Все поля ввода и контролы форм кита на одной странице: сравнить высоты, отступы, рамки и состояния рядом. Заголовок открывает собственную историю компонента.',
      groups: kit
    }
  })
}
