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

import type { AccountUuid, Ref, Role, RolesAssignment } from '@hcengineering/core'

/** Owners are always members. */
export function mergeOwners (members: AccountUuid[], owners: AccountUuid[]): AccountUuid[] {
  return Array.from(new Set([...members, ...owners]))
}

/** A project needs an owner; a private one also needs a member and an owner among its members. */
export function isAccessValid (isPrivate: boolean, members: AccountUuid[], owners: AccountUuid[]): boolean {
  if (owners.length === 0) return false
  if (!isPrivate) return true
  return members.length > 0 && owners.some((it) => members.includes(it))
}

/** Roles assignment without the removed members; roles nobody held stay as they are. */
export function removeFromRoles (assignment: RolesAssignment, removed: AccountUuid[]): RolesAssignment {
  const result: RolesAssignment = {}
  for (const [role, accounts] of Object.entries(assignment)) {
    result[role as Ref<Role>] = accounts != null ? accounts.filter((it) => !removed.includes(it)) : accounts
  }
  return result
}

/** Id of the owner entry next to the project type roles in a member's role list. */
export const OWNER_ROLE = 'owner'

/** Role list ids of one member: the owner entry plus the type roles the member holds. */
export function rowRoles (account: AccountUuid, owners: AccountUuid[], assignment: RolesAssignment): string[] {
  const held = Object.entries(assignment)
    .filter(([, accounts]) => accounts?.includes(account) === true)
    .map(([role]) => role)
  return owners.includes(account) ? [OWNER_ROLE, ...held] : held
}

/** Owners and role assignment after the member's role list was replaced with `selected`. */
export function applyRoles (
  account: AccountUuid,
  selected: string[],
  owners: AccountUuid[],
  assignment: RolesAssignment
): { owners: AccountUuid[], assignment: RolesAssignment } {
  const others = owners.filter((it) => it !== account)
  const nextAssignment: RolesAssignment = {}
  for (const role of new Set([...Object.keys(assignment), ...selected])) {
    if (role === OWNER_ROLE) continue
    const accounts = assignment[role as Ref<Role>]
    const rest = (accounts ?? []).filter((it) => it !== account)
    nextAssignment[role as Ref<Role>] = selected.includes(role)
      ? [...rest, account]
      : accounts != null
        ? rest
        : accounts
  }
  return { owners: selected.includes(OWNER_ROLE) ? [...others, account] : others, assignment: nextAssignment }
}

/** Members/owners operators of a project update; sent as operators so concurrent admins do not overwrite each other. */
export interface AccessOps {
  $push?: { members?: AccountUuid, owners?: AccountUuid }
  $pull?: { members?: { $in: AccountUuid[] }, owners?: { $in: AccountUuid[] } }
}

export function addMemberOps (account: AccountUuid): AccessOps {
  return { $push: { members: account } }
}

/** Removing a member also removes them from owners when they were one. */
export function removeMemberOps (account: AccountUuid, owners: AccountUuid[]): AccessOps {
  return {
    $pull: { members: { $in: [account] }, ...(owners.includes(account) ? { owners: { $in: [account] } } : {}) }
  }
}

/** New owners are made members too; a demoted owner stays a member. Undefined when ownership did not change. */
export function ownerChangeOps (
  account: AccountUuid,
  wasOwner: boolean,
  isOwner: boolean,
  members: AccountUuid[]
): AccessOps | undefined {
  if (wasOwner === isOwner) return undefined
  if (!isOwner) return { $pull: { owners: { $in: [account] } } }
  return { $push: { owners: account, ...(members.includes(account) ? {} : { members: account }) } }
}

/** Only the roles whose holders changed; undefined when none did. */
export function changedRoles (prev: RolesAssignment, next: RolesAssignment): RolesAssignment | undefined {
  const result: RolesAssignment = {}
  let changed = false
  for (const [role, accounts] of Object.entries(next)) {
    const before = new Set(prev[role as Ref<Role>] ?? [])
    const after = new Set(accounts ?? [])
    if (before.size !== after.size || [...after].some((it) => !before.has(it))) {
      result[role as Ref<Role>] = accounts
      changed = true
    }
  }
  return changed ? result : undefined
}
