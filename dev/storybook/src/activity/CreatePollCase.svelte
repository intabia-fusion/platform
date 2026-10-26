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
  import activity from '@hcengineering/activity'
  import CreatePoll from '@hcengineering/activity-resources/src/components/poll/CreatePoll.svelte'
  import { getClient } from '@hcengineering/presentation'
  import { showPopup, type PopupResult } from '@hcengineering/ui'
  import { onDestroy, onMount } from 'svelte'

  const applet = getClient().getModel().findObject(activity.applet.Poll)
  let popup: PopupResult | undefined

  onMount(() => {
    popup = showPopup(CreatePoll, { applet }, 'center')
  })
  onDestroy(() => {
    popup?.close()
  })
</script>
