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
  import contact from '@hcengineering/contact'
  import {
    employeeByIdStore,
    employeeRefByAccountUuidStore,
    EmployeePresenter,
    UsersPopup
  } from '@hcengineering/contact-resources'
  import type { AccountUuid, Doc, Role, RolesAssignment } from '@hcengineering/core'
  import { notEmpty } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { getEmbeddedLabel, translate } from '@hcengineering/platform'
  import ui, {
    getEventPositionElement,
    IconAdd,
    IconMoreH,
    Label,
    languageStore,
    Menu,
    ModernPopupLabels,
    showPopup,
    type DropdownTextItem,
    type PopupResult
  } from '@hcengineering/ui'
  import { Button, IconButton, SelectButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'

  import tracker from '../../../plugin'
  import { mergeOwners, OWNER_ROLE, rowRoles } from '../../../projectSettingsLogic'

  // The place keeps the members (saved or of a project being created) and validates every change
  export let members: AccountUuid[]
  export let owners: AccountUuid[]
  export let assignment: RolesAssignment
  export let roles: Role[]
  // Bumped by the place on a rejected change to rebuild the role fields from the kept state
  export let resetKey: number = 0
  // A member whose row cannot be changed: the creator of a new project stays its owner
  export let lockedAccount: AccountUuid | undefined = undefined
  export let onAdd: (account: AccountUuid) => void | Promise<void>
  export let onRemove: (account: AccountUuid) => void | Promise<void>
  export let onRolesChange: (account: AccountUuid, selected: string[]) => void | Promise<void>

  const hierarchy = getClient().getHierarchy()

  $: rows = mergeOwners(members, owners)

  let roleItems: DropdownTextItem[] = []
  async function updateRoleItems (roles: Role[], lang: string): Promise<void> {
    const owner = await translate(tracker.string.ProjectSettingsOwnerRole, {}, lang)
    roleItems = [{ id: OWNER_ROLE, label: owner }, ...roles.map((it) => ({ id: it._id, label: it.name }))]
  }
  $: void updateRoleItems(roles, $languageStore)

  function showMemberMenu (e: MouseEvent, account: AccountUuid): void {
    showPopup(
      Menu,
      {
        actions: [
          {
            label: tracker.string.ProjectSettingsRemoveMember,
            icon: view.icon.Delete,
            action: async () => {
              await onRemove(account)
            }
          }
        ]
      },
      getEventPositionElement(e)
    )
  }

  function showAddMember (e: MouseEvent): void {
    const ignoreUsers = rows.map((it) => $employeeRefByAccountUuidStore.get(it)).filter(notEmpty)
    showPopup(
      UsersPopup,
      {
        _class: contact.mixin.Employee,
        selected: undefined,
        ignoreUsers,
        filter: (it: Doc) => hierarchy.as(it, contact.mixin.Employee).active
      },
      e.currentTarget as HTMLElement,
      (result) => {
        const personUuid = result != null ? $employeeByIdStore.get(result._id)?.personUuid : undefined
        if (personUuid != null) void onAdd(personUuid)
      }
    )
  }

  // Account whose role list is open; the popup follows the kept roles, a rejected change included
  let rolesAccount: AccountUuid | undefined
  let rolesPopup: PopupResult | undefined
  $: rolesPopup?.update({
    items: roleItems,
    selected: rolesAccount !== undefined ? rowRoles(rolesAccount, owners, assignment) : []
  })

  function roleLabel (
    account: AccountUuid,
    items: DropdownTextItem[],
    owners: AccountUuid[],
    assignment: RolesAssignment
  ): string {
    const selected = rowRoles(account, owners, assignment)
    return items
      .filter((it) => selected.includes(String(it.id)))
      .map((it) => it.label)
      .join(', ')
  }

  function chooseRoles (e: MouseEvent, account: AccountUuid): void {
    rolesAccount = account
    rolesPopup = showPopup(
      ModernPopupLabels,
      {
        placeholder: ui.string.SearchDots,
        items: roleItems,
        multiselect: true,
        selected: rowRoles(account, owners, assignment)
      },
      e.currentTarget as HTMLElement,
      () => {
        rolesAccount = undefined
        rolesPopup = undefined
      },
      (result) => {
        if (Array.isArray(result)) void onRolesChange(account, result.map(String))
      }
    )
  }
</script>

<div class="members-head">
  <span class="members-title">
    <Label label={tracker.string.ProjectSettingsMembersCount} params={{ count: rows.length }} />
  </span>
  <Button
    data-id="project-add-member"
    kind="secondary"
    size="small"
    icon={IconAdd}
    iconSize="small"
    label={tracker.string.ProjectSettingsAddMember}
    on:click={showAddMember}
  />
</div>

<div class="members-table" data-id="project-settings-member-table">
  <div class="members-row head">
    <div class="cell person"><Label label={tracker.string.ProjectSettingsEmployee} /></div>
    <div class="cell role"><Label label={tracker.string.ProjectSettingsRole} /></div>
    <div class="cell action" />
  </div>
  {#key resetKey}
    {#each rows as account (account)}
      {@const ref = $employeeRefByAccountUuidStore.get(account)}
      {@const roles = roleLabel(account, roleItems, owners, assignment)}
      <div class="members-row" data-id="project-settings-member">
        <div class="cell person">
          <EmployeePresenter value={ref} avatarSize="small" showPopup={false} />
        </div>
        <div class="cell role">
          <div class="role-field">
            <SelectButton
              data-id="project-member-roles"
              label={roles !== '' ? getEmbeddedLabel(roles) : undefined}
              placeholder={tracker.string.ProjectSettingsMemberRole}
              field
              fullWidth
              chevron
              disabled={account === lockedAccount}
              pressed={rolesAccount === account}
              on:click={(e) => {
                chooseRoles(e, account)
              }}
            />
          </div>
        </div>
        <div class="cell action">
          <IconButton
            icon={IconMoreH}
            kind="ghost"
            size="extra-small"
            data-id="project-member-menu"
            disabled={account === lockedAccount}
            tooltip={{ label: tracker.string.ProjectSettingsRemoveMember }}
            on:click={(e) => {
              showMemberMenu(e, account)
            }}
          />
        </div>
      </div>
    {/each}
  {/key}
</div>

<style lang="scss">
  .members-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 2rem;
  }
  .role-field {
    width: 10rem;
  }
  .members-title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .members-table {
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
  }
  .members-row {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--theme-divider-color);

    &:first-child {
      border-top: none;
    }
    &.head {
      height: 2.25rem;
      background-color: var(--theme-list-row-color);
      border-radius: 0.5rem 0.5rem 0 0;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--theme-dark-color);
    }
  }
  .cell {
    box-sizing: border-box;
    padding: 0.375rem 0.75rem;

    &.person {
      flex-grow: 1;
      min-width: 0;
    }
    &.role {
      flex-shrink: 0;
      width: 12.5rem;
    }
    &.action {
      flex-shrink: 0;
      width: 3.5rem;
    }
  }
</style>
