<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import type { Class, Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import type { ChunterSpace } from '@hcengineering/chunter'

  import ChannelView from './ChannelView.svelte'

  export let _id: Ref<ChunterSpace>
  export let _class: Ref<Class<ChunterSpace>>
  export let autofocus = true

  const objectQuery = createQuery()

  let object: ChunterSpace | undefined = undefined
  // The chat opens by the id at once and closes if the space turns out not to be there
  let missing = false

  $: objectQuery.query(_class, { _id }, (res) => {
    object = res[0]
    missing = res[0] == null
  })
</script>

{#if !missing}
  <ChannelView {_id} {_class} object={object?._id === _id ? object : undefined} {autofocus} on:close />
{/if}
