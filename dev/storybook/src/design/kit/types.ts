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

// Domain shapes of the visual component library: the same structure as the demo data (dev/design/kit/05-demo.generated.js),
// never layout (x, y, width, height).

export type StatusCategory = 'backlog' | 'todo' | 'active' | 'won' | 'lost'
// Card density of a board: all fields, no labels and estimation line, attributes as icons, one line
export type Density = 'detailed' | 'normal' | 'compact' | 'dense'
export type Priority = 'none' | 'urgent' | 'high' | 'medium' | 'low'

// Icon by name: a hand-drawn kit icon ('gear'), a sprite id ('tracker/parent-issue'), a ui kit sprite icon ('kit/Plus') or a ui icon ('ui/Mixin')
export type IconName = string

export interface Status {
  name?: string
  category: StatusCategory
  // PaletteColorIndexes name; the category color when absent
  color?: string
}

export interface Person {
  name?: string
  initials: string
  // PaletteColorIndexes name
  color: string
}

// [name, PaletteColorIndexes name]
export type Label = [string, string]

export interface Issue {
  id: string
  title: string
  status: Status
  priority: Priority
  assignee?: Person
  parent?: string
  // [done, total]
  sub?: [number, number]
  component?: string
  milestone?: string
  labels?: Label[]
  estimation?: number
  reported?: number
  // Prefix of the estimation line of a detailed card, 'Оценка' when absent
  estimationLabel?: string
  due?: string
  overdue?: boolean
  attachments?: number
  comments?: number
  unread?: boolean
  // Border color of the card, set by a board color rule
  accent?: string
  // List row dates: relative creation time and last modification
  created?: string
  modified?: string
}

export interface Column {
  name: string
  status: Status
  count: number
  limit?: number
  // The WIP limit is exceeded
  over?: boolean
  // Statuses grouped into the column, shown under its header
  statuses?: Array<{ status: Status, count?: number }>
  issues?: Issue[]
  // Hover tools of the header
  tools?: boolean
  action?: { label: string, icon?: IconName }
}

export interface AppEntry {
  icon: IconName
  label?: string
  selected?: boolean
  notify?: boolean
  // A divider follows the entry
  divider?: boolean
}

export type NavEntry =
  | { item: string, icon?: IconName, selected?: boolean, indent?: boolean, count?: string | number, object?: boolean }
  | { divider: true, tight?: boolean }
  | { caption: string, chevron?: boolean, menu?: boolean, compact?: boolean, noDivider?: boolean }
  | { group: string, add?: boolean }
  | { space: string, icon?: IconName, color?: string }

export interface FilterCondition {
  field: string
  op: string
  value: string[]
}

export interface MenuEntry {
  label?: string
  header?: string
  icon?: IconName
  // Second line under the label
  description?: string
  // PaletteColorIndexes name: a swatch in place of the icon
  color?: string
  hint?: string
  accent?: boolean
  selected?: boolean
  hover?: boolean
  divider?: boolean
}

export interface TableColumn {
  title: string
  // Column width in px; a column is a data-like part of the table spec
  width: number
}
