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
  import { Button, Label } from '@hcengineering/ui'

  import adminRes from '../plugin'
  import { getRegistrationStats } from '../utils'

  export let refreshTick: number = 0

  let days = 90
  let points: Array<{ day: string, workspaces: number, accounts: number }> = []

  async function load (): Promise<void> {
    const to = Date.now()
    const from = to - days * 24 * 3600 * 1000
    const stats = await getRegistrationStats(from, to)
    if (stats == null) return
    const ws = new Map(stats.workspaces.map((p) => [p.day, p.count]))
    const acc = new Map(stats.accounts.map((p) => [p.day, p.count]))
    const res: typeof points = []
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(to - i * 24 * 3600 * 1000).toISOString().slice(0, 10)
      res.push({ day, workspaces: ws.get(day) ?? 0, accounts: acc.get(day) ?? 0 })
    }
    points = res
  }

  let prevKey = ''
  $: key = `${refreshTick}:${days}`
  $: if (key !== prevKey) {
    prevKey = key
    void load()
  }

  // Chart layout (viewBox units)
  const W = 640
  const H = 100
  const padL = 26
  const padR = 4
  const chartTop = 6
  const chartBottom = 78
  $: chartH = chartBottom - chartTop
  $: slotW = (W - padL - padR) / Math.max(1, points.length)
  $: barW = Math.max(1, slotW * 0.38)

  $: maxVal = Math.max(1, ...points.map((p) => Math.max(p.workspaces, p.accounts)))
  $: midVal = Math.ceil(maxVal / 2)

  // Date labels: ~10 evenly spaced
  $: labelStep = Math.max(1, Math.ceil(points.length / 10))
</script>

<div class="p-3 border">
  <div class="flex-row-center mb-2">
    <span class="fs-title mr-4"><Label label={adminRes.string.Registrations} /></span>
    <Button label={adminRes.string.Days30} kind={days === 30 ? 'primary' : 'regular'} on:click={() => (days = 30)} />
    <Button label={adminRes.string.Days90} kind={days === 90 ? 'primary' : 'regular'} on:click={() => (days = 90)} />
    <span class="ml-4 content-dark-color">
      <span class="ws-color">■</span>
      <Label label={adminRes.string.Workspaces} />
      <span class="ml-2 acc-color">■</span>
      <Label label={adminRes.string.Accounts} />
    </span>
  </div>
  <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
    <!-- Y grid + scale -->
    {#each [{ v: 0, y: chartBottom }, { v: midVal, y: chartBottom - (midVal / maxVal) * chartH }, { v: maxVal, y: chartTop }] as tick}
      <line x1={padL} y1={tick.y} x2={W - padR} y2={tick.y} class="grid-line" />
      <text x={padL - 3} y={tick.y + 2.5} class="axis-text" text-anchor="end">{tick.v}</text>
    {/each}
    {#each points as p, i}
      {@const x = padL + i * slotW}
      {@const wh = (p.workspaces / maxVal) * chartH}
      {@const ah = (p.accounts / maxVal) * chartH}
      <g>
        <title>{p.day}: ws {p.workspaces}, acc {p.accounts}</title>
        <rect {x} y={chartBottom - wh} width={barW} height={wh} class="ws-bar" />
        <rect x={x + barW + 0.5} y={chartBottom - ah} width={barW} height={ah} class="acc-bar" />
        <!-- invisible hover strip for tooltip over empty days -->
        <rect {x} y={chartTop} width={slotW} height={chartH} fill="transparent" />
      </g>
      {#if i % labelStep === 0}
        <text x={x + slotW / 2} y={chartBottom + 10} class="axis-text" text-anchor="middle">{p.day.slice(5)}</text>
        <line x1={x + slotW / 2} y1={chartBottom} x2={x + slotW / 2} y2={chartBottom + 2} class="grid-line" />
      {/if}
    {/each}
  </svg>
</div>

<style lang="scss">
  .ws-bar {
    fill: var(--primary-button-default, #3b82f6);
  }
  .acc-bar {
    fill: var(--positive-button-default, #22c55e);
  }
  .ws-color {
    color: var(--primary-button-default, #3b82f6);
  }
  .acc-color {
    color: var(--positive-button-default, #22c55e);
  }
  .grid-line {
    stroke: var(--theme-divider-color, #8883);
    stroke-width: 0.5;
  }
  .axis-text {
    fill: var(--theme-dark-color, #888);
    font-size: 7px;
  }
</style>
