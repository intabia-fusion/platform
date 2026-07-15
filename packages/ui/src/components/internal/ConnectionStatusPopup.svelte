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
  import uiPlugin from '../../plugin'
  import Label from '../Label.svelte'
  import { connOnline, connRate, connCooldown, connStats } from './connectionStatusStore'

  const kb = (b: number): string => (b / 1024).toFixed(1)
</script>

<div class="antiPopup connStats" style:padding={'12px'}>
  <div class="fs-title"><Label label={uiPlugin.string.Connection} /></div>
  <div class="row">
    <Label label={$connOnline ? uiPlugin.string.Connected : uiPlugin.string.Reconnecting} />
  </div>
  {#if $connRate !== undefined}
    <div class="row">
      <span class="key"><Label label={uiPlugin.string.RateLimit} /></span>
      <Label
        label={uiPlugin.string.RateLimitValue}
        params={{ remaining: $connRate.remaining, limit: $connRate.limit, seconds: $connCooldown }}
      />
    </div>
  {/if}
  <div class="row">
    <span class="key"><Label label={uiPlugin.string.Sent} /></span>
    <Label label={uiPlugin.string.TrafficValue} params={{ count: $connStats.sent, kb: kb($connStats.sentBytes) }} />
  </div>
  <div class="row">
    <span class="key"><Label label={uiPlugin.string.Received} /></span>
    <Label
      label={uiPlugin.string.TrafficValue}
      params={{ count: $connStats.received, kb: kb($connStats.receivedBytes) }}
    />
  </div>
  <div class="row">
    <span class="key"><Label label={uiPlugin.string.Latency} /></span>
    <Label label={uiPlugin.string.LatencyValue} params={{ ms: $connStats.latency }} />
  </div>
</div>

<style lang="scss">
  .connStats {
    flex-direction: column;
    gap: 0.375rem;
    min-width: 15rem;

    .row {
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
    }
    .key {
      color: var(--theme-dark-color);
    }
  }
</style>
