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

import type { AccountUuid, Ref, Role } from '@hcengineering/core'
import {
  addMemberOps,
  applyRoles,
  changedRoles,
  isAccessValid,
  mergeOwners,
  ownerChangeOps,
  OWNER_ROLE,
  removeFromRoles,
  removeMemberOps,
  rowRoles
} from '../projectSettingsLogic'

const acc = (id: string): AccountUuid => id as AccountUuid

describe('project access', () => {
  it('adds owners to members once', () => {
    expect(mergeOwners([acc('a'), acc('b')], [acc('b'), acc('c')])).toEqual(['a', 'b', 'c'])
  })

  it('requires an owner', () => {
    expect(isAccessValid(false, [acc('a')], [])).toBe(false)
  })

  it('lets a public project have no members', () => {
    expect(isAccessValid(false, [], [acc('a')])).toBe(true)
  })

  it('requires a private project to have an owner among its members', () => {
    expect(isAccessValid(true, [], [acc('a')])).toBe(false)
    expect(isAccessValid(true, [acc('b')], [acc('a')])).toBe(false)
    expect(isAccessValid(true, [acc('a'), acc('b')], [acc('a')])).toBe(true)
  })
})

describe('removeFromRoles', () => {
  it('removes members from every role and keeps empty roles', () => {
    const role1 = 'r1' as Ref<Role>
    const role2 = 'r2' as Ref<Role>
    const res = removeFromRoles({ [role1]: [acc('a'), acc('b')], [role2]: undefined }, [acc('a')])
    expect(res[role1]).toEqual(['b'])
    expect(res[role2]).toBeUndefined()
  })
})

describe('member roles', () => {
  const r1 = 'r1' as Ref<Role>
  const r2 = 'r2' as Ref<Role>
  const assignment = { [r1]: [acc('a'), acc('b')], [r2]: undefined }

  it('lists the owner entry first and then the held roles', () => {
    expect(rowRoles(acc('a'), [acc('a')], assignment)).toEqual([OWNER_ROLE, 'r1'])
    expect(rowRoles(acc('b'), [acc('a')], assignment)).toEqual(['r1'])
    expect(rowRoles(acc('c'), [], assignment)).toEqual([])
  })

  it('applies a selection to owners and roles of one member only', () => {
    const res = applyRoles(acc('a'), [OWNER_ROLE, 'r2'], [acc('x')], assignment)
    expect(res.owners).toEqual(['x', 'a'])
    expect(res.assignment[r1]).toEqual(['b'])
    expect(res.assignment[r2]).toEqual(['a'])
  })

  it('drops the owner entry and keeps unheld roles as they are', () => {
    const res = applyRoles(acc('a'), [], [acc('a'), acc('x')], { [r1]: undefined })
    expect(res.owners).toEqual(['x'])
    expect(res.assignment[r1]).toBeUndefined()
  })
})

describe('access operators', () => {
  it('adds a member with $push of that account only', () => {
    expect(addMemberOps(acc('c'))).toEqual({ $push: { members: 'c' } })
  })

  it('removes a member with $pull from members and owners', () => {
    expect(removeMemberOps(acc('a'), [acc('a'), acc('b')])).toEqual({
      $pull: { members: { $in: ['a'] }, owners: { $in: ['a'] } }
    })
  })

  it('does not pull a plain member from owners', () => {
    expect(removeMemberOps(acc('c'), [acc('a')])).toEqual({ $pull: { members: { $in: ['c'] } } })
  })

  it('promotes a non-member to owner with $push to both lists', () => {
    expect(ownerChangeOps(acc('c'), false, true, [acc('a')])).toEqual({ $push: { owners: 'c', members: 'c' } })
  })

  it('promotes a member to owner with $push to owners only', () => {
    expect(ownerChangeOps(acc('a'), false, true, [acc('a')])).toEqual({ $push: { owners: 'a' } })
  })

  it('demotes an owner with $pull from owners', () => {
    expect(ownerChangeOps(acc('a'), true, false, [acc('a')])).toEqual({ $pull: { owners: { $in: ['a'] } } })
  })

  it('sends nothing when ownership is unchanged', () => {
    expect(ownerChangeOps(acc('a'), true, true, [acc('a')])).toBeUndefined()
  })
})

describe('changedRoles', () => {
  const r1 = 'r1' as Ref<Role>
  const r2 = 'r2' as Ref<Role>

  it('keeps only the roles that changed', () => {
    const prev = { [r1]: [acc('a')], [r2]: [acc('b')] }
    expect(changedRoles(prev, { [r1]: [acc('a'), acc('c')], [r2]: [acc('b')] })).toEqual({ [r1]: ['a', 'c'] })
  })

  it('returns undefined when nothing changed, ignoring order and empty vs missing', () => {
    const prev = { [r1]: [acc('a'), acc('b')], [r2]: undefined }
    expect(changedRoles(prev, { [r1]: [acc('b'), acc('a')], [r2]: [] })).toBeUndefined()
  })
})
