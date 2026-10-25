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
import { axis } from '../../../helpers/matrix'

import Checkbox from './Checkbox.svelte'
import EditBox from './EditBox.svelte'
import Input from './Input.svelte'
import Radio from './Radio.svelte'
import Toggle from './Toggle.svelte'
import FramedSections from '../FramedSections.svelte'

const meta: Meta = {
  title: 'Kit (pen.dev)/Forms',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
}

export default meta
type Story = StoryObj<typeof meta>

const sections = (list: unknown[]): Story => ({
  render: (_args, { title, name }) => ({
    Component: FramedSections,
    props: { sections: list, title: `${title.slice(title.lastIndexOf('/') + 1)} - ${name}` }
  })
})

export const InputStates: Story = sections([
  {
    title: 'Input',
    component: Input,
    rows: axis('size', ['narrow', 'medium', 'wide']),
    columns: [
      { title: 'value', props: { value: 'Mobile app' } },
      { title: 'placeholder', props: { placeholder: 'Name' } },
      { title: 'select', props: { value: 'Not assigned', icon: 'person', menu: true } },
      { title: 'error', props: { value: 'APP', error: true } },
      { title: 'label', props: { value: 'APP', label: 'Identifier' } }
    ]
  },
  {
    title: 'Two lines',
    component: Input,
    rows: [{ title: 'multiline', props: { value: 'Long description of the project', size: 'wide', lines: 2 } }],
    columns: [{ title: '', props: {} }]
  }
])

export const CheckboxStates: Story = sections([
  {
    title: 'Checkbox',
    component: Checkbox,
    rows: [
      { title: 'checked', props: { checked: true } },
      { title: 'empty', props: { checked: false } }
    ],
    columns: [{ title: '', props: { label: 'Priority' } }]
  }
])

export const ToggleStates: Story = sections([
  {
    title: 'Toggle',
    component: Toggle,
    rows: [
      { title: 'on', props: { on: true } },
      { title: 'off', props: { on: false } }
    ],
    columns: [{ title: '', props: { label: 'WIP limits' } }]
  }
])

export const RadioStates: Story = sections([
  {
    title: 'Radio',
    component: Radio,
    rows: [
      { title: 'selected', props: { on: true } },
      { title: 'other', props: { on: false, hint: 'A personal board' } }
    ],
    columns: [{ title: '', props: { label: 'Only me' } }]
  }
])

export const EditBoxStates: Story = sections([
  {
    title: 'EditBox',
    component: EditBox,
    rows: axis('kind', ['ghost-large', 'large-style', 'editbox']),
    columns: [{ title: '', props: { value: 'Mobile app', width: 310 } }]
  }
])
