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
import type { Ref, TxOperations } from '@hcengineering/core'
import love, { type MeetingGroup, type PermanentMeeting } from '@hcengineering/love'
import { genRanks, makeRank } from '@hcengineering/rank'
import core, { SortingOrder } from '@hcengineering/core'

/**
 * Moves an item of `ids` from `from` to `to` and returns the new order. Kept pure and separate from
 * the component: the drag-and-drop code only has to say where, and the test can check the result.
 */
export function moveItem<T> (ids: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Puts the moved meeting into the target group right before `beforeId` (or at the end). */
export function mergeMeetingIntoGroup (
  meetings: Array<{ _id: Ref<PermanentMeeting>, group?: Ref<MeetingGroup> }>,
  moved: Ref<PermanentMeeting>,
  targetGroup: Ref<MeetingGroup> | undefined,
  beforeId?: Ref<PermanentMeeting>
): Array<{ _id: Ref<PermanentMeeting>, group?: Ref<MeetingGroup> }> {
  const movedDoc = meetings.find((it) => it._id === moved)
  if (movedDoc === undefined) return meetings
  const rest = meetings.filter((it) => it._id !== moved)
  const index = beforeId !== undefined ? rest.findIndex((it) => it._id === beforeId) : -1
  const insertAt = index === -1 ? rest.length : index
  const next = [...rest]
  next.splice(insertAt, 0, { ...movedDoc, group: targetGroup })
  return next
}

/** Creates a group and moves the given meetings into it, keeping their relative order. */
export async function createMeetingGroup (
  client: TxOperations,
  name: string,
  meetings: PermanentMeeting[]
): Promise<Ref<MeetingGroup>> {
  // The new group goes after the last one: one rank for the group, one per moved meeting.
  const last = await client.findOne(love.class.MeetingGroup, {}, { sort: { rank: SortingOrder.Descending } })
  const id = await client.createDoc(love.class.MeetingGroup, core.space.Workspace, {
    name,
    rank: makeRank(last?.rank, undefined)
  })
  const ranks = genRanks(meetings.length)
  for (const [index, meeting] of meetings.entries()) {
    await client.diffUpdate(meeting, { group: id, rank: ranks[index] })
  }
  return id
}

/** Renames a group in place; an empty name is ignored so a stray Enter cannot blank the header. */
export async function renameMeetingGroup (client: TxOperations, group: MeetingGroup, name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed === group.name) return
  await client.diffUpdate(group, { name: trimmed })
}

/**
 * Removes a group. Its meetings stay and become ungrouped: a group is a way to sort meetings, not
 * something that owns them. The copy of the group on the series is cleared by the server trigger.
 */
export async function deleteMeetingGroup (client: TxOperations, group: MeetingGroup): Promise<void> {
  const meetings = await client.findAll(love.class.PermanentMeeting, { group: group._id })
  for (const meeting of meetings) {
    await client.update(meeting, { $unset: { group: 1 } })
  }
  await client.remove(group)
}
