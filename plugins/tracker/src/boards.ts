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

import core, {
  AggregateValue,
  AggregateValueData,
  type AccountUuid,
  type Doc,
  type Ref,
  type SortingOrder,
  type Status,
  type StatusCategory
} from '@hcengineering/core'
import task from '@hcengineering/task'
import type { Preference } from '@hcengineering/preference'
import type { Project } from './index'

/**
 * @public
 */
export type BoardVisibility = 'all' | 'me'

/**
 * Card layouts from the most to the least detailed.
 * @public
 */
export type CardDensity = 'detailed' | 'normal' | 'compact' | 'dense'

export const cardDensities: readonly CardDensity[] = ['detailed', 'normal', 'compact', 'dense']

export const defaultCardDensity: CardDensity = 'detailed'

/**
 * Fields a board card may show: the keys of the kanban viewlet config plus the parent issue.
 * @public
 */
export type CardField =
  | 'priority'
  | 'subIssues'
  | 'dueDate'
  | 'component'
  | 'milestone'
  | 'labels'
  | 'estimation'
  | 'attachments'
  | 'comments'
  | 'parent'

export const cardFields: readonly CardField[] = [
  'priority',
  'subIssues',
  'dueDate',
  'component',
  'milestone',
  'labels',
  'estimation',
  'attachments',
  'comments',
  'parent'
]

/**
 * Conditions of a board: JSON of `Filter[]`, the same form `FilteredView.filters` keeps.
 * An empty string means no conditions.
 * @public
 */
export type BoardCondition = string

/**
 * @public
 */
export interface BoardColumn {
  // Stable key: a column can be renamed or reordered
  id: string
  title: string
  category: Ref<StatusCategory>
  statuses: Ref<Status>[]
  // Work in progress limit; the column goes red when it holds more cards
  limit?: number
}

/**
 * Issue fields a board may group its lanes by, one lane per value.
 * @public
 */
export type BoardSwimLaneField = 'assignee' | 'priority' | 'component' | 'milestone' | 'attachedTo' | 'space'

export const boardSwimLaneFields: readonly BoardSwimLaneField[] = [
  'assignee',
  'priority',
  'component',
  'milestone',
  'attachedTo',
  'space'
]

/**
 * A card goes to the first lane its condition fits.
 * The last lane takes the rest and ignores its condition.
 * @public
 */
export interface BoardSwimlane {
  id: string
  title: string
  condition: BoardCondition
}

/**
 * @public
 */
export interface BoardQuickFilter {
  id: string
  title: string
  condition: BoardCondition
}

/**
 * The first rule a card fits sets the color of its border.
 * @public
 */
export interface BoardColorRule {
  id: string
  // Index in the platform palette
  color: number
  condition: BoardCondition
}

/**
 * Saved kanban setup: which issues, columns, lanes, quick filters and card colors.
 * @public
 */
export interface Board extends Doc {
  title: string
  description?: string
  projects: Ref<Project>[]
  visibility: BoardVisibility
  author: AccountUuid
  // Users the author allowed to change the board
  editors: AccountUuid[]
  filter: BoardCondition
  columns: BoardColumn[]
  swimlanes: BoardSwimlane[]
  // Lanes by a field win over `swimlanes`; not set or null: lanes by conditions, or none
  swimLaneBy?: BoardSwimLaneField | null
  quickFilters: BoardQuickFilter[]
  colorRules: BoardColorRule[]
  // Layout of cards for those who did not pick their own
  density: CardDensity
  // Fields the cards show; not set on boards made before the setting: every field
  cardFields?: CardField[]
  // Card order: a field of the kanban sorting and its direction; not set: the order of the view options
  orderBy?: [string, SortingOrder]
}

/**
 * A board a user pinned to the top of the list.
 * @public
 */
export interface BoardPreference extends Preference {
  attachedTo: Ref<Board>
}

const openCategories = new Set<Ref<StatusCategory>>([
  task.statusCategory.UnStarted,
  task.statusCategory.ToDo,
  task.statusCategory.Active
])

export function isCardDensity (value: unknown): value is CardDensity {
  return cardDensities.includes(value as CardDensity)
}

// The user's own pick wins, then the board's. `compactMode` is the old toggle of the kanban view options.
export function resolveCardDensity (
  user: unknown,
  board: CardDensity | undefined,
  legacyCompact: boolean = false
): CardDensity {
  if (isCardDensity(user)) return user
  if (legacyCompact) return 'compact'
  return board ?? defaultCardDensity
}

export function isCardFieldVisible (visible: CardField[] | undefined, field: CardField): boolean {
  return visible === undefined || visible.includes(field)
}

// The field set after a checkbox click, in the order of `cardFields`.
export function toggleCardField (visible: CardField[] | undefined, field: CardField, on: boolean): CardField[] {
  return cardFields.filter((f) => (f === field ? on : isCardFieldVisible(visible, f)))
}

export function canEditBoard (board: Pick<Board, 'author' | 'editors'>, account: AccountUuid): boolean {
  // A board written past the client (REST, API) may come without editors
  return board.author === account || (board.editors ?? []).includes(account)
}

export function isBoardAvailable (board: Pick<Board, 'author' | 'visibility'>, account: AccountUuid): boolean {
  return board.visibility === 'all' || board.author === account
}

// Pinned boards go first, the rest keep their order.
export function sortBoards<T extends Pick<Board, '_id'>> (boards: T[], pinned: ReadonlySet<Ref<Board>>): T[] {
  return [...boards.filter((b) => pinned.has(b._id)), ...boards.filter((b) => !pinned.has(b._id))]
}

export function pickDefaultBoard<T extends Pick<Board, '_id' | 'author' | 'visibility' | 'projects'>> (
  boards: T[],
  project: Ref<Project> | undefined,
  account: AccountUuid,
  pinned: ReadonlySet<Ref<Board>> = new Set()
): T | undefined {
  const available = boards.filter(
    (b) => isBoardAvailable(b, account) && (project === undefined || b.projects.includes(project))
  )
  return sortBoards(available, pinned)[0]
}

// A status in several columns belongs to the first one.
export function columnIndexByStatus (columns: Pick<BoardColumn, 'statuses'>[]): Map<Ref<Status>, number> {
  const result = new Map<Ref<Status>, number>()
  columns.forEach((column, index) => {
    for (const status of column.statuses) {
      if (!result.has(status)) result.set(status, index)
    }
  })
  return result
}

// Open statuses with no column: their issues vanish from the board unnoticed.
// Closed ones may stay out by design.
export function statusesWithoutColumn<T extends Pick<Status, '_id' | 'category'>> (
  columns: Pick<BoardColumn, 'statuses'>[],
  statuses: T[]
): T[] {
  const placed = columnIndexByStatus(columns)
  return statuses.filter((s) => s.category !== undefined && openCategories.has(s.category) && !placed.has(s._id))
}

export function isOverLimit (count: number, limit: number | undefined): boolean {
  return limit !== undefined && limit > 0 && count > limit
}

// The lane of a card: the first lane it fits, the last lane takes the rest.
export function pickSwimlane<T extends { id: string }> (lanes: T[], fits: (lane: T) => boolean): T | undefined {
  if (lanes.length === 0) return undefined
  return lanes.slice(0, -1).find(fits) ?? lanes[lanes.length - 1]
}

// One kanban category per board column; the kanban groups issues by its statuses.
export function columnCategory (column: BoardColumn): AggregateValue {
  // groupBy renames a status group to its value name, so every value carries the column id
  return new AggregateValue(
    column.id,
    column.statuses.map((status) => new AggregateValueData(column.id, status, core.space.Workspace))
  )
}

// First status of the column the issue may take; the one it has when the column already holds it.
export function columnStatusFor (
  column: BoardColumn,
  current: Ref<Status>,
  allowed: Array<Ref<Status>> | undefined
): Ref<Status> | undefined {
  if (column.statuses.includes(current)) return current
  return column.statuses.find((s) => allowed === undefined || allowed.includes(s))
}

// One issue per rule that gets the rule's border: it fits the rule and no rule above it.
export function pickRuleSamples (
  rules: Array<{ id: string }>,
  idsOf: (rule: string) => ReadonlySet<Ref<Doc>> | undefined
): Map<string, Ref<Doc> | undefined> {
  const result = new Map<string, Ref<Doc> | undefined>()
  const above: Array<ReadonlySet<Ref<Doc>>> = []
  for (const rule of rules) {
    const ids = idsOf(rule.id)
    result.set(rule.id, ids === undefined ? undefined : [...ids].find((d) => !above.some((a) => a.has(d))))
    if (ids !== undefined) above.push(ids)
  }
  return result
}
