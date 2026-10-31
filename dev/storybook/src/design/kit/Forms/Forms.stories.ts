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
import Dropdown from './Dropdown.svelte'
import EditBox from './EditBox.svelte'
import Input from './Input.svelte'
import Radio from './Radio.svelte'
import SearchInput from './SearchInput.svelte'
import SelectButton from './SelectButton.svelte'
import TextArea from './TextArea.svelte'
import TextInput from './TextInput.svelte'
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
      { title: 'empty', props: { checked: false } },
      { title: 'indeterminate', props: { indeterminate: true } },
      { title: 'disabled', props: { checked: true, disabled: true } },
      { title: 'error', props: { error: true } }
    ],
    columns: [
      { title: 'medium', props: { label: 'Priority' } },
      { title: 'small', props: { label: 'Priority', size: 'small' } },
      { title: 'round', props: { label: 'Priority', shape: 'round' } },
      { title: 'no label', props: {} }
    ]
  },
  {
    title: 'Checkbox - kinds',
    component: Checkbox,
    rows: axis('kind', ['primary', 'brand', 'positive', 'negative', 'neutral']),
    columns: [{ title: '', props: { checked: true, label: 'Priority' } }]
  }
])

export const ToggleStates: Story = sections([
  {
    title: 'Toggle',
    component: Toggle,
    rows: [
      { title: 'on', props: { on: true } },
      { title: 'off', props: { on: false } },
      { title: 'disabled', props: { on: true, disabled: true } }
    ],
    columns: axis('size', ['large', 'medium', 'small', 'extra-small']),
    props: { label: 'WIP limits' }
  },
  {
    title: 'Toggle - kinds',
    component: Toggle,
    rows: axis('kind', ['brand', 'primary', 'positive', 'negative']),
    columns: [{ title: '', props: { on: true, label: 'WIP limits' } }]
  },
  {
    title: 'Toggle - description and label position',
    component: Toggle,
    rows: [
      { title: 'description', props: { description: 'Only members can see it' } },
      { title: 'labelPosition start', props: { labelPosition: 'start' } }
    ],
    columns: [{ title: '', props: { on: true, label: 'Private project' } }]
  }
])

export const RadioStates: Story = sections([
  {
    title: 'Radio',
    component: Radio,
    rows: [
      { title: 'selected', props: { on: true } },
      { title: 'other', props: { on: false, hint: 'A personal board' } },
      { title: 'disabled', props: { on: true, disabled: true } }
    ],
    columns: [
      { title: 'medium', props: { label: 'Only me' } },
      { title: 'small', props: { label: 'Only me', size: 'small' } }
    ]
  },
  {
    title: 'Radio - kinds',
    component: Radio,
    rows: axis('kind', ['primary', 'brand', 'positive', 'negative']),
    columns: [{ title: '', props: { on: true, label: 'Only me' } }]
  }
])

export const TextInputStates: Story = sections([
  {
    title: 'TextInput',
    component: TextInput,
    rows: axis('kind', ['secondary', 'ghost', 'subtle']),
    columns: axis('size', ['large', 'medium', 'small', 'extra-small']),
    props: { value: 'Mobile app' }
  },
  {
    title: 'TextInput - states',
    component: TextInput,
    rows: [{ title: 'secondary', props: {} }],
    columns: [
      { title: 'placeholder', props: { placeholder: 'Name' } },
      { title: 'label', props: { label: 'Identifier', value: 'APP' } },
      { title: 'icon', props: { icon: 'kit/Plus', value: 'Mobile app' } },
      { title: 'clearable', props: { clearable: true, value: 'Mobile app' } },
      { title: 'error', props: { error: true, value: 'APP' } },
      { title: 'disabled', props: { disabled: true, value: 'Mobile app' } }
    ]
  },
  {
    title: 'TextInput - heading',
    component: TextInput,
    rows: axis('size', ['large', 'medium', 'small']),
    columns: [{ title: 'ghost', props: { heading: true, kind: 'ghost', value: 'Mobile app' } }]
  }
])

export const TextAreaStates: Story = sections([
  {
    title: 'TextArea',
    component: TextArea,
    rows: axis('kind', ['secondary', 'ghost', 'subtle']),
    columns: axis('size', ['medium', 'small']),
    props: { value: 'Long description of the project', width: 300 }
  },
  {
    title: 'TextArea - states',
    component: TextArea,
    rows: [{ title: 'secondary', props: {} }],
    columns: [
      { title: 'placeholder', props: { placeholder: 'Description' } },
      { title: 'rows 5', props: { placeholder: 'Description', rows: 5 } },
      { title: 'error', props: { error: true, value: 'Text' } },
      { title: 'disabled', props: { disabled: true, value: 'Text' } }
    ],
    props: { width: 200 }
  }
])

export const SelectButtonStates: Story = sections([
  {
    title: 'SelectButton',
    component: SelectButton,
    rows: axis('kind', ['secondary', 'ghost', 'primary', 'brand', 'chip']),
    columns: axis('size', ['large', 'medium', 'small', 'extra-small']),
    props: { label: 'In progress', chevron: true }
  },
  {
    title: 'SelectButton - states',
    component: SelectButton,
    rows: [{ title: 'secondary', props: {} }],
    columns: [
      { title: 'placeholder', props: { placeholder: 'Status' } },
      { title: 'icon', props: { icon: 'kit/Plus', label: 'In progress' } },
      { title: 'pressed', props: { pressed: true, label: 'In progress', chevron: true } },
      { title: 'disabled', props: { disabled: true, label: 'In progress', chevron: true } },
      { title: 'width 240', props: { width: 240, label: 'In progress', chevron: true } }
    ]
  }
])

export const DropdownStates: Story = sections([
  {
    title: 'Dropdown',
    component: Dropdown,
    rows: axis('kind', ['secondary', 'ghost']),
    columns: [
      { title: 'one value', props: { values: ['In progress'] } },
      { title: 'multiselect', props: { values: ['Alice', 'Bob'] } },
      { title: 'placeholder', props: { placeholder: 'Status' } },
      { title: 'icon', props: { icon: 'kit/Plus', values: ['In progress'] } },
      { title: 'no chevron', props: { values: ['In progress'], chevron: false } },
      { title: 'width 240', props: { values: ['In progress'], width: 240 } }
    ]
  }
])

export const SearchInputStates: Story = sections([
  {
    title: 'SearchInput',
    component: SearchInput,
    rows: axis('kind', ['secondary', 'ghost']),
    columns: axis('size', ['large', 'medium', 'small', 'extra-small']),
    props: { value: 'issue' }
  },
  {
    title: 'SearchInput - states',
    component: SearchInput,
    rows: [{ title: 'secondary', props: {} }],
    columns: [
      { title: 'placeholder', props: { placeholder: 'Find an issue' } },
      { title: 'collapsed', props: { collapsed: true } },
      { title: 'width 240', props: { width: 240 } }
    ]
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
