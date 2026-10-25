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

import { categories, priorities, status } from '../sample'
import CalloutDemo from '../demo/CalloutDemo.svelte'
import Count from './Count.svelte'
import EmptyState from './EmptyState.svelte'
import KitStatusIcon from './KitStatusIcon.svelte'
import Notice from './Notice.svelte'
import PriorityIcon from './PriorityIcon.svelte'
import StatusChip from './StatusChip.svelte'
import StatusIcon from './StatusIcon.svelte'
import Steps from './Steps.svelte'
import FramedSections from '../FramedSections.svelte'

const meta: Meta = {
  title: 'Kit (pen.dev)/Status',
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

export const StatusIconStates: Story = sections([
  {
    title: 'StatusIcon - by category',
    component: StatusIcon,
    rows: [{ title: 'status', props: {} }],
    columns: categories.map((category) => ({ title: category, props: { status: status('', category) } }))
  },
  {
    title: 'StatusIcon - own color',
    component: StatusIcon,
    rows: [{ title: 'active', props: {} }],
    columns: ['Cerulean', 'Orange', 'Grass'].map((color) => ({
      title: color,
      props: { status: { category: 'active', color } }
    }))
  }
])

export const PriorityIconStates: Story = sections([
  {
    title: 'Priority',
    component: PriorityIcon,
    rows: [{ title: 'icon', props: {} }],
    columns: axis('priority', priorities)
  }
])

export const StatusChipStates: Story = sections([
  {
    title: 'StatusChip',
    component: StatusChip,
    rows: [
      { title: 'chip', props: {} },
      { title: 'with count', props: { count: 7 } },
      { title: 'draggable', props: { count: 7, draggable: true } },
      { title: 'block', props: { count: 7, draggable: true, block: true } }
    ],
    columns: [
      { title: 'backlog', props: { status: status('Backlog', 'backlog') } },
      { title: 'active', props: { status: status('In Progress', 'active') } },
      { title: 'won', props: { status: status('Done', 'won') } }
    ]
  }
])

export const NoticeStates: Story = sections([
  {
    title: 'Notice',
    component: Notice,
    rows: axis('kind', ['warning', 'info', 'negative']),
    columns: [
      { title: 'box', props: { text: 'Project can be restored from the archive' } },
      { title: 'pill', props: { text: '2 statuses without a column', pill: true } }
    ]
  }
])

export const CountStates: Story = sections([
  { title: 'Count', component: Count, rows: [{ title: 'value', props: {} }], columns: axis('value', [1, 12, 148]) }
])

export const CalloutStates: Story = sections([
  {
    title: 'Callout',
    component: CalloutDemo,
    rows: axis('tone', ['info', 'positive', 'warning', 'error']),
    columns: [
      { title: 'text', props: { width: 420 } },
      { title: 'title', props: { title: 'Archive', width: 420 } },
      { title: 'actions', props: { actions: true, width: 420 } }
    ]
  }
])

export const KitStatusIconStates: Story = sections([
  {
    title: 'StatusIcon (product)',
    component: KitStatusIcon,
    rows: axis('tone', ['positive', 'negative', 'error', 'warning', 'info', 'neutral']),
    columns: [
      { title: 'solid', props: {} },
      { title: 'outline', props: { kind: 'outline' } },
      { title: 'medium', props: { size: 'medium' } },
      { title: 'dot', props: { dot: true } }
    ]
  }
])

export const StepsStates: Story = sections([
  {
    title: 'Steps',
    component: Steps,
    rows: [
      { title: 'none current', props: { selected: -1 } },
      { title: 'first', props: { selected: 0 } },
      { title: 'second', props: { selected: 1 } },
      { title: 'last', props: { selected: 2 } }
    ],
    columns: [{ title: '', props: { items: ['Select file', 'Map statuses', 'Review'] } }]
  }
])

export const EmptyStateStates: Story = sections([
  {
    title: 'EmptyState - large',
    component: EmptyState,
    rows: axis('kind', ['brand', 'plate']),
    columns: [
      {
        title: '',
        props: {
          label: 'No issues',
          description: 'Create the first issue',
          icon: 'ui/Add',
          size: 'large',
          width: 420,
          height: 240
        }
      }
    ]
  },
  {
    title: 'EmptyState - small',
    component: EmptyState,
    rows: [
      { title: 'plate', props: {} },
      { title: 'action', props: { action: 'Add application' } }
    ],
    columns: [{ title: '', props: { label: 'No applications yet', size: 'small', width: 420 } }]
  }
])
