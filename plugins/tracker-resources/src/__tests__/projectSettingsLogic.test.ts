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
import { applyRoles, isAccessValid, mergeOwners, OWNER_ROLE, removeFromRoles, rowRoles } from '../projectSettingsLogic'

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
