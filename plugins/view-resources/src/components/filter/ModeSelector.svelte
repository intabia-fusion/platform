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
  import { getClient } from '@intabiafusion/presentation'
  import { SelectPopup } from '@intabiafusion/ui'
  import { Filter, FilterMode } from '@intabiafusion/view'
  import { createEventDispatcher } from 'svelte'
  import view from '../../plugin'

  export let filter: Filter

  const client = getClient()

  const dispatch = createEventDispatcher()

  let modes: FilterMode[] = []

  client.findAll(view.class.FilterMode, { _id: { $in: filter.modes } }).then((res) => {
    modes = res
  })
</script>

<SelectPopup
  value={modes.map((it) => ({ ...it, id: it._id }))}
  on:close={(evt) => {
    dispatch('close', evt.detail)
  }}
/>
