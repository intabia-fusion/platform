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
  generateId,
  getCurrentAccount,
  mergeQueries,
  type Doc,
  type DocumentQuery,
  type Ref,
  type Status,
  type TxOperations
} from '@hcengineering/core'
import { createQuery, type LiveQuery } from '@hcengineering/presentation'
import task from '@hcengineering/task'
import { defaultCardDensity, type Board, type BoardColumn, type Issue, type Project } from '@hcengineering/tracker'
import { getCurrentResolvedLocation, navigate } from '@hcengineering/ui'
import tracker from './plugin'
import { filtersToQuery, parseFilters } from '@hcengineering/view-resources'

// Context key under which the board page hands its board to the kanban view.
export const boardContextKey = 'tracker-board'

export async function conditionToQuery (
  client: TxOperations,
  condition: string,
  onUpdate: () => void
): Promise<DocumentQuery<Issue>> {
  return (await filtersToQuery(client, {}, parseFilters(condition), onUpdate)) as DocumentQuery<Issue>
}

// Issues of the board: its projects, its filter, and the quick filters that are on.
export async function boardQuery (
  client: TxOperations,
  board: Board,
  activeQuickFilters: ReadonlySet<string>,
  onUpdate: () => void
): Promise<DocumentQuery<Issue>> {
  let query: DocumentQuery<Issue> = { space: { $in: board.projects } }
  for (const condition of [
    board.filter,
    ...board.quickFilters.filter((q) => activeQuickFilters.has(q.id)).map((q) => q.condition)
  ]) {
    if (condition !== '') query = mergeQueries(query, await conditionToQuery(client, condition, onUpdate))
  }
  return query
}

export interface ConditionItem {
  id: string
  condition: string
}

// Ids of the issues that fit each condition, kept by live queries.
// Lanes and card colors are chosen from them.
export class ConditionMatches {
  readonly ids = new Map<string, Set<Ref<Doc>>>()
  private readonly queries = new Map<string, { key: string, query: LiveQuery }>()
  private seq = 0
  // Queries are being created: their answers are not in yet
  private pending = false

  constructor (private readonly onChange: () => void) {}

  get ready (): boolean {
    return !this.pending && this.ids.size === this.queries.size
  }

  async sync (client: TxOperations, items: ConditionItem[], scope: DocumentQuery<Issue>): Promise<void> {
    const seq = ++this.seq
    const scopeKey = JSON.stringify(scope)
    const wanted = new Map(items.filter((i) => i.condition !== '').map((i) => [i.id, i]))
    for (const [id, entry] of this.queries) {
      if (wanted.get(id) !== undefined && entry.key === `${scopeKey}|${wanted.get(id)?.condition}`) continue
      entry.query.unsubscribe()
      this.queries.delete(id)
      this.ids.delete(id)
    }
    const fresh = Array.from(wanted.values()).filter((i) => !this.queries.has(i.id))
    this.pending = fresh.length > 0
    for (const item of fresh) {
      const query = await conditionToQuery(client, item.condition, () => {})
      // A newer sync owns the queries: this one is stale
      if (seq !== this.seq) return
      const lq = createQuery(true)
      this.queries.set(item.id, { key: `${scopeKey}|${item.condition}`, query: lq })
      lq.query(
        tracker.class.Issue,
        mergeQueries(scope, query),
        (res) => {
          this.ids.set(item.id, new Set(res.map((it) => it._id)))
          this.onChange()
        },
        { projection: { _id: 1 } }
      )
    }
    this.pending = false
    this.onChange()
  }

  has (id: string, doc: Ref<Doc>): boolean {
    return this.ids.get(id)?.has(doc) === true
  }

  destroy (): void {
    this.seq++
    for (const { query } of this.queries.values()) query.unsubscribe()
    this.queries.clear()
    this.ids.clear()
  }
}

// Special view of the project issues; a board opened there sits after it in the path
const projectIssues = 'issues'

// `tab` opens the settings on that tab. A board open in the project issues stays there
// with its settings, unless `page` asks for the board page.
export function boardLocation (
  id: Ref<Board> | undefined,
  settings: boolean = false,
  tab?: string,
  page: boolean = false
): void {
  const loc = getCurrentResolvedLocation()
  if (!page && loc.path[4] === projectIssues && loc.path[5] !== undefined) {
    projectBoardLocation(id, settings, tab)
    return
  }
  loc.path[3] = 'boards'
  loc.path.length = 4
  if (id !== undefined) {
    loc.path[4] = id
    if (settings) loc.path[5] = 'settings'
  }
  loc.query = settings && tab !== undefined ? { tab } : undefined
  loc.fragment = undefined
  navigate(loc)
}

// The board in place of the view of the project issues: tracker/<project>/issues/<board>.
// Without `id` the project issues get their own view back.
export function projectBoardLocation (id: Ref<Board> | undefined, settings: boolean = false, tab?: string): void {
  const loc = getCurrentResolvedLocation()
  loc.path.length = 5
  if (id !== undefined) {
    loc.path[5] = id
    if (settings) loc.path[6] = 'settings'
  }
  loc.query = settings && tab !== undefined ? { tab } : undefined
  loc.fragment = undefined
  navigate(loc)
}

// New board with one column per status of the project, in the order of the project.
export async function createBoard (
  client: TxOperations,
  title: string,
  project: Project | undefined,
  statuses: Status[]
): Promise<Ref<Board>> {
  const columns: BoardColumn[] = statuses.map((status) => ({
    id: generateId(),
    title: status.name,
    category: status.category ?? task.statusCategory.UnStarted,
    statuses: [status._id]
  }))
  return await client.createDoc(tracker.class.Board, core.space.Workspace, {
    title,
    projects: project !== undefined ? [project._id] : [],
    visibility: 'all',
    author: getCurrentAccount().uuid,
    editors: [],
    filter: '',
    columns,
    swimlanes: [],
    quickFilters: [],
    colorRules: [],
    density: defaultCardDensity
  })
}

export async function togglePinned (client: TxOperations, board: Ref<Board>): Promise<void> {
  const current = await client.findOne(tracker.class.BoardPreference, { attachedTo: board })
  if (current !== undefined) await client.remove(current)
  else await client.createDoc(tracker.class.BoardPreference, core.space.Workspace, { attachedTo: board })
}
