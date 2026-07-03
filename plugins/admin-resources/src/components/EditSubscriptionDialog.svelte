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
  import type { Subscription } from '@hcengineering/account-client'
  import { Card } from '@hcengineering/presentation'
  import { EditBox, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import adminRes from '../plugin'
  import { getAccountClient, requestAdminOtpCode } from '../utils'

  export let subscription: Subscription
  export let perSeatPlan: boolean = false

  const dispatch = createEventDispatcher()
  const accountClient = getAccountClient()

  let seats: number = subscription.limits?.usersLimit ?? 1
  // Date input as YYYY-MM-DD; empty means "keep as is"
  let periodEndDate: string =
    subscription.periodEnd != null ? new Date(subscription.periodEnd).toISOString().slice(0, 10) : ''
  let saving = false

  async function save (): Promise<void> {
    if (saving) return
    const seatsValid = perSeatPlan && Number.isFinite(seats) && seats >= 1
    const seatsChanged = seatsValid && Math.round(seats) !== (subscription.limits?.usersLimit ?? 0)
    const periodMs = periodEndDate !== '' ? new Date(periodEndDate + 'T00:00:00Z').getTime() : undefined
    const periodChanged = periodMs != null && Number.isFinite(periodMs) && periodMs !== subscription.periodEnd
    if (!seatsChanged && !periodChanged) {
      dispatch('close', undefined)
      return
    }
    // Subscription edit is billing-impactful -> OTP-gated on the server
    const code = await requestAdminOtpCode()
    if (code === undefined) return
    saving = true
    try {
      await accountClient.adminUpdateSubscription(
        subscription.id,
        code,
        seatsChanged ? Math.round(seats) : undefined,
        periodChanged ? periodMs : undefined
      )
      dispatch('close', true)
    } catch (err) {
      console.error('Failed to update subscription:', err)
    } finally {
      saving = false
    }
  }
</script>

<Card
  label={adminRes.string.EditSubscription}
  okLabel={adminRes.string.Save}
  canSave={!saving}
  okAction={save}
  on:close={() => dispatch('close', undefined)}
>
  <div class="flex-col">
    {#if perSeatPlan}
      <div class="flex-row-center mb-2">
        <span class="mr-2"><Label label={adminRes.string.Seats} />:</span>
        <div class="num-input">
          <EditBox bind:value={seats} format={'number'} kind={'editbox'} />
        </div>
      </div>
    {/if}
    <div class="flex-row-center">
      <span class="mr-2"><Label label={adminRes.string.PeriodEnd} />:</span>
      <input type="date" bind:value={periodEndDate} class="date-input" />
    </div>
  </div>
</Card>

<style lang="scss">
  .num-input {
    width: 5rem;
  }
  .date-input {
    background: var(--theme-bg-color);
    color: var(--theme-content-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem;
    padding: 0.25rem 0.5rem;
  }
</style>
