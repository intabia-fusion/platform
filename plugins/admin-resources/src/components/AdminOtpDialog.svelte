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
  import { Card } from '@hcengineering/presentation'
  import { Button, EditBox, Label, ticker1 } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import adminRes from '../plugin'
  import { getAccountClient } from '../utils'

  const dispatch = createEventDispatcher()
  const accountClient = getAccountClient()

  let code = ''
  let retryOn = 0
  let sending = false
  let sent = false
  let sendFailed = false

  async function sendCode (): Promise<void> {
    if (sending) return
    sending = true
    sendFailed = false
    try {
      const info = await accountClient.requestAdminOperationOtp()
      retryOn = info.retryOn
      sent = true
    } catch (err) {
      console.error('Failed to send OTP:', err)
      sendFailed = true
    } finally {
      sending = false
    }
  }

  void sendCode()

  $: retryLeft = Math.max(0, Math.ceil((retryOn - $ticker1) / 1000))
  $: canConfirm = code.trim().length === 6
</script>

<Card
  label={adminRes.string.OtpConfirmTitle}
  okLabel={adminRes.string.Confirm}
  canSave={canConfirm}
  okAction={() => {
    dispatch('close', code.trim())
  }}
  on:close={() => dispatch('close', undefined)}
>
  <div class="flex-col">
    <div class="mb-2">
      {#if sendFailed}
        <span class="error-color"><Label label={adminRes.string.OtpSendFailed} /></span>
      {:else if sent}
        <Label label={adminRes.string.OtpSent} />
      {/if}
    </div>
    <div class="flex-row-center">
      <EditBox bind:value={code} placeholder={adminRes.string.OtpCode} kind={'large-style'} autoFocus />
      <div class="ml-4">
        <Button label={adminRes.string.SendCode} disabled={sending || retryLeft > 0} on:click={sendCode} />
      </div>
      {#if retryLeft > 0}
        <span class="ml-2 content-dark-color">{retryLeft}s</span>
      {/if}
    </div>
  </div>
</Card>
