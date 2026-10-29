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

import { getCurrentEmployeeSpace } from '@hcengineering/contact'
import core, {
  getCurrentAccount,
  mergeQueries,
  type AccountUuid,
  type Data,
  type Doc,
  type DocumentQuery,
  type Ref,
  type Space,
  type Status,
  type TxOperations
} from '@hcengineering/core'
import { setPlatformStatus, unknownError } from '@hcengineering/platform'
import { createQuery, type LiveQuery } from '@hcengineering/presentation'
import {
  defaultCardDensity,
  type Board,
  type BoardColumn,
  type BoardVisibility,
  type Issue,
  type Project
} from '@hcengineering/tracker'
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
  board: Pick<Board, 'projects' | 'filter' | 'quickFilters'>,
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
  private readonly queries = new Map<string, { key: string, query: LiveQuery, version: number, pending: boolean }>()

  private syncVersion = 0

  constructor (private readonly onChange: () => void) {}

  get ready (): boolean {
    return this.ids.size === this.queries.size && [...this.queries.values()].every((entry) => !entry.pending)
  }

  async sync (client: TxOperations, items: ConditionItem[], scope: DocumentQuery<Issue>): Promise<void> {
    const syncVersion = ++this.syncVersion
    const scopeKey = JSON.stringify(scope)
    const wanted = new Map(items.filter((i) => i.condition !== '').map((i) => [i.id, i]))
    for (const [id, entry] of this.queries) {
      if (wanted.get(id) !== undefined && entry.key === `${scopeKey}|${wanted.get(id)?.condition}`) continue
      entry.query.unsubscribe()
      this.queries.delete(id)
      this.ids.delete(id)
    }
    const updates: Array<Promise<void>> = []
    for (const item of wanted.values()) {
      if (this.queries.has(item.id)) continue
      const entry = {
        key: `${scopeKey}|${item.condition}`,
        query: createQuery(true),
        version: 0,
        pending: true
      }
      this.queries.set(item.id, entry)
      const refresh = async (): Promise<void> => {
        if (this.queries.get(item.id) !== entry) return
        const version = ++entry.version
        entry.pending = true
        const query = await conditionToQuery(client, item.condition, () => {
          void refresh()
        })
        // A removed condition or a newer compilation owns the result now.
        if (this.queries.get(item.id) !== entry || version !== entry.version) return
        const updated = entry.query.query(
          tracker.class.Issue,
          mergeQueries(scope, query),
          (res) => {
            if (this.queries.get(item.id) !== entry) return
            entry.pending = false
            this.ids.set(item.id, new Set(res.map((it) => it._id)))
            this.onChange()
          },
          { projection: { _id: 1 } }
        )
        if (!updated) entry.pending = false
        this.onChange()
      }
      updates.push(refresh())
    }
    await Promise.all(updates)
    if (syncVersion === this.syncVersion) this.onChange()
  }

  has (id: string, doc: Ref<Doc>): boolean {
    return this.ids.get(id)?.has(doc) === true
  }

  destroy (): void {
    this.syncVersion++
    for (const { query } of this.queries.values()) query.unsubscribe()
    this.queries.clear()
    this.ids.clear()
  }
}

// `tab` opens the settings on that tab
export function boardLocation (id: Ref<Board> | undefined, settings: boolean = false, tab?: string): void {
  const loc = getCurrentResolvedLocation()
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

export interface NewBoardData {
  title: string
  description?: string
  projects: Array<Ref<Project>>
  visibility: BoardVisibility
  editors: AccountUuid[]
  filter: string
  columns: BoardColumn[]
}

// A personal board lives in its author's private PersonSpace, so the server hides it from the others.
export function boardSpace (visibility: BoardVisibility): Ref<Space> {
  if (visibility === 'all') return core.space.Workspace
  const space: Ref<Space> | undefined = getCurrentEmployeeSpace()
  if (space === undefined) throw new Error('The personal space is not loaded')
  return space
}

// Switching visibility moves the board to the matching space; only the author can do it.
export function spaceAfterPatch (board: Board, patch: Partial<Data<Board>>): Ref<Space> {
  return patch.visibility === undefined ? board.space : boardSpace(patch.visibility)
}

export async function updateBoard (client: TxOperations, board: Board, patch: Partial<Data<Board>>): Promise<void> {
  const space = spaceAfterPatch(board, patch)
  await client.update(board, space === board.space ? patch : { ...patch, space })
}

export async function createBoard (client: TxOperations, data: NewBoardData): Promise<Ref<Board>> {
  return await client.createDoc(tracker.class.Board, boardSpace(data.visibility), {
    ...data,
    author: getCurrentAccount().uuid,
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

interface PendingEdit {
  patch: Partial<Data<Board>>
}

// Settings edits: shown at once, sent one by one. While some are in flight the server echo
// is held back, otherwise an echo of an earlier edit would erase the later ones.
export class BoardEditor {
  private base: Board
  private latest: Board | undefined
  private readonly pending: PendingEdit[] = []

  constructor (
    initial: Board,
    private readonly client: TxOperations,
    private readonly onState: (board: Board) => void,
    private readonly onError: (err: unknown) => void
  ) {
    this.base = initial
  }

  get board (): Board {
    return this.pending.reduce((b, e) => applyPatch(b, e.patch), this.base)
  }

  receive (server: Board): void {
    if (this.pending.length > 0) this.latest = server
    else this.base = server
    this.onState(this.board)
  }

  async edit (patch: Partial<Data<Board>>): Promise<void> {
    const before = this.board
    const entry: PendingEdit = { patch }
    try {
      applyPatch(before, patch)
    } catch (err) {
      this.onError(err)
      return
    }
    this.pending.push(entry)
    this.onState(this.board)
    try {
      await updateBoard(this.client, before, patch)
      this.base = applyPatch(this.base, patch)
    } catch (err) {
      this.onError(err)
    } finally {
      this.pending.splice(this.pending.indexOf(entry), 1)
      if (this.pending.length === 0 && this.latest !== undefined) {
        this.base = this.latest
        this.latest = undefined
      }
      this.onState(this.board)
    }
  }
}

function applyPatch (board: Board, patch: Partial<Data<Board>>): Board {
  return { ...board, ...patch, space: spaceAfterPatch(board, patch) }
}

// Issues of the projects per status, counted by the server; equal inputs reuse the last answer.
// One count per status: fetching the issues to count them would move every row of the projects
export class StatusCounts {
  private key = ''
  private result: Promise<Map<Ref<Status>, number>> | undefined

  async load (
    client: TxOperations,
    projects: Array<Ref<Project>>,
    ids: Array<Ref<Status>>
  ): Promise<Map<Ref<Status>, number>> {
    const unique = [...new Set(ids)]
    const key = JSON.stringify([[...projects].sort(), [...unique].sort()])
    if (this.result !== undefined && key === this.key) return await this.result
    this.key = key
    this.result = Promise.all(
      unique.map(
        async (status) =>
          await client.findAll<Issue>(
            tracker.class.Issue,
            { space: { $in: projects }, status },
            { limit: 1, total: true }
          )
      )
    ).then((totals) => new Map(unique.map((id, i) => [id, totals[i].total])))
    this.result.catch(() => {
      this.result = undefined
    })
    return await this.result
  }
}

export function canDeleteBoard (board: Board, account: AccountUuid): boolean {
  return board.author === account
}

export function reportBoardError (err: unknown): void {
  void setPlatformStatus(unknownError(err))
}
