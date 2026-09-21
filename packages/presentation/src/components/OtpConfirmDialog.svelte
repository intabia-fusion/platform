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
<!-- Asks for a code sent by email and closes with it. Every label is a prop: the wording and the
     request itself belong to whoever opens the dialog. -->
<script lang="ts">
  import { type IntlString } from '@hcengineering/platform'
  import { Button, CheckBox, EditBox, Label, ticker1 } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import Card from './Card.svelte'

  export let label: IntlString
  export let okLabel: IntlString
  export let codeLabel: IntlString
  export let sendLabel: IntlString
  export let sentLabel: IntlString
  export let failedLabel: IntlString
  export let message: IntlString | undefined = undefined
  export let messageParams: Record<string, any> | undefined = undefined
  export let optionLabel: IntlString | undefined = undefined
  export let codeLength: number = 6
  export let requestCode: () => Promise<{ retryOn: number }>

  const dispatch = createEventDispatcher()

  let code = ''
  let option = false
  let retryOn = 0
  let sending = false
  let sent = false
  let sendFailed = false

  async function sendCode (): Promise<void> {
    if (sending) return
    sending = true
    sendFailed = false
    try {
      const info = await requestCode()
      retryOn = info.retryOn
      sent = true
    } catch (err) {
      console.error('Failed to send the confirmation code:', err)
      sendFailed = true
    } finally {
      sending = false
    }
  }

  void sendCode()

  $: retryLeft = Math.max(0, Math.ceil((retryOn - $ticker1) / 1000))
  $: canConfirm = code.trim().length === codeLength
</script>

<Card
  {label}
  {okLabel}
  canSave={canConfirm}
  okAction={() => {
    dispatch('close', { code: code.trim(), option })
  }}
  on:close={() => dispatch('close', undefined)}
>
  <div class="flex-col">
    {#if message !== undefined}
      <div class="mb-2"><Label label={message} params={messageParams ?? {}} /></div>
    {/if}
    <div class="mb-2">
      {#if sendFailed}
        <span class="error-color"><Label label={failedLabel} /></span>
      {:else if sent}
        <Label label={sentLabel} />
      {/if}
    </div>
    <div class="flex-row-center">
      <EditBox bind:value={code} placeholder={codeLabel} kind={'large-style'} autoFocus />
      <div class="ml-4">
        <Button label={sendLabel} disabled={sending || retryLeft > 0} on:click={sendCode} />
      </div>
      {#if retryLeft > 0}
        <span class="ml-2 content-dark-color">{retryLeft}s</span>
      {/if}
    </div>
    {#if optionLabel !== undefined}
      <div class="flex-row-center mt-2" data-id="otpConfirmOptional">
        <CheckBox bind:checked={option} />
        <span class="ml-1"><Label label={optionLabel} /></span>
      </div>
    {/if}
  </div>
</Card>
