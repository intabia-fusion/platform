<!--
// Copyright © 2026 Intabia Fusion
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
  import { Ref } from '@hcengineering/core'
  import { IntlString } from '@hcengineering/platform'
  import { Project } from '@hcengineering/tracker'
  import { Button, IconAdd, SelectPopup, SelectPopupValueType, showPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../../plugin'
  import NewComponent from './NewComponent.svelte'

  export let value: SelectPopupValueType[]
  export let placeholder: IntlString = tracker.string.AddToComponent
  export let space: Ref<Project> | undefined = undefined

  const dispatch = createEventDispatcher()
</script>

<SelectPopup {value} {placeholder} searchable on:close={(evt) => dispatch('close', evt.detail)} on:changeContent>
  <svelte:fragment slot="buttons">
    {#if space !== undefined}
      <div class="p-1">
        <Button
          kind={'ghost'}
          size={'large'}
          icon={IconAdd}
          dataId={'btnAdd'}
          on:click={() => {
            showPopup(NewComponent, { space }, 'top')
            dispatch('close')
          }}
        />
      </div>
    {/if}
  </svelte:fragment>
</SelectPopup>
