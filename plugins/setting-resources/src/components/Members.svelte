<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import type { Employee } from '@hcengineering/contact'
  import contact, { combineName, formatName } from '@hcengineering/contact'
  import { EmployeePresenter } from '@hcengineering/contact-resources'
  import type { Account, WorkspaceMemberWithDetails } from '@hcengineering/core'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { MessageBox, createQuery, getClient } from '@hcengineering/presentation'
  import type { DropdownIntlItem } from '@hcengineering/ui'
  import { Breadcrumb, DropdownLabelsIntl, Header, Scroller, SearchInput, showPopup } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  import setting from '../plugin'
  import { getAccountClient } from '../utils'
  import { Analytics } from '@hcengineering/analytics'
  import platform, { PlatformError } from '@hcengineering/platform'

  const query = createQuery()
  const currentAccount = getCurrentAccount()
  const client = getClient()

  const items: DropdownIntlItem[] = [
    { id: AccountRole.ReadOnlyGuest, label: setting.string.ReadonlyGuest },
    { id: AccountRole.DocGuest, label: setting.string.DocumentGuest },
    { id: AccountRole.Guest, label: setting.string.Guest },
    { id: AccountRole.User, label: setting.string.User },
    { id: AccountRole.Maintainer, label: setting.string.Maintainer },
    { id: AccountRole.Owner, label: setting.string.Owner },
    { id: AccountRole.Admin, label: setting.string.SystemAdministrator }
  ]

  const guestRoles = [AccountRole.ReadOnlyGuest, AccountRole.DocGuest, AccountRole.Guest]

  const accountClient = getAccountClient()
  let workspaceMembers: Record<string, WorkspaceMemberWithDetails> = {}
  let employees: Employee[] = []
  let pendingMembers = new Set<string>()

  onMount(async () => {
    await refreshMembers()
  })

  async function refreshMembers (): Promise<void> {
    const members = await accountClient.getWorkspaceMemberDetails()
    workspaceMembers = Object.fromEntries(members.map((member) => [member.person, member]))
  }

  query.query(contact.mixin.Employee, { active: true }, (res) => {
    employees = res
      .filter((e) => e.personUuid != null)
      .sort((a, b) => formatName(a.name).localeCompare(formatName(b.name)))
  })

  async function change (personUuid: string, value: AccountRole): Promise<void> {
    if (accountClient == null || pendingMembers.has(personUuid)) {
      return
    }

    pendingMembers = new Set(pendingMembers).add(personUuid)
    try {
      await accountClient.updateWorkspaceRole(personUuid, value)
      workspaceMembers = {
        ...workspaceMembers,
        [personUuid]: { ...workspaceMembers[personUuid], role: value }
      }

      const employee = employees.find((e) => e.personUuid === personUuid)
      if (employee !== undefined) {
        const employeeRole = guestRoles.includes(value) ? 'GUEST' : 'USER'
        await client.update(employee, { role: employeeRole })
      }
    } catch (e: any) {
      if (e instanceof PlatformError && e.status.code === platform.status.PlanLimitExceeded) {
        showPopup(MessageBox, {
          label: setting.string.SeatLimitReached,
          message: setting.string.SeatLimitReachedDescription,
          canSubmit: false
        })
        workspaceMembers = { ...workspaceMembers }
        return
      }
      workspaceMembers = { ...workspaceMembers }
      Analytics.handleError(e)
    } finally {
      pendingMembers.delete(personUuid)
      pendingMembers = new Set(pendingMembers)
    }
  }
  let search = ''

  $: ownersCount = Object.values(workspaceMembers).filter((member) => member.role === AccountRole.Owner).length
  $: rows = Object.values(workspaceMembers)
    .map((member) => {
      const employee = employees.find((e) => e.personUuid === member.person)
      const name =
        employee !== undefined
          ? formatName(employee.name).trim()
          : formatName(combineName(member.firstName ?? '', member.lastName ?? '')).trim()
      return { member, employee, name, email: member.email ?? '' }
    })
    .filter((row) =>
      `${row.name} ${row.email} ${row.member.person}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    )
    .sort((a, b) => (a.name || a.email || a.member.person).localeCompare(b.name || b.email || b.member.person))

  function getItems (role: AccountRole, currentAccount: Account): DropdownIntlItem[] {
    return items.filter(
      (i) =>
        i.id === role ||
        (i.id !== AccountRole.Admin &&
          i.id !== AccountRole.DocGuest &&
          hasAccountRole(currentAccount, i.id as AccountRole))
    )
  }
</script>

<div class="hulyComponent">
  <Header adaptive="disabled">
    <Breadcrumb icon={setting.icon.Members} label={setting.string.Members} size="large" isCurrent />
    <svelte:fragment slot="search">
      <SearchInput bind:value={search} collapsed />
    </svelte:fragment>
  </Header>
  <div class="hulyComponent-content__column content">
    <Scroller align="center" padding="var(--spacing-3)" bottomPadding="var(--spacing-3)">
      <div class="hulyComponent-content">
        {#each rows as row (row.member.person)}
          {@const member = row.member}
          {@const personUuid = member.person}
          {@const role = member.role}
          <div class="flex-row-center p-2 flex-no-shrink member-row" data-id="owners-member-row">
            <div class="p-1 min-w-80 member-identity">
              {#if row.employee !== undefined}
                <EmployeePresenter value={row.employee} disabled={false} />
              {:else}
                <span>{row.name || row.email || personUuid}</span>
              {/if}
              {#if row.email !== '' && row.name !== '' && row.email !== row.name}
                <span class="member-email">{row.email}</span>
              {/if}
            </div>
            <DropdownLabelsIntl
              label={setting.string.Role}
              disabled={!hasAccountRole(currentAccount, role) ||
                pendingMembers.has(personUuid) ||
                (role === AccountRole.Owner && ownersCount === 1) ||
                currentAccount.uuid === personUuid}
              kind="primary"
              size="medium"
              items={getItems(role, currentAccount)}
              selected={role}
              on:selected={(e) => {
                void change(personUuid, e.detail)
              }}
            />
          </div>
        {/each}
      </div>
    </Scroller>
  </div>
</div>

<style lang="scss">
  .member-row {
    flex-wrap: wrap;
    row-gap: var(--spacing-2);
  }

  .member-identity {
    display: flex;
    flex-direction: column;
  }

  .member-email {
    color: var(--theme-caption-color);
    font-size: var(--font-small);
  }
</style>
