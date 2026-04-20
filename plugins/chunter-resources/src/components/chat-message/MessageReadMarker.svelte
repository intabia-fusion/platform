<script lang="ts">
  import { Timestamp, getCurrentAccount, AccountUuid } from '@hcengineering/core'
  import { ReadState, ReadPosition } from '@hcengineering/notification'
  import { employeeByAccountStore } from '@hcengineering/contact-resources'
  import { Employee } from '@hcengineering/contact'

  import DoubleCheck from '../icons/DoubleCheck.svelte'
  import Check from '../icons/Check.svelte'

  export let createdOn: Timestamp
  export let readState: ReadState
  export let readEmployees: Map<AccountUuid, Employee>

  const account = getCurrentAccount()

  $: readEmployees = getReadEmployees(createdOn, readState, $employeeByAccountStore)

  function getReadEmployees (
    createdOn: Timestamp,
    readState: ReadState,
    employeeByAccount: Map<AccountUuid, Employee>
  ): Map<AccountUuid, Employee> {
    const result: Map<AccountUuid, Employee> = new Map<AccountUuid, Employee>()
    for (const [key, value] of Object.entries(readState)) {
      const ts = (value as ReadPosition)?.timestamp ?? 0

      if (ts === 0) continue
      if (key === account.uuid) continue
      if (ts < createdOn) continue
      const employee = employeeByAccount.get(key as AccountUuid)
      if (employee != null) {
        result.set(key as AccountUuid, employee)
      }
    }

    return result
  }
</script>

{#if readEmployees.size > 0}
  <DoubleCheck size="small" fill="var(--accent-color-tertiary-pressed)" />
{:else}
  <Check size="small" fill="var(--accent-color-tertiary-pressed)" />
{/if}
