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
  import { createEventDispatcher } from 'svelte'
  import { type Ref } from '@hcengineering/core'
  import { Icon, IconCheck, Label, getCurrentLocation, navigate } from '@hcengineering/ui'
  import type { Application } from '@hcengineering/workbench'

  export let apps: Application[] = []
  export let active: Ref<Application> | undefined = undefined

  const dispatch = createEventDispatcher()

  function selectApp (app: Application): void {
    const loc = getCurrentLocation()
    loc.path[2] = app.alias
    loc.path.length = 3
    loc.fragment = undefined
    loc.query = undefined
    navigate(loc)
    dispatch('close')
  }
</script>

<div class="antiPopup min-w-60">
  <div class="ap-space x2" />
  <div class="ap-scroll">
    <div class="ap-box">
      {#each apps as app}
        <button
          class="ap-menuItem withIcon flex-row-center flex-grow"
          on:click={() => {
            selectApp(app)
          }}
        >
          <div class="icon mr-2"><Icon icon={app.icon} size={'small'} /></div>
          <span class="label overflow-label flex-grow"><Label label={app.label} /></span>
          <div class="ap-check">
            {#if app._id === active}
              <IconCheck size={'small'} />
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>
  <div class="ap-space x2" />
</div>
