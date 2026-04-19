<script lang="ts">
  import contact, { Person, Employee } from '@hcengineering/contact'
  import { EmployeePresenter } from '@hcengineering/contact-resources'
  import { getClient } from '@hcengineering/presentation'
  import { getCurrentLocation, location, Location } from '@hcengineering/ui'
  import { decodeObjectURI } from '@hcengineering/view'
  import { AccountUuid, getCurrentAccount } from '@hcengineering/core'
  import { chunterId, createDirect } from '@hcengineering/chunter'
  import { notificationId } from '@hcengineering/notification'

  import { openChannel } from '../navigation'
  import chunter from '../plugin'

  export let person: Person | undefined

  const client = getClient()
  const hierarchy = client.getHierarchy()

  function canNavigateToDirect (location: Location, person: Person | undefined): boolean {
    const app = location.path[2]
    if (app !== chunterId && app !== notificationId) {
      return false
    }

    if (person === undefined) {
      return false
    }

    return hierarchy.hasMixin(person, contact.mixin.Employee) && (person as Employee).active
  }

  async function openEmployeeDirect (): Promise<void> {
    if (person === undefined) return
    const client = getClient()
    const me = getCurrentAccount()
    if (person.personUuid == null) return

    const dm = await createDirect(client, [me.uuid, person.personUuid as AccountUuid])
    if (dm == null) return

    const loc = getCurrentLocation()
    const [_id] = decodeObjectURI(loc.path[3]) ?? []

    if (_id === dm) {
      return
    }

    openChannel(dm, chunter.class.DirectMessage, undefined, true)
  }
</script>

<EmployeePresenter
  value={person}
  shouldShowAvatar={false}
  compact
  onEmployeeEdit={canNavigateToDirect($location, person) ? openEmployeeDirect : undefined}
/>
