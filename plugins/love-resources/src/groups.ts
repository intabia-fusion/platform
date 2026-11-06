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
import type { AttachedDoc, Doc, Ref, TxOperations } from '@hcengineering/core'
import love, { type MeetingGroup, type PermanentMeeting } from '@hcengineering/love'
import core from '@hcengineering/core'

/**
 * Moves an item of `ids` from `from` to `to` and returns the new order. Kept pure and separate from
 * the component: the drag-and-drop code only has to say where, and the test can check the numbers.
 */
export function moveItem<T>(ids: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Assigns `0..n-1` to the given ids - one write per item is what the caller does with it. */
export function orderOf<T>(ids: T[]): Array<{ id: T, order: number }> {
  return ids.map((id, index) => ({ id, order: index }))
}

/** Puts the moved meeting into the target group right before `beforeId` (or at the end). */
export function mergeMeetingIntoGroup(
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

/** Writes `order` for meetings and groups in one go: the list is ordered by it and nothing else. */
export async function persistOrder (
  client: TxOperations,
  meetings: Array<{ _id: Ref<PermanentMeeting>, group?: Ref<MeetingGroup> }>,
  groups: Array<Ref<MeetingGroup>>
): Promise<void> {
  for (const { id, order } of orderOf(groups)) {
    const group = await client.findOne(love.class.MeetingGroup, { _id: id })
    if (group === undefined || group.order === order) continue
    await client.diffUpdate(group, { order })
  }

  const byId = new Map(meetings.map((it) => [it._id, it]))
  for (const { id, order } of orderOf(meetings.map((it) => it._id))) {
    const meeting = await client.findOne(love.class.PermanentMeeting, { _id: id })
    if (meeting === undefined) continue
    const next = byId.get(id)
    if (meeting.order === order && meeting.group === next?.group) continue
    await client.diffUpdate(meeting, { order, group: next?.group } as any)
  }
}

/** Creates a group and moves the given meetings into it, keeping their relative order. */
export async function createMeetingGroup (
  client: TxOperations,
  name: string,
  meetings: PermanentMeeting[]
): Promise<Ref<MeetingGroup>> {
  const groups = await client.findAll(love.class.MeetingGroup, {})
  const order = groups.reduce((max, it) => Math.max(max, it.order ?? 0), -1) + 1
  const id = await client.createDoc(love.class.MeetingGroup, core.space.Workspace, { name, order })
  for (const [index, meeting] of meetings.entries()) {
    await client.diffUpdate(meeting, { group: id, order: index } as any)
  }
  return id
}

/** Renames a group in place; an empty name is ignored so a stray Enter cannot blank the header. */
export async function renameMeetingGroup (
  client: TxOperations,
  group: MeetingGroup,
  name: string
): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed === group.name) return
  await client.diffUpdate(group, { name: trimmed })
}
