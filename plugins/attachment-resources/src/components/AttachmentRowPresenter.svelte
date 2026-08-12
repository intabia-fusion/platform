<script lang="ts">
  import { type Attachment } from '@hcengineering/attachment'
  import { AccountRole, getCurrentAccount, type PersonId } from '@hcengineering/core'
  import { getAllSocialStringsByPersonRef, getCurrentEmployee } from '@hcengineering/contact'
  import { getResource } from '@hcengineering/platform'
  import { getClient, MessageBox } from '@hcengineering/presentation'
  import { showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount } from 'svelte'

  import attachmentPlugin from '../plugin'
  import AttachmentPresenter from './AttachmentPresenter.svelte'

  export let value: Attachment | undefined

  const me = getCurrentAccount()
  let mySocialStrings = new Set<string>()

  onMount(async () => {
    const client = getClient()
    mySocialStrings = new Set(await getAllSocialStringsByPersonRef(client, getCurrentEmployee()))
  })

  $: isOwn = value !== undefined && (me.role === AccountRole.Owner || mySocialStrings.has(value.createdBy as PersonId))

  function removeAttachmentWithConfirmation (attachment: Attachment): void {
    showPopup(
      MessageBox,
      {
        label: view.string.DeleteObject,
        message: view.string.DeleteObjectConfirm,
        params: { count: 1 },
        action: async () => {
          const impl = await getResource(attachmentPlugin.actionImpl.DeleteAttachment)
          await impl(attachment)
        }
      },
      'top'
    )
  }
</script>

<AttachmentPresenter
  {value}
  removable={isOwn}
  on:remove={(ev) => {
    if (ev.detail !== undefined && value !== undefined) {
      removeAttachmentWithConfirmation(value)
    }
  }}
/>
