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
import { Dropdown, type DropdownItemId } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'
import type { ComponentProps } from 'svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import DropdownCustomValue from './dropdown/DropdownCustomValue.svelte'
import DropdownFullWidth from './dropdown/DropdownFullWidth.svelte'
import ExampleIcon from './select-button/ExampleIcon.svelte'

const kinds = ['secondary', 'ghost', 'primary', 'brand'] as const
const sizes = ['large', 'medium', 'small', 'extra-small'] as const
const priority = { icon: ExampleIcon, iconProps: { glyph: 'priority' } }
const priorities = [
  { id: 'urgent', label: getEmbeddedLabel('Urgent'), ...priority },
  { id: 'high', label: getEmbeddedLabel('High'), icon: ExampleIcon, iconProps: { glyph: 'high' } },
  { id: 'medium', label: getEmbeddedLabel('Medium'), ...priority },
  { id: 'low', label: getEmbeddedLabel('Low'), ...priority }
]
const languages = ['English', 'Русский', 'Deutsch', 'Español', 'Français', 'Português', 'Italiano', 'Türkçe'].map(
  (name) => ({ id: name, label: getEmbeddedLabel(name) })
)
const placeholder = getEmbeddedLabel('No priority')
const glyph = (name: string): { icon: typeof ExampleIcon, iconProps: { glyph: string } } => ({
  icon: ExampleIcon,
  iconProps: { glyph: name }
})
// A class tree: a parent is a choice too, its subclasses open in a submenu.
const classes = [
  {
    id: 'component',
    label: getEmbeddedLabel('Game Component'),
    ...glyph('component'),
    children: [
      {
        id: 'character',
        label: getEmbeddedLabel('Character'),
        ...glyph('component'),
        children: [
          { id: 'enemy', label: getEmbeddedLabel('Enemy'), ...glyph('component') },
          { id: 'player', label: getEmbeddedLabel('Player'), ...glyph('component') }
        ]
      },
      { id: 'item', label: getEmbeddedLabel('Item'), ...glyph('component') }
    ]
  },
  { id: 'document', label: getEmbeddedLabel('Document'), ...glyph('space') },
  { id: 'profile', label: getEmbeddedLabel('User profile'), ...glyph('backlog') }
]

// Single and multiple choice in one story: `selected` takes both shapes.
type Props = Omit<ComponentProps<Dropdown>, 'selected'> & { selected?: DropdownItemId | DropdownItemId[] }

// Ready-made setups switched by the `example` control.
const examples = {
  'with icons': { items: priorities, selected: 'high' },
  placeholder: { items: priorities, placeholder, icon: ExampleIcon },
  'text, with search': { items: languages, selected: 'English', withSearch: true },
  multiselect: { items: languages, selected: ['English', 'Deutsch'], multiselect: true, placeholder },
  'auto select': { items: languages, autoSelect: true },
  'allow deselect': { items: priorities, selected: 'high', placeholder, allowDeselect: true },
  nested: { items: classes, selected: 'enemy', withSearch: true }
} satisfies Record<string, Props>

type Args = Partial<Props> & { example: keyof typeof examples }

// Every key any example sets: a key missing from the next example would otherwise keep its old value.
const defaults: Partial<Props> = {
  selected: undefined,
  placeholder: undefined,
  icon: undefined,
  withSearch: false,
  multiselect: false,
  autoSelect: false,
  allowDeselect: undefined
}

const meta: Meta<Args> = {
  title: 'Inputs/Dropdown',
  component: Dropdown,
  args: { example: 'with icons' },
  argTypes: {
    example: { control: 'select', options: Object.keys(examples), description: 'Ready-made setup of the props below' }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** значение поля из списка - одно или несколько (приоритет, язык, тип, режим), в форме, настройках или панели. **Не этот компонент:** действие или значение на обычной кнопке - `MenuButton`; главное действие со связанными - `SplitButton`; 2-5 вариантов на виду - `SegmentedControl`; свой триггер со своим попапом - `SelectButton`.\n\n' +
          'Триггер - `SelectButton` (`kind`, `size`, `fullWidth`, `justify`, `wrap`, `chevron`), список - попап того же вида, что `Menu`. `items` - `DropdownItem` (иконка, описание, `divider`, `heading`, `children` - подменю, `exclusive`), `selected` - id или массив id с `multiselect` (значения через `separator`). `withSearch` - поиск по всем уровням, `autoSelect` - первый пункт, пока ничего не выбрано, `allowDeselect` - повторный клик снимает выбор (`on:deselected`, `detail` - `null`). Слот `value` - своя разметка значения. Открывается кликом, Enter / Space и ↓ / ↑ на кнопке; `on:selected` - id или массив id.'
      }
    }
  },
  render: ({ example, ...props }) => ({ Component: Dropdown, props: { ...defaults, ...examples[example], ...props } })
}

export default meta
type Story = StoryObj<Args>

export const Playground: Story = {}

/** Opened on render; switching `example` while open updates the list in place. */
export const Open: Story = {
  tags: ['!autodocs'],
  play: ({ canvasElement }) => {
    canvasElement.querySelector('button')?.click()
  }
}

export const Variants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        {
          title: 'Sizes',
          component: Dropdown,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { items: priorities, selected: 'high' }
        },
        {
          title: 'States',
          component: Dropdown,
          rows: axis('kind', kinds),
          columns: [
            { title: 'value', props: { selected: 'high' } },
            { title: 'placeholder', props: { placeholder, icon: ExampleIcon } },
            { title: 'multiselect', props: { selected: ['urgent', 'high'], multiselect: true } },
            { title: 'disabled', props: { selected: 'high', disabled: true } },
            { title: 'loading', props: { selected: 'high', loading: true } },
            { title: 'chevron hover', props: { selected: 'high', chevron: 'hover' } }
          ],
          props: { items: priorities }
        },
        {
          title: 'Multiselect separator',
          component: Dropdown,
          rows: axis('kind', kinds),
          columns: axis('separator', ['dot', 'comma', 'none'] as const),
          props: { items: priorities, selected: ['urgent', 'high', 'low'], multiselect: true }
        }
      ]
    }
  })
}

/** `fullWidth` takes the width of the place; the place sets it. `justify` places the value inside. */
export const FullWidth: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({ Component: DropdownFullWidth })
}

/** The `value` slot draws the value markup; `wrap` lets a long value take more lines. */
export const CustomValue: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({ Component: DropdownCustomValue })
}

/** `children`: hovering a parent opens it first and its subclasses under a line; search lists every level flat. */
export const Nested: Story = {
  tags: ['!autodocs'],
  args: { example: 'nested' },
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('button')?.click()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const parent = document.querySelector<HTMLButtonElement>('.hulyPopup-row[aria-haspopup="menu"]')
    parent?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  }
}
