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
import { IconCopy, IconDelete, IconEdit, IconOptions, IconSettings, IconShare } from '@hcengineering/ui'
import { MenuButton } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'
import type { ComponentProps } from 'svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['primary', 'secondary', 'tertiary', 'negative'] as const
const sizes = ['large', 'medium', 'small', 'extra-small', 'min'] as const
const view = getEmbeddedLabel('View')
const settings = { label: getEmbeddedLabel('Settings') }
const views = [
  { id: 'list', label: getEmbeddedLabel('List') },
  { id: 'board', label: getEmbeddedLabel('Board') },
  { id: 'table', label: getEmbeddedLabel('Table') }
]
const actions = [
  { id: 'edit', label: getEmbeddedLabel('Edit'), icon: IconEdit },
  { id: 'copy', label: getEmbeddedLabel('Copy link'), icon: IconCopy },
  { id: 'share', label: getEmbeddedLabel('Share'), icon: IconShare },
  { id: 'delete', label: getEmbeddedLabel('Delete'), icon: IconDelete }
]

// Ready-made setups switched by the `example` control.
const examples = {
  'select view': { items: views, selected: 'list', label: view, icon: IconOptions },
  'actions with icons': { items: actions, noSelection: true, icon: IconSettings, tooltip: settings },
  'text only': { items: views, selected: 'list', label: view, kind: 'tertiary' },
  'single item, auto select': { items: [views[0]], label: view, icon: IconOptions, autoSelectSingle: true }
} satisfies Record<string, ComponentProps<MenuButton>>

type Args = Partial<ComponentProps<MenuButton>> & { example: keyof typeof examples }

// Every key any example sets: a key missing from the next example would otherwise keep its old value.
const defaults: Partial<ComponentProps<MenuButton>> = {
  selected: undefined,
  label: undefined,
  icon: undefined,
  tooltip: undefined,
  kind: undefined,
  noSelection: false,
  autoSelectSingle: false
}

const meta: Meta<Args> = {
  title: 'UI Kit/MenuButton',
  component: MenuButton,
  args: { example: 'select view' },
  argTypes: {
    example: { control: 'select', options: Object.keys(examples), description: 'Ready-made setup of the props below' }
  },
  render: ({ example, ...props }) => ({ Component: MenuButton, props: { ...defaults, ...examples[example], ...props } })
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
          component: MenuButton,
          rows: axis('kind', kinds),
          columns: axis(
            'size',
            sizes.filter((size) => size !== 'min')
          ),
          props: { items: views, label: view, icon: IconOptions }
        },
        {
          title: 'Icon only',
          component: MenuButton,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { items: actions, icon: IconSettings, tooltip: settings }
        },
        {
          title: 'States',
          component: MenuButton,
          rows: axis('kind', kinds),
          columns: [
            { title: 'default', props: {} },
            { title: 'loading', props: { loading: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { items: views, label: view, icon: IconOptions }
        }
      ]
    }
  })
}
