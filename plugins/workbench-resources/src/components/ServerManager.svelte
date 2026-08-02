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
<!-- Client-side statistics of the current session (server statistics live in the /admin panel) -->
<script lang="ts">
  import { metricsAggregate, type Metrics } from '@hcengineering/core'
  import presentation, { uiContext } from '@hcengineering/presentation'
  import { Breadcrumb, ButtonIcon, Header, IconClose, IconSettings, ticker } from '@hcengineering/ui'
  import { MetricsInfo } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  let metrics: Metrics | undefined

  function update (tick: number): void {
    metrics = metricsAggregate(uiContext.metrics)
  }

  $: update($ticker)
</script>

<div class="hulyComponent">
  <Header type={'type-panel'} freezeBefore>
    <svelte:fragment slot="beforeTitle">
      <ButtonIcon
        icon={IconClose}
        kind={'secondary'}
        size={'small'}
        tooltip={{ label: presentation.string.Close }}
        on:click={() => dispatch('close')}
      />
    </svelte:fragment>

    <Breadcrumb icon={IconSettings} title={'Client statistics'} size={'large'} isCurrent />
  </Header>

  <div class="hulyComponent-content__column content">
    {#if metrics}
      <MetricsInfo {metrics} sortOrder={'avg'} />
    {/if}
  </div>
</div>
