<script lang="ts">
  import { getCurrentLocation, SelectPopup } from '@intabiafusion/ui'
  import { getCurrentAccount, Ref } from '@intabiafusion/core'
  import { getClient } from '@intabiafusion/presentation'
  import { createEventDispatcher } from 'svelte'
  import { Employee, formatName } from '@intabiafusion/contact'
  import { getEmbeddedLabel } from '@intabiafusion/platform'
  import { Avatar } from '@intabiafusion/contact-resources'
  import { createDirect } from '@intabiafusion/chunter'
  import { decodeObjectURI } from '@intabiafusion/view'

  import { openChannelInSidebar } from '../../navigation'
  import chunter from '../../plugin'

  export let value: Employee[]

  const dispatch = createEventDispatcher()

  async function select (_id: Ref<Employee>): Promise<void> {
    const employee = value.find((it) => it._id === _id)
    if (employee?.personUuid != null) {
      const client = getClient()
      const me = getCurrentAccount()
      const dm = await createDirect(client, [me.uuid, employee.personUuid])
      const loc = getCurrentLocation()
      const [_id] = decodeObjectURI(loc.path[3]) ?? []

      if (_id !== dm && dm != null) {
        await openChannelInSidebar(dm, chunter.class.DirectMessage, undefined, undefined, true)
      }
    }
    dispatch('close')
  }
</script>

<SelectPopup
  value={value.map((it) => ({
    id: it._id,
    icon: Avatar,
    iconProps: { person: it, size: 'tiny', name: it.name },
    label: getEmbeddedLabel(formatName(it.name)),
    isSelected: false
  }))}
  on:close={(evt) => {
    void select(evt.detail)
  }}
  searchable={false}
  componentLink
  width="medium"
  size="small"
  embedded={false}
  on:changeContent
/>
