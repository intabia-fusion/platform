<script lang="ts">
  import AccountArrayEditor from '@hcengineering/contact-resources/src/components/AccountArrayEditor.svelte'
  import { employeeByIdStore } from '@hcengineering/contact-resources/src/utils'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import type { AccountUuid, Ref } from '@hcengineering/core'
  import { type MeetingMinutes } from '@hcengineering/love'
  import type { IntlString } from '@hcengineering/platform'
  import type { ButtonKind, ButtonSize } from '@hcengineering/ui'

  export let object: MeetingMinutes
  export let label: IntlString
  export let value: AccountUuid | AccountUuid[] | undefined
  export let onChange: ((refs: AccountUuid[]) => void | Promise<void>) | undefined
  export let readonly = false
  export let kind: ButtonKind = 'link'
  export let size: ButtonSize = 'large'
  export let width: string | undefined = undefined
  export let includeItems: Ref<any>[] = []
  export let excludeItems: Ref<any>[] = []
  export let emptyLabel: IntlString | undefined = undefined
  export let allowGuests: boolean = false
  export let attributeKey: string | undefined = undefined

  const currentEmployee = getCurrentEmployee()
  $: currentAccountUuid = $employeeByIdStore.get(currentEmployee)?.personUuid

  let owners: AccountUuid[] | undefined = undefined
  let lastMeeting = object

  $: if (object !== lastMeeting) {
    lastMeeting = object
    owners = undefined
  }

  $: effectiveOwners = owners ?? object.owners ?? []
  $: isOwner = currentAccountUuid !== undefined && effectiveOwners.includes(currentAccountUuid)
  $: effectiveReadonly = readonly || !isOwner

  let protectedAccounts: AccountUuid[] = []
  $: protectedAccounts = attributeKey === 'members' && currentAccountUuid !== undefined ? [currentAccountUuid] : []

  function handleChange (selectedOwners: AccountUuid[]): void {
    if (!isOwner) return
    owners = selectedOwners
    void onChange?.(selectedOwners)
  }
</script>

<AccountArrayEditor
  {label}
  {value}
  readonly={effectiveReadonly}
  onChange={handleChange}
  {kind}
  {size}
  {width}
  {includeItems}
  {excludeItems}
  {emptyLabel}
  {allowGuests}
  {attributeKey}
  {protectedAccounts}
/>
