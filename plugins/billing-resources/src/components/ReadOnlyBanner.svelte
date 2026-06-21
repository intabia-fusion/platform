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
  import { Icon, Label, tooltip } from '@hcengineering/ui'
  import billing from '@hcengineering/billing'
  import { onFreePlan, isLimited } from '../stores/subscription'
  import { upgradePlan } from '../utils'

  // Read-only banner (error) when over free-seat limit; free-plan chip (info) when unpaid but on free fallback.
  $: readOnly = $isLimited
  $: message = billing.string.SeatLimitReadonly
</script>

{#if readOnly}
  <button
    type="button"
    class="read-only-indicator"
    data-id="billingReadOnlyBanner"
    use:tooltip={{ label: message, direction: 'bottom' }}
    on:click={() => {
      upgradePlan().catch(console.error)
    }}
  >
    <Icon icon={billing.icon.Billing} size={'small'} />
    <span><Label label={billing.string.PayOrUpgrade} /></span>
  </button>
{:else if $onFreePlan}
  <button
    type="button"
    class="free-plan-indicator"
    data-id="billingFreePlanBanner"
    use:tooltip={{ label: billing.string.FreePlanHint, direction: 'bottom' }}
    on:click={() => {
      upgradePlan().catch(console.error)
    }}
  >
    <Icon icon={billing.icon.Billing} size={'small'} />
    <span><Label label={billing.string.FreePlan} /></span>
  </button>
{/if}

<style lang="scss">
  .read-only-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: var(--small-BorderRadius);
    border: none;
    background: var(--system-error-color, #d32f2f);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    outline: none;

    &:hover {
      filter: brightness(1.1);
    }
  }
  .free-plan-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: var(--small-BorderRadius);
    border: 1px solid var(--theme-divider-color);
    background: var(--theme-button-default);
    color: var(--theme-content-color);
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    outline: none;

    &:hover {
      background: var(--theme-button-hovered);
    }
  }
</style>
