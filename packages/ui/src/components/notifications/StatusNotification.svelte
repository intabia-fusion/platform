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
  import type { Status } from '@hcengineering/platform'

  import NotificationToast from '../NotificationToast.svelte'
  import StatusLabel from '../StatusLabel.svelte'
  import type { Notification } from './Notification'

  export let notification: Notification
  export let onRemove: () => void

  let status: Status
  $: status = notification.params?.status as Status
</script>

<NotificationToast title={notification.title} severity={notification.severity} onClose={onRemove}>
  <svelte:fragment slot="content">
    <StatusLabel {status} />
  </svelte:fragment>
</NotificationToast>
