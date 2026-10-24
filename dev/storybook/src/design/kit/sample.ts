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

// Sample data of the kit stories, in the shape of the demo data
import type { Column, Issue, Person, Status, StatusCategory } from './types'

export const categories: StatusCategory[] = ['backlog', 'todo', 'active', 'won', 'lost']
export const priorities = ['none', 'urgent', 'high', 'medium', 'low'] as const

export const person: Person = { name: 'Anna Smirnova', initials: 'AS', color: 'Blueberry' }
export const people: Person[] = [
  person,
  { name: 'Maria Kozlova', initials: 'MK', color: 'Grass' },
  { name: 'Ivan Petrov', initials: 'IP', color: 'Orange' }
]

export const status = (name: string, category: StatusCategory): Status => ({ name, category })

export const issue: Issue = {
  id: 'APP-3',
  title: 'Push notifications for order status',
  status: status('In Progress', 'active'),
  priority: 'high',
  assignee: person,
  sub: [1, 2],
  component: 'iOS',
  milestone: 'Release 1.0',
  labels: [['urgent', 'Orange']],
  estimation: 13,
  reported: 5
}

export const minimalIssue: Issue = {
  id: 'APP-10',
  title: 'Biometric login (Face ID / fingerprint)',
  status: status('Backlog', 'backlog'),
  priority: 'none'
}

export const column: Column = {
  name: 'In Progress',
  status: status('In Progress', 'active'),
  count: 3,
  statuses: [{ status: status('In Progress', 'active') }, { status: status('Development', 'active') }],
  issues: [issue, { ...issue, id: 'APP-6', title: 'Payment provider integration', priority: 'urgent', sub: undefined }]
}
