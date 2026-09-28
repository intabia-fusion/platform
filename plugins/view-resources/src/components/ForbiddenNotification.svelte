<script lang="ts">
  import type { Notification } from '@hcengineering/ui'
  import { NotificationToast } from '@hcengineering/ui'

  export let onRemove: () => void
  export let notification: Notification
</script>

<NotificationToast title={notification.title} severity={notification.severity} onClose={onRemove}>
  <svelte:fragment slot="content">
    {notification.subTitle}
  </svelte:fragment>
</NotificationToast>
