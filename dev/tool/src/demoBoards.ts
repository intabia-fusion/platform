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

// Converts a board of dev/design/demo/<lang>/ (the mockup form: names and field/op/value
// conditions) into the product Board model. Pure: everything the workspace knows comes in through
// BoardContext, so the conversion is tested without a stand.

import { type AccountUuid, type Data, type Ref, type Status, type StatusCategory } from '@hcengineering/core'
import { type Person } from '@hcengineering/contact'
import {
  defaultCardDensity,
  IssuePriority,
  type Board,
  type BoardColorRule,
  type BoardColumn,
  type BoardQuickFilter,
  type BoardSwimlane,
  type Component,
  type Project
} from '@hcengineering/tracker'

export interface DemoCondition {
  field: string
  op: string
  value: string[]
}

export interface DemoBoard {
  title: string
  key: string
  hint?: string
  visibility: 'all' | 'me'
  pinned?: boolean
  projects: string[]
  author: string
  editors: string[]
  filter?: DemoCondition[]
  columns: Array<{ title: string, category: string, limit?: number, statuses: string[] }>
  swimlanes?: Array<{ title: string, hint?: string, rest?: boolean, filter?: DemoCondition[] }>
  quickFilters?: Array<{ title: string, filter: DemoCondition[] }>
  colorRules?: Array<{ color: string, filter: DemoCondition[] }>
}

/** How a filter of a field is edited: refs of documents, or value pairs. */
export interface FilterKeyInfo {
  // The KeyFilter the UI stores in `Filter.key`
  key: Record<string, any>
  kind: 'object' | 'value'
}

export interface BoardContext {
  project: (identifier: string) => Ref<Project> | undefined
  // Statuses of the board projects with this name
  statuses: (name: string, projects: string[]) => Array<Ref<Status>>
  category: (name: string) => Ref<StatusCategory> | undefined
  person: (name: string) => Ref<Person> | undefined
  account: (name: string) => AccountUuid | undefined
  component: (label: string) => Ref<Component> | undefined
  // Palette index by color name
  color: (name: string) => number | undefined
  filterKey: (field: string) => FilterKeyInfo | undefined
  // "me" in a condition
  me: Ref<Person>
  newId: () => string
}

export interface ConvertedBoard {
  board: Data<Board>
  // One line per dropped condition, the whole lane, quick filter or color rule goes with it
  skipped: string[]
}

const modes = {
  object: ['view:filter:FilterObjectIn', 'view:filter:FilterObjectNin'],
  value: ['view:filter:FilterValueIn', 'view:filter:FilterValueNin']
}

class Unsupported extends Error {}

function condition (cond: DemoCondition, ctx: BoardContext, projects: string[], index: number): Record<string, any> {
  if (cond.op !== 'eq' && cond.op !== 'in' && cond.op !== 'not') {
    throw new Unsupported(`${cond.field} ${cond.op}`)
  }
  const info = ctx.filterKey(cond.field)
  if (info === undefined) throw new Unsupported(`${cond.field} ${cond.op}`)
  const refs = (names: string[], find: (name: string) => string | string[] | undefined): any[] =>
    names.flatMap((name) => {
      const found = find(name)
      if (found === undefined) throw new Unsupported(`${cond.field} = ${name}`)
      return found
    })
  let value: any[]
  if (cond.field === 'status') value = refs(cond.value, (n) => ctx.statuses(n, projects))
  else if (cond.field === 'assignee') value = refs(cond.value, (n) => (n === 'me' ? ctx.me : ctx.person(n)))
  else if (cond.field === 'component') value = refs(cond.value, (n) => ctx.component(n))
  else if (cond.field === 'priority') {
    // Value pairs: [shown value, real values]; the priority is the same number in both
    value = refs(cond.value, (n) => {
      const p = IssuePriority[n as keyof typeof IssuePriority]
      return p === undefined ? undefined : ([[p, [p]]] as any)
    })
  } else throw new Unsupported(`${cond.field} ${cond.op}`)
  const pair = modes[info.kind]
  return {
    key: info.key,
    value,
    index,
    modes: pair,
    mode: cond.op === 'not' ? pair[1] : pair[0]
  }
}

// '' means no conditions, as in Board.filter
function toCondition (list: DemoCondition[] | undefined, ctx: BoardContext, projects: string[]): string {
  if (list === undefined || list.length === 0) return ''
  return JSON.stringify(list.map((c, i) => condition(c, ctx, projects, i + 1)))
}

export function convertBoard (src: DemoBoard, ctx: BoardContext): ConvertedBoard {
  const skipped: string[] = []
  const projects = src.projects
  // An item is dropped whole when one of its conditions has no product form: a partial lane would show other cards
  const keep = <T>(what: string, title: string, make: () => T): T | undefined => {
    try {
      return make()
    } catch (err: any) {
      if (!(err instanceof Unsupported)) throw err
      skipped.push(`${src.title} / ${what} "${title}": ${err.message}`)
      return undefined
    }
  }

  const columns: BoardColumn[] = src.columns.map((c) => ({
    id: ctx.newId(),
    title: c.title,
    category: ctx.category(c.category) as Ref<StatusCategory>,
    statuses: c.statuses.flatMap((s) => ctx.statuses(s, projects)),
    ...(c.limit !== undefined ? { limit: c.limit } : {})
  }))
  const filter = keep('filter', '', () => toCondition(src.filter, ctx, projects)) ?? ''
  const lanes = (src.swimlanes ?? []).flatMap((l): BoardSwimlane[] => {
    const lane = keep('swimlane', l.title, () => ({
      id: ctx.newId(),
      title: l.title,
      condition: l.rest === true ? '' : toCondition(l.filter, ctx, projects)
    }))
    return lane === undefined ? [] : [lane]
  })
  // The product takes the rest lane as the last one
  const swimlanes = [...lanes.filter((l) => l.condition !== ''), ...lanes.filter((l) => l.condition === '')]
  const quickFilters = (src.quickFilters ?? []).flatMap((q): BoardQuickFilter[] => {
    const item = keep('quick filter', q.title, () => ({
      id: ctx.newId(),
      title: q.title,
      condition: toCondition(q.filter, ctx, projects)
    }))
    return item === undefined ? [] : [item]
  })
  const colorRules = (src.colorRules ?? []).flatMap((r): BoardColorRule[] => {
    const item = keep('color rule', r.color, () => {
      const color = ctx.color(r.color)
      if (color === undefined) throw new Unsupported(`color ${r.color}`)
      return { id: ctx.newId(), color, condition: toCondition(r.filter, ctx, projects) }
    })
    return item === undefined ? [] : [item]
  })

  return {
    skipped,
    board: {
      title: src.title,
      projects: src.projects.flatMap((p) => ctx.project(p) ?? []),
      visibility: src.visibility,
      author: ctx.account(src.author) as AccountUuid,
      editors: src.editors.flatMap((e) => ctx.account(e) ?? []),
      filter,
      columns,
      swimlanes,
      quickFilters,
      colorRules,
      density: defaultCardDensity
    }
  }
}
