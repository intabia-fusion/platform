<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import { getCurrentWorkspaceUuid, getFileSrcSet, getFileUrl } from '@intabiafusion/presentation'
  import { WorkspaceLogo } from '@intabiafusion/ui'

  import { workspacesStore } from '../utils'
  import { workspacesNotificationStore } from '../workbench'

  export let mini: boolean = false
  export let workspace: string

  const currentWorkspaceUuid = getCurrentWorkspaceUuid()

  $: currentWorkspace = $workspacesStore.find((w) => w.uuid === currentWorkspaceUuid)
  $: url = currentWorkspace?.logo != null ? getFileUrl(currentWorkspace.logo) : undefined
  $: srcset = currentWorkspace?.logo != null ? getFileSrcSet(currentWorkspace.logo, 128) : undefined

  $: workspacesNotification = $workspacesNotificationStore

  $: notify = $workspacesStore.some(
    (it) => it.uuid !== currentWorkspaceUuid && workspacesNotification?.[it.uuid] === true
  )
</script>

<WorkspaceLogo name={workspace ?? ''} {mini} logoUrl={url} logoSrcset={srcset} accent {notify} />
