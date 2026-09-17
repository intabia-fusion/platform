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

import type { ApiKeyOperation } from '@hcengineering/account-client'
import type { RestClient } from '@hcengineering/api-client'
import chunter from '@hcengineering/chunter'
import type { Ref, Space, WorkspaceUuid } from '@hcengineering/core'
import document, { type Document } from '@hcengineering/document'
import tracker from '@hcengineering/tracker'

/** Body field naming what the operation acts on - keep in step with pods/server/src/opsApi.ts. */
export type TargetField = 'space' | 'issue' | 'document'

type TargetKind = 'Project' | 'Channel' | 'Teamspace' | 'Issue' | 'Document'

const targets: Record<ApiKeyOperation, { field: TargetField, kind: TargetKind }> = {
  'issue:create': { field: 'space', kind: 'Project' },
  'issue:update': { field: 'issue', kind: 'Issue' },
  'issue:comment': { field: 'issue', kind: 'Issue' },
  'issue:time_report': { field: 'issue', kind: 'Issue' },
  'chat:post': { field: 'space', kind: 'Channel' },
  'doc:create': { field: 'space', kind: 'Teamspace' },
  'doc:update': { field: 'document', kind: 'Document' }
}

export function targetField (action: ApiKeyOperation): TargetField {
  return targets[action].field
}

export type TargetLookup = { found: true, space: Ref<Space> } | { found: false, message: string }

// Refreshed on a miss so a just-created space is picked up, but not more often than this.
export const SPACE_RELOAD_MS = 10_000

interface SpaceIndex {
  byKey: Map<string, Ref<Space>>
  loadedAt: number
}

// A space deleted or a project re-identified after the load still passes here until the next
// miss-triggered reload; the job then fails in the transactor instead of a synchronous 404.
const spaceIndexes = new Map<WorkspaceUuid, Promise<SpaceIndex>>()

async function loadSpaceIndex (rest: RestClient): Promise<SpaceIndex> {
  const [projects, channels, teamspaces] = await Promise.all([
    rest.findAll(tracker.class.Project, {}, { projection: { _id: 1, identifier: 1 } }),
    rest.findAll(chunter.class.Channel, {}, { projection: { _id: 1 } }),
    rest.findAll(document.class.Teamspace, {}, { projection: { _id: 1 } })
  ])
  const byKey = new Map<string, Ref<Space>>()
  for (const p of projects) byKey.set(`Project:${p.identifier}`, p._id)
  for (const c of channels) byKey.set(`Channel:${c._id}`, c._id)
  for (const t of teamspaces) byKey.set(`Teamspace:${t._id}`, t._id)
  return { byKey, loadedAt: Date.now() }
}

async function getSpaceIndex (rest: RestClient, workspace: WorkspaceUuid, reload: boolean): Promise<SpaceIndex> {
  let index = spaceIndexes.get(workspace)
  if (index === undefined || reload) {
    index = loadSpaceIndex(rest)
    spaceIndexes.set(workspace, index)
    const current = index
    index.catch(() => {
      if (spaceIndexes.get(workspace) === current) spaceIndexes.delete(workspace)
    })
  }
  return await index
}

async function findSpace (rest: RestClient, workspace: WorkspaceUuid, key: string): Promise<Ref<Space> | undefined> {
  const index = await getSpaceIndex(rest, workspace, false)
  const space = index.byKey.get(key)
  if (space !== undefined || Date.now() - index.loadedAt < SPACE_RELOAD_MS) return space
  return (await getSpaceIndex(rest, workspace, true)).byKey.get(key)
}

/** Resolves the target the way the transactor will, so an unknown one is refused before queueing. */
export async function lookupTarget (
  rest: RestClient,
  workspace: WorkspaceUuid,
  action: ApiKeyOperation,
  value: string
): Promise<TargetLookup> {
  const { kind } = targets[action]
  let space: Ref<Space> | undefined
  if (kind === 'Issue') {
    space = (await rest.findOne(tracker.class.Issue, { identifier: value }, { projection: { space: 1 } }))?.space
  } else if (kind === 'Document') {
    space = (await rest.findOne(document.class.Document, { _id: value as Ref<Document> }, { projection: { space: 1 } }))
      ?.space
  } else {
    space = await findSpace(rest, workspace, `${kind}:${value}`)
  }
  return space !== undefined ? { found: true, space } : { found: false, message: `${kind} '${value}' not found` }
}
