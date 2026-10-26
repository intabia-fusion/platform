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

import Button from './Button.svelte'
import ClassicButton from './ClassicButton.svelte'
import Modal from './Modal.svelte'
import MenuDemo from '../demo/MenuDemo.svelte'
import Switcher from './Switcher.svelte'
import FramedSections from '../FramedSections.svelte'

const meta: Meta = {
  title: 'Kit (pen.dev)/Actions',
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

const kinds = ['primary', 'secondary', 'tertiary', 'ghost', 'negative', 'brand']
const sizes = ['large', 'medium', 'small', 'extra-small']

export const ButtonStates: Story = sections([
  {
    title: 'Button - kinds and sizes',
    component: Button,
    rows: axis('kind', kinds),
    columns: axis('size', sizes),
    props: { label: 'Button', icon: 'plus' }
  },
  {
    title: 'Button - icon only',
    component: Button,
    rows: axis('kind', kinds),
    columns: axis('size', sizes),
    props: { icon: 'gear' }
  },
  {
    title: 'Button - states',
    component: Button,
    rows: axis('kind', ['primary', 'secondary']),
    columns: [
      { title: 'default', props: {} },
      { title: 'pressed', props: { pressed: true } },
      { title: 'menu', props: { menu: true } }
    ],
    props: { label: 'Button' }
  }
])

export const SwitcherStates: Story = sections([
  {
    title: 'Switcher',
    component: Switcher,
    rows: [
      { title: 'labels', props: { items: ['All', 'Active', 'Backlog'], selected: 'Active' } },
      { title: 'icons', props: { items: ['kit/BulletList', 'kit/Kanban'], selected: 'kit/Kanban' } }
    ],
    columns: [{ title: '', props: {} }]
  }
])

export const MenuStates: Story = sections([
  {
    title: 'Menu - popup under its button',
    component: MenuDemo,
    rows: [
      {
        title: 'sections',
        props: {
          items: [
            { header: 'Boards' },
            { label: 'Main board', icon: 'board', hint: 'APP · MKT', selected: true },
            { label: 'Release 1.0', icon: 'board', hover: true },
            { divider: true },
            { label: 'Create board', icon: 'plus', accent: true }
          ]
        }
      }
    ],
    columns: [{ title: '', props: { label: 'Boards', width: 300 } }]
  }
])

export const ClassicButtonStates: Story = sections([
  {
    title: 'ClassicButton - kinds and sizes',
    component: ClassicButton,
    rows: axis('kind', ['regular', 'primary', 'dangerous', 'ghost']),
    columns: axis('size', ['small', 'medium', 'large']),
    props: { label: 'Button' }
  },
  {
    title: 'ClassicButton - icon and menu',
    component: ClassicButton,
    rows: axis('kind', ['regular', 'primary']),
    columns: [
      { title: 'icon', props: { icon: 'kit/PencilLine' } },
      { title: 'icon and label', props: { icon: 'kit/PersonCircle', label: 'Assignee' } },
      { title: 'menu', props: { label: 'Owner', menu: true } },
      { title: 'disabled', props: { label: 'Owner', disabled: true } }
    ],
    props: { size: 'medium' }
  }
])

export const ModalStates: Story = sections([
  {
    title: 'Modal',
    component: Modal,
    rows: [{ title: 'dialog', props: { title: 'Edit project' } }],
    columns: [{ title: '', props: {} }]
  }
])
