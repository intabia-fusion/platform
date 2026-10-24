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

import { column, issue, minimalIssue, person, status } from '../sample'
import SizedDemo from '../demo/SizedDemo.svelte'
import ColumnHeader from './ColumnHeader.svelte'
import IssueCard from './IssueCard.svelte'
import IssueGroup from './IssueGroup.svelte'
import IssuePage from './IssuePage.svelte'
import IssueRow from './IssueRow.svelte'
import KanbanColumn from './KanbanColumn.svelte'
import NewIssuePopup from './NewIssuePopup.svelte'
import FramedSections from '../FramedSections.svelte'

const meta: Meta = {
  title: 'Kit (pen.dev)/Tracker',
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

const card = (props: object): object => ({ issue: { ...issue, ...props } })

export const IssueCardStates: Story = sections([
  {
    title: 'IssueCard',
    component: IssueCard,
    rows: [
      { title: 'minimal', props: { issue: minimalIssue } },
      { title: 'full', props: card({}) },
      {
        title: 'urgent, no estimate',
        props: card({ priority: 'urgent', estimation: undefined, sub: undefined, labels: undefined })
      },
      {
        title: 'parent and due date',
        props: card({ parent: 'Product card redesign', due: '30 Oct', attachments: 1, comments: 3 })
      },
      { title: 'overdue, accent border', props: card({ due: '2 Oct', overdue: true, accent: '#D95757' }) },
      { title: 'density: detailed', props: { ...card({}), density: 'detailed' } },
      { title: 'density: normal', props: { ...card({}), density: 'normal' } },
      { title: 'density: compact', props: { ...card({}), density: 'compact' } },
      { title: 'density: dense', props: { ...card({}), density: 'dense' } }
    ],
    columns: [{ title: '', props: {} }]
  }
])

export const ColumnHeaderStates: Story = sections([
  {
    title: 'ColumnHeader',
    component: ColumnHeader,
    rows: [
      { title: 'plain', props: { column: { name: 'Backlog', status: status('', 'backlog'), count: 3 } } },
      {
        title: 'WIP limit',
        props: { column: { name: 'In Progress', status: status('', 'active'), count: 6, limit: 8 } }
      },
      {
        title: 'limit exceeded',
        props: { column: { name: 'In Progress', status: status('', 'active'), count: 10, limit: 8, over: true } }
      },
      {
        title: 'action',
        props: {
          column: { name: 'Done', status: status('', 'won'), count: 9, action: { label: 'Release', icon: 'milestone' } }
        }
      },
      {
        title: 'hover tools',
        props: { column: { name: 'In Progress', status: status('', 'active'), count: 5, tools: true } }
      }
    ],
    columns: [{ title: '', props: {} }]
  }
])

export const KanbanColumnStates: Story = sections([
  {
    title: 'KanbanColumn',
    component: KanbanColumn,
    rows: [{ title: 'with statuses', props: { column } }],
    columns: [{ title: '', props: {} }]
  }
])

const sized = (component: unknown, width: number, height: number, props: object): object => ({
  component,
  width,
  height,
  props
})

const row = (props: object): object => ({ issue: { ...issue, created: '2 days ago', modified: 'Oct 21', ...props } })

export const IssueRowStates: Story = sections([
  {
    title: 'IssueRow',
    component: SizedDemo,
    rows: [
      {
        title: 'minimal',
        props: sized(IssueRow, 1200, 46, { issue: { ...minimalIssue, created: 'yesterday', modified: 'Oct 22' } })
      },
      { title: 'full', props: sized(IssueRow, 1200, 46, row({})) },
      {
        title: 'urgent, due date overdue',
        props: sized(IssueRow, 1200, 46, row({ priority: 'urgent', sub: undefined, due: '2 Oct', overdue: true }))
      },
      { title: 'counters', props: sized(IssueRow, 1200, 46, row({ sub: undefined, comments: 3, attachments: 1 })) },
      { title: 'selected', props: sized(IssueRow, 1200, 46, { ...row({ sub: undefined }), selected: true }) }
    ],
    columns: [{ title: '', props: {} }]
  }
])

const done = status('Done', 'won')
const group = {
  name: 'In Progress',
  status: status('In Progress', 'active'),
  estimation: '26h',
  issues: [
    issue,
    {
      ...issue,
      id: 'APP-6',
      title: 'Payment provider integration',
      priority: 'urgent',
      sub: undefined,
      labels: undefined
    }
  ].map((i) => ({ ...i, created: '2 days ago', modified: 'Oct 21' }))
}

export const IssueGroupStates: Story = sections([
  {
    title: 'IssueGroup',
    component: SizedDemo,
    rows: [
      { title: 'with issues', props: sized(IssueGroup, 1200, 136, group) },
      { title: 'collapsed', props: sized(IssueGroup, 1200, 46, { ...group, collapsed: true }) },
      {
        title: 'done',
        props: sized(IssueGroup, 1200, 136, { ...group, name: 'Done', status: done, estimation: '8h' })
      },
      {
        title: 'no issues',
        props: sized(IssueGroup, 1200, 46, { name: 'Canceled', status: status('Canceled', 'lost'), issues: [] })
      }
    ],
    columns: [{ title: '', props: {} }]
  }
])

export const IssuePageStates: Story = sections([
  {
    title: 'IssuePage',
    component: SizedDemo,
    rows: [
      {
        title: 'issue with sub-issues',
        props: sized(IssuePage, 1515, 760, {
          issue: { ...issue, reported: 8 },
          creator: person,
          description: 'Send a push notification to the customer when the status of an order changes.',
          subIssues: [
            {
              ...issue,
              id: 'APP-16',
              title: 'Set up Firebase Cloud Messaging',
              sub: undefined,
              labels: undefined,
              created: '2 days ago',
              modified: 'Oct 21'
            }
          ],
          activity: [{ time: '3:23', text: 'Title set to', strong: issue.title }],
          created: 'Oct 20 2026 3:23 AM'
        })
      }
    ],
    columns: [{ title: '', props: {} }]
  }
])

export const NewIssuePopupStates: Story = sections([
  {
    title: 'NewIssuePopup',
    component: SizedDemo,
    rows: [{ title: 'empty', props: sized(NewIssuePopup, 732, 400, { project: 'Mobile App' }) }],
    columns: [{ title: '', props: {} }]
  }
])
