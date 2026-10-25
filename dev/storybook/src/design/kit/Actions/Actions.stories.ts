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
import ButtonGroup from './ButtonGroup.svelte'
import ClassicButton from './ClassicButton.svelte'
import Modal from './Modal.svelte'
import WizardBar from './WizardBar.svelte'
import WizardDialog from './WizardDialog.svelte'
import DialogDemo from '../demo/DialogDemo.svelte'
import MenuDemo from '../demo/MenuDemo.svelte'
import WizardDemo from '../demo/WizardDemo.svelte'
import SegmentedControl from './SegmentedControl.svelte'
import Switcher from './Switcher.svelte'
import Tabs from './Tabs.svelte'
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
      },
      {
        title: 'description, color',
        props: {
          items: [
            { label: 'All messages', description: 'Every new message and reply', selected: true },
            { label: 'Only mentions', description: 'When someone mentions you' },
            { label: 'Offer', color: 'Orange' },
            { label: 'Done', color: 'Grass' }
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
    rows: axis('kind', ['regular', 'primary', 'positive', 'dangerous', 'ghost']),
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
      { title: 'icon after label', props: { label: 'Next', iconRight: 'ui/ArrowRight' } },
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

const wizardSteps = ['Basics', 'Members and access', 'Issues', 'Workflow']

export const WizardStates: Story = sections([
  {
    title: 'WizardBar',
    component: WizardBar,
    rows: wizardSteps.map((_, i) => ({ title: `step ${i + 1}`, props: { step: i } })),
    columns: [{ title: '', props: { steps: wizardSteps } }]
  },
  {
    title: 'WizardDialog',
    component: WizardDialog,
    rows: [
      { title: 'first step', props: { step: 0 } },
      { title: 'next disabled', props: { step: 0, canProceed: false } },
      { title: 'middle step', props: { step: 1 } },
      { title: 'last step', props: { step: 3 } }
    ],
    columns: [{ title: '', props: { title: 'Create project', steps: wizardSteps } }]
  }
])

export const DialogStates: Story = sections([
  {
    title: 'Dialog - widths',
    component: DialogDemo,
    rows: axis('width', [400, 480, 600]),
    columns: [{ title: '', props: { submitLabel: 'Archive' } }]
  },
  {
    title: 'Dialog - footer',
    component: DialogDemo,
    rows: [
      { title: 'cancel + submit', props: {} },
      { title: 'canSubmit false', props: { canSubmit: false } },
      { title: 'submitKind negative', props: { submitKind: 'negative', submitLabel: 'Archive' } },
      { title: 'own labels', props: { submitLabel: 'Save', cancelLabel: 'Discard' } },
      { title: 'footer false', props: { footer: false } }
    ],
    columns: [{ title: 'small', props: { width: 480 } }]
  }
])

export const KitWizardDialogStates: Story = sections([
  {
    title: 'WizardDialog (product)',
    component: WizardDemo,
    rows: [
      { title: 'first step', props: { selected: 0 } },
      { title: 'next blocked', props: { selected: 1, canProceed: false } },
      { title: 'last step', props: { selected: 2, submitLabel: 'Import' } }
    ],
    columns: [{ title: '', props: { width: 720 } }]
  }
])

export const TabsStates: Story = sections([
  {
    title: 'Tabs',
    component: Tabs,
    rows: axis('size', ['medium', 'small']),
    columns: [
      { title: 'labels', props: { items: ['Issues', 'Board', 'Milestones'], selected: 'Board' } },
      {
        title: 'icons',
        props: {
          items: [
            ['Issues', 'tracker/issues'],
            ['Board', 'task/kanban']
          ],
          selected: 'Issues'
        }
      }
    ]
  }
])

export const SegmentedControlStates: Story = sections([
  {
    title: 'SegmentedControl',
    component: SegmentedControl,
    rows: axis('size', ['medium', 'small', 'extra-small']),
    columns: [
      { title: 'labels', props: { items: ['Day', 'Week', 'Month'], selected: 'Week' } },
      { title: 'badge', props: { items: ['Monthly', ['Yearly', undefined, '-20%']], selected: 'Yearly' } },
      {
        title: 'icon only',
        props: {
          items: [
            ['List', 'tracker/list'],
            ['Board', 'task/kanban']
          ],
          selected: 'List',
          iconOnly: true
        }
      }
    ]
  }
])

export const ButtonGroupStates: Story = sections([
  {
    title: 'ButtonGroup',
    component: ButtonGroup,
    rows: axis('kind', ['secondary', 'ghost']),
    columns: [
      {
        title: 'labels',
        props: {
          items: [
            ['List', 'tracker/list'],
            ['Board', 'task/kanban']
          ],
          selected: 'List'
        }
      },
      {
        title: 'icon only',
        props: {
          items: [
            ['', 'tracker/list'],
            ['', 'task/kanban']
          ],
          selected: 'task/kanban'
        }
      },
      { title: 'small', props: { items: ['Day', 'Week'], selected: 'Day', size: 'small' } }
    ]
  }
])
