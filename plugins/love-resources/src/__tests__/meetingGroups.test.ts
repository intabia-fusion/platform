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
import type { Rank, Ref } from '@hcengineering/core'
import type { MeetingGroup, PermanentMeeting } from '@hcengineering/love'
import { mergeMeetingIntoGroup, moveItem } from '../groups'
import { rankAfterMove } from '../order'

const groupA = 'group:a' as Ref<MeetingGroup>
const groupB = 'group:b' as Ref<MeetingGroup>

function meeting (id: string, rank?: Rank): PermanentMeeting {
  return {
    _id: id as Ref<PermanentMeeting>,
    _class: 'love:class:PermanentMeeting',
    space: 'space:1',
    name: id,
    rank
  } as unknown as PermanentMeeting
}

describe('meeting groups ordering', () => {
  it('moves an item down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('keeps the list when the move is a no-op or out of range', () => {
    const ids = ['a', 'b']
    expect(moveItem(ids, 1, 1)).toBe(ids)
    expect(moveItem(ids, 0, 5)).toBe(ids)
    expect(moveItem(ids, -1, 0)).toBe(ids)
  })

  it('ranks a meeting dropped between two others', () => {
    const meetings = [meeting('x', '0|000001'), meeting('y', '0|000002'), meeting('z', '0|000003')]

    const rank = rankAfterMove(
      meetings,
      ['z', 'x', 'y'] as Array<Ref<PermanentMeeting>>,
      'z' as Ref<PermanentMeeting>
    ) as Rank

    // One write for the moved meeting: the two that stayed keep 0|000001 and 0|000002.
    expect(rank < ('0|000001' as Rank)).toBe(true)
  })

  it('moves a meeting into another group before the given one', () => {
    const meetings = [
      { _id: 'm1' as Ref<PermanentMeeting>, group: groupA },
      { _id: 'm2' as Ref<PermanentMeeting>, group: groupB },
      { _id: 'm3' as Ref<PermanentMeeting>, group: groupB }
    ]
    const next = mergeMeetingIntoGroup(meetings, 'm3' as Ref<PermanentMeeting>, groupA, 'm1' as Ref<PermanentMeeting>)
    expect(next.map((it) => it._id)).toEqual(['m3', 'm1', 'm2'])
    expect(next[0].group).toBe(groupA)
  })

  it('appends to the end when no target item is given', () => {
    const meetings = [
      { _id: 'm1' as Ref<PermanentMeeting>, group: groupA },
      { _id: 'm2' as Ref<PermanentMeeting>, group: groupA }
    ]
    const next = mergeMeetingIntoGroup(meetings, 'm1' as Ref<PermanentMeeting>, undefined)
    expect(next.map((it) => it._id)).toEqual(['m2', 'm1'])
    expect(next[1].group).toBeUndefined()
  })

  it('ignores an unknown meeting', () => {
    const meetings = [{ _id: 'm1' as Ref<PermanentMeeting> }]
    expect(mergeMeetingIntoGroup(meetings, 'nope' as Ref<PermanentMeeting>, groupA)).toBe(meetings)
  })
})
