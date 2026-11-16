<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { deviceOptionsStore as deviceInfo, TimeLeft } from '@hcengineering/ui'
  import { OK, Severity, Status } from '@hcengineering/platform'
  import { createEventDispatcher, onDestroy } from 'svelte'
  import type { Timestamp } from '@hcengineering/core'
  import type { LoginInfo, OnboardingIntent } from '@hcengineering/account-client'
  import { Analytics } from '@hcengineering/analytics'

  import FormButton from './internal/FormButton.svelte'
  import Label from './internal/Label.svelte'
  import LoginCodeInput from './internal/LoginCodeInput.svelte'
  import { OtpLoginSteps } from '../index'
  import { confirmEmailOtp, doLoginNavigate, doValidateOtp, loginOtp, requestEmailOtp } from '../utils'
  import login from '../plugin'
  import { saveAuthEmail } from '../utils'
  import StatusControl from './StatusControl.svelte'
  import { LoginEvents } from '../analytics'

  export let navigateUrl: string | undefined = undefined
  export let email: string
  export let retryOn: Timestamp
  export let canChangeEmail = true
  export let onLogin: ((loginInfo: LoginInfo | null, status: Status) => void | Promise<void>) | undefined = undefined
  export let emailFirst = false
  export let intent: OnboardingIntent | undefined = undefined
  export let consent: { personalData: boolean, rules: boolean } | undefined = undefined

  const dispatch = createEventDispatcher()

  const fields = [
    { id: 'otp1', name: 'otp1', optional: false },
    { id: 'otp2', name: 'otp2', optional: false },
    { id: 'otp3', name: 'otp3', optional: false },
    { id: 'otp4', name: 'otp4', optional: false },
    { id: 'otp5', name: 'otp5', optional: false },
    { id: 'otp6', name: 'otp6', optional: false }
  ]

  let status = OK
  let inputBlocked = false
  let validating = false

  const otpData: Record<string, string> = {
    otp1: '',
    otp2: '',
    otp3: '',
    otp4: '',
    otp5: '',
    otp6: ''
  }
  $: codeComplete = Object.values(otpData).every((value) => value !== '')

  let formElement: HTMLFormElement | undefined

  function trim (field: string): void {
    otpData[field] = otpData[field].trim()
  }

  async function validateOtp (): Promise<void> {
    if (!codeComplete || inputBlocked || validating) {
      return
    }
    validating = true
    status = new Status(Severity.INFO, login.status.ConnectingToServer, {})

    const otp = otpData.otp1 + otpData.otp2 + otpData.otp3 + otpData.otp4 + otpData.otp5 + otpData.otp6
    const [loginStatus, result] = emailFirst
      ? await confirmEmailOtp(email, otp, intent, consent)
      : await doValidateOtp(email, otp)
    validating = false
    status = loginStatus
    if (typeof status.params?.retryOn === 'number' && status.params.retryOn > Date.now()) {
      retryOn = status.params.retryOn
      inputBlocked = true
      canResend = false
      timer?.restart(retryOn)
    }

    if (result != null) {
      if (emailFirst && result.created === true) Analytics.handleEvent(LoginEvents.SignUpOtp, { ok: true })
      saveAuthEmail(null)
    }

    if (onLogin !== undefined) {
      void onLogin(result, status)
    } else {
      await doLoginNavigate(
        result,
        (st) => {
          status = st
        },
        navigateUrl
      )
    }
  }

  function onInput (e: Event): void {
    if (e.target == null) return

    const target = e.target as HTMLInputElement
    const { value } = target

    if (value == null || value === '') return

    if (value.length === fields.length) {
      pasteOtpCode(value)
    } else {
      const index = fields.findIndex(({ id }) => id === target.id)
      if (index === -1) return

      target.value = value[0]

      const nextField = fields[index + 1]
      if (nextField === undefined) return

      const nextInput = formElement?.querySelector(`input[name="${nextField.name}"]`) as HTMLInputElement
      if (nextInput != null) {
        nextInput.focus()
      }
    }
  }

  function clearOtpData (): void {
    Object.keys(otpData).forEach((key) => {
      otpData[key] = ''
    })

    const input = formElement?.querySelector(`input[name="${fields[0].name}"]`) as HTMLInputElement
    if (input != null) {
      input.focus()
    }
  }

  function onKeydown (e: KeyboardEvent): void {
    const key = e.key.toLowerCase()
    const target = e.target as HTMLInputElement

    if (key !== 'backspace' && key !== 'delete') return

    const index = fields.findIndex(({ id }) => id === target.id)
    if (index === -1) return
    const { value } = target

    status = OK
    target.value = ''
    otpData[fields[index].name] = ''

    if (value === '') {
      const prevField = fields[index - 1]
      if (prevField === undefined) return
      const prevInput = formElement?.querySelector(`input[name="${prevField.name}"]`) as HTMLInputElement
      if (prevInput != null) {
        prevInput.focus()
      }
    }
  }

  function onPaste (e: ClipboardEvent): void {
    e.preventDefault()

    if (e.clipboardData == null) return

    const text = e.clipboardData.getData('text')
    pasteOtpCode(text)
  }

  function pasteOtpCode (text: string): boolean {
    const digits = text.split('').filter((it) => it !== ' ')

    if (digits.length !== fields.length) {
      return false
    }

    let focusName: string | undefined = undefined

    for (const field of fields) {
      const digit = digits.shift()
      if (digit === undefined) break
      otpData[field.name] = digit
      focusName = field.name
    }

    if (focusName !== undefined && focusName !== '' && formElement) {
      const input = formElement.querySelector(`input[name="${focusName}"]`) as HTMLInputElement | undefined
      input?.focus()
    }

    return true
  }

  $: if (formElement != null) {
    formElement.addEventListener('input', onInput)
    formElement.addEventListener('keydown', onKeydown)
    formElement.addEventListener('paste', onPaste)
    const firstInput = formElement.querySelector(`input[name="${fields[0].name}"]`) as HTMLInputElement | undefined
    firstInput?.focus()
  }

  onDestroy(() => {
    if (formElement !== undefined) {
      formElement.removeEventListener('input', onInput)
      formElement.removeEventListener('keydown', onKeydown)
      formElement.removeEventListener('paste', onPaste)
    }
  })

  async function resendCode (): Promise<void> {
    status = new Status(Severity.INFO, login.status.ConnectingToServer, {})
    const [otpStatus, result] = emailFirst ? await requestEmailOtp(email, consent) : await loginOtp(email)
    status = otpStatus

    if (typeof status.params?.retryOn === 'number' && status.params.retryOn > Date.now()) {
      retryOn = status.params.retryOn
      inputBlocked = true
      canResend = false
      timer?.restart(retryOn)
    }

    if (result?.sent === true && otpStatus === OK) {
      retryOn = result.retryOn
      clearOtpData()
      if (timer !== undefined) timer.restart(retryOn)
      canResend = false
    }
  }
  let canResend = false

  let timer: TimeLeft | undefined
</script>

<form
  bind:this={formElement}
  class="container"
  style:padding={$deviceInfo.docWidth <= 480 ? '1.25rem 1rem' : '1.25rem 2rem 2rem'}
  on:submit|preventDefault={validateOtp}
>
  <div class="header">
    <div class="description"><Label label={login.string.SentTo} /></div>
    <div class="recipient-row">
      <span class="email">{email}</span>
      {#if canChangeEmail}
        <FormButton
          type="button"
          kind="ghost"
          shape="round"
          size="small"
          on:click={() => {
            dispatch('step', OtpLoginSteps.Email)
          }}
        >
          <Label label={login.string.ChangeEmail} />
        </FormButton>
      {/if}
    </div>
    <div class="title" id="otp-title"><Label label={login.string.EnterCode} variant="heading" /></div>
  </div>

  <div class="form">
    {#each fields as field, index (field.name)}
      <div class="form-row">
        <span class="visually-hidden" id={`otp-position-${index}`}>{index + 1} / {fields.length}</span>
        <LoginCodeInput
          id={field.id}
          name={field.name}
          aria-labelledby={`otp-title otp-position-${index}`}
          size="medium"
          bind:value={otpData[field.name]}
          disabled={inputBlocked}
          on:blur={() => {
            trim(field.name)
          }}
        />
      </div>
    {/each}
  </div>

  <div class="confirm-code">
    <FormButton
      type="submit"
      label={login.string.ConfirmCode}
      kind="contrast"
      shape="round"
      size="x-large"
      width="100%"
      loading={validating}
      disabled={!codeComplete || inputBlocked}
    />
  </div>

  <div class="footer">
    <FormButton type="button" kind="ghost" width="100%" disabled={!canResend} on:click={resendCode}>
      <Label label={login.string.ResendCode} />
    </FormButton>
    <div class="time" class:hidden={canResend}>
      <Label label={login.string.ResendAvailableIn} />
      <TimeLeft
        bind:this={timer}
        time={retryOn}
        on:timeout={() => {
          canResend = true
          inputBlocked = false
        }}
      />
    </div>
  </div>

  <div class="status mt-2">
    <StatusControl {status} />
  </div>
</form>

<style lang="scss">
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .confirm-code {
    margin-top: 1.25rem;
  }

  .separator {
    display: block;
    width: 0.75rem;
    height: 1px;
    background-color: var(--login-button-border, var(--theme-button-border));
    flex-shrink: 0;
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .header .title-row {
    position: relative;
    min-height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .header .title-row > :global(.form-button) {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    color: var(--login-caret-color, inherit); /* Intabia: black; other themes: inherit */
    padding: 0.25rem;
    min-width: 2.25rem;
    height: 2.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .header .title {
    margin: 0 auto;
    text-align: center;
    font-weight: var(--login-title-font-weight, 500);
    font-size: var(--login-title-font-size, 1.25rem);
    color: var(--login-caption-color, var(--theme-caption-color));
  }

  .header .description {
    font-size: 1rem;
    color: var(--login-darker-color, var(--theme-darker-color));
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    text-align: center;
  }
  .header .email {
    color: var(--login-caption-color, var(--theme-caption-color));
  }

  .status {
    min-height: 2.375rem;
  }

  .footer {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 4.625rem;
    color: var(--login-darker-color, var(--theme-darker-color));
  }

  .container {
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .container .form {
    display: flex;
    gap: 0.4rem;
    margin-top: 1.5rem;
    align-items: center;
  }

  /* Reduce spacing on narrow screens so action buttons fit without changing their size */
  @media (max-width: 600px) {
    .container .form {
      gap: 0.375rem;
      margin-top: 1rem;
    }
    /* Six fixed 60px cells overflow a phone; let each row share the width. */
    .container .form .form-row {
      flex: 1 1 0;
      min-width: 0;
    }
    /* LoginCodeInput's wrapper must stretch too, or 100% has no basis. */
    .container .form .form-row > :global(.container) {
      width: 100%;
    }
    .container .form .form-row :global(input) {
      width: 100%;
      height: 3.5rem;
      font-size: 1.5rem;
    }
    .separator {
      width: 0.375rem;
    }
    .footer {
      gap: 0.125rem;
      min-height: 3.5rem;
    }
    /* The page scrolls as a whole; clipping here would hide content. */
    .container {
      overflow: visible;
    }
    .header .description {
      flex-wrap: wrap;
      font-size: 0.875rem;
    }
    .header .email {
      word-break: break-all;
    }
  }

  .time {
    color: var(--login-caption-color, var(--theme-caption-color));
  }
  .recipient-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .recipient-row .email {
    overflow-wrap: anywhere;
    font-weight: 600;
  }

  .header .title {
    margin: 1.5rem 0 0;
    text-align: left;
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 2.25rem;
  }

  .header .description {
    justify-content: flex-start;
    font-size: 0.875rem;
    text-align: left;
  }

  .footer {
    margin-top: 1rem;
    gap: 1rem;
  }

  .time {
    font-size: 0.8125rem;
  }
  .hidden {
    visibility: hidden;
  }

  .container .form {
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .container .form .form-row {
    flex: 1 1 0;
    min-width: 0;
  }

  .container .form .form-row > :global(.container) {
    width: 100%;
  }
  .container .form .form-row :global(input) {
    width: 100%;
    height: 4.25rem;
  }
</style>
