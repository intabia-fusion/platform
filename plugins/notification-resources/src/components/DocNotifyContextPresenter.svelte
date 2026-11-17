<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import type { WithLookup } from '@hcengineering/core'
  import type { DocNotifyContext } from '@hcengineering/notification'
  import { getClient } from '@hcengineering/presentation'
  import { languageStore } from '@hcengineering/ui'
  import { contextPreview, previewTitle } from '@hcengineering/view-resources'

  import NotifyContextIcon from './NotifyContextIcon.svelte'

  export let value: WithLookup<DocNotifyContext>

  const client = getClient()

  $: previewStore = contextPreview(value)
  $: titleStore = previewTitle(client, $previewStore, $languageStore)
</script>

<div class="flex-presenter">
  <NotifyContextIcon {value} size="small" />
  <div class="mr-4" />

  {$titleStore}
</div>
