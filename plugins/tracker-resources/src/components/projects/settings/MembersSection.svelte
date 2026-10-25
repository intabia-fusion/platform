<!--
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
-->
<script lang="ts">
  import type { AccountUuid, Role, RolesAssignment } from '@hcengineering/core'
  import core, { SortingOrder } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { ProjectType } from '@hcengineering/task'
  import { typeStore } from '@hcengineering/task-resources'
  import type { Project } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'
  import { SettingRow, Toggle } from '@hcengineering/ui/kit'

  import tracker from '../../../plugin'
  import { applyRoles, isAccessValid, mergeOwners, removeFromRoles } from '../../../projectSettingsLogic'
  import ProjectMembersTable from './ProjectMembersTable.svelte'
  import ProjectSettingsSection from './ProjectSettingsSection.svelte'

  export let project: Project

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let rejected = false
  // Bumped on a rejected change to rebuild the role dropdowns from the stored state
  let resetKey = 0

  $: owners = project.owners ?? []
  $: typeType = $typeStore.get(project.type)

  let roles: Role[] = []
  const rolesQuery = createQuery()
  $: if (typeType !== undefined) {
    rolesQuery.query(
      core.class.Role,
      { attachedTo: typeType._id },
      (res) => {
        roles = res
      },
      {
        sort: { name: SortingOrder.Ascending }
      }
    )
  } else {
    rolesQuery.unsubscribe()
  }

  function readRoles (project: Project, type: ProjectType | undefined, roles: Role[]): RolesAssignment {
    if (type?.targetClass === undefined) return {}
    const asMixin = hierarchy.as(project, type.targetClass) as unknown as Record<string, AccountUuid[] | undefined>
    return Object.fromEntries(roles.map(({ _id }) => [_id, asMixin[_id] ?? []])) as RolesAssignment
  }

  $: assignment = readRoles(project, typeType, roles)

  async function saveRoles (assignment: RolesAssignment): Promise<void> {
    if (typeType?.targetClass === undefined) return
    await client.updateMixin(project._id, tracker.class.Project, core.space.Space, typeType.targetClass, assignment)
  }

  async function setPrivate (on: boolean): Promise<void> {
    if (!isAccessValid(on, project.members, owners)) {
      rejected = true
      isPrivate = project.private
      return
    }
    rejected = false
    await client.update(project, { private: on })
  }

  async function setAutoJoin (on: boolean): Promise<void> {
    await client.update(project, { autoJoin: on })
  }

  async function changeRoles (account: AccountUuid, selected: string[]): Promise<void> {
    const next = applyRoles(account, selected, owners, assignment)
    const members = mergeOwners(project.members, next.owners)
    if (!isAccessValid(project.private, members, next.owners)) {
      rejected = true
      resetKey++
      return
    }
    rejected = false
    if (next.owners.length !== owners.length || next.owners.some((it) => !owners.includes(it))) {
      await client.update(project, { owners: next.owners, members })
    }
    await saveRoles(next.assignment)
  }

  async function removeMember (account: AccountUuid): Promise<void> {
    const members = project.members.filter((it) => it !== account)
    const newOwners = owners.filter((it) => it !== account)
    if (!isAccessValid(project.private, members, newOwners)) {
      rejected = true
      return
    }
    rejected = false
    await client.update(project, { members, owners: newOwners })
    await saveRoles(removeFromRoles(assignment, [account]))
  }

  async function addMember (account: AccountUuid): Promise<void> {
    if (project.members.includes(account)) return
    await client.update(project, { members: [...project.members, account] })
  }

  let isPrivate = project.private
  $: storedPrivate = project.private
  $: isPrivate = storedPrivate
</script>

<ProjectSettingsSection
  title={tracker.string.ProjectSettingsAccess}
  description={tracker.string.ProjectSettingsAccessDescription}
  wide
>
  <div class="flex-col flex-gap-4 w-full" data-id="project-settings-members">
    <SettingRow
      kind="column"
      label={tracker.string.ProjectSettingsPrivate}
      hint={tracker.string.ProjectSettingsPrivateHint}
      let:labelId
    >
      <Toggle
        id="project-private"
        bind:checked={isPrivate}
        disabled={!isPrivate && project.members.length === 0}
        aria-labelledby={labelId}
        on:change={(e) => setPrivate(e.detail)}
      />
    </SettingRow>

    <SettingRow
      kind="column"
      label={tracker.string.ProjectSettingsAutoJoin}
      hint={tracker.string.ProjectSettingsAutoJoinHint}
      let:labelId
    >
      <Toggle
        id="project-autojoin"
        checked={project.autoJoin ?? false}
        aria-labelledby={labelId}
        on:change={(e) => setAutoJoin(e.detail)}
      />
    </SettingRow>

    <div class="divider" />

    <ProjectMembersTable
      members={project.members}
      {owners}
      {assignment}
      {roles}
      {resetKey}
      onAdd={addMember}
      onRemove={removeMember}
      onRolesChange={changeRoles}
    />

    {#if rejected}
      <span class="error-color" data-id="project-settings-access-error">
        <Label label={tracker.string.ProjectAccessInvalid} />
      </span>
    {/if}
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .divider {
    max-width: 45rem;
    height: 1px;
    background-color: var(--theme-divider-color);
  }
</style>
