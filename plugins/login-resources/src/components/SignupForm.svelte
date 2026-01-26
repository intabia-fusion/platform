<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2022 Hardcore Engineering Inc.
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
  import { OK, Severity, Status } from '@hcengineering/platform'
  import { logIn } from '@hcengineering/workbench'
  import { signupStore } from '@hcengineering/analytics-providers'

  import Label from './internal/Label.svelte'
  import login from '../plugin'
  import { getPasswordValidationRules } from '../validations'
  import { goTo } from '../utils'
  import Form from './Form.svelte'
  import { OtpLoginSteps, signUp, signUpOtp } from '../index'
  import type { Field } from '../types'
  import OtpForm from './OtpForm.svelte'
  import { onMount } from 'svelte'

  export let signUpDisabled = false
  export let localLoginHidden = false
  export let navigateUrl: string | undefined = undefined
  export let useOTP = true // False only for dev/tests

  let fields: Array<Field>
  let form: Form
  let withPassword = !useOTP

  $: {
    fields = [
      { id: 'given-name', name: 'first', i18n: login.string.FirstName },
      { id: 'family-name', name: 'last', i18n: login.string.LastName },
      { id: 'email', name: 'username', i18n: login.string.Email }
    ]

    if (withPassword) {
      fields.push({
        id: 'password',
        name: 'password',
        i18n: login.string.Password,
        password: true,
        rules: getPasswordValidationRules()
      })
      fields.push({ id: 'password', name: 'password2', i18n: login.string.PasswordRepeat, password: true })
    }
  }

  const object = {
    first: '',
    last: '',
    username: '',
    password: '',
    password2: ''
  }

  let status: Status<any> = OK
  let step = OtpLoginSteps.Email
  let otpRetryOn = 0

  if (signUpDisabled || localLoginHidden) {
    goTo('login')
  }

  onMount(() => {
    signupStore.setSignUpFlow(true)
  })

  const action = {
    i18n: login.string.SignUp,
    func: async () => {
      if (useOTP) {
        status = new Status(Severity.INFO, login.status.ConnectingToServer, {})

        const [otpStatus, result] = await signUpOtp(object.username, object.first, object.last)
        status = otpStatus

        if (result?.sent === true && otpStatus === OK) {
          step = OtpLoginSteps.Otp
          otpRetryOn = result.retryOn
        }
      } else {
        const [loginStatus, result] = await signUp(object.username, object.password, object.first, object.last)

        status = loginStatus

        if (result != null) {
          await logIn(result)
          goTo('confirmationSend')
        }
      }
    }
  }

  function revalidateAndFocusPassword (): void {
    setTimeout(() => {
      if (form != null) {
        form.invalidate()
      }
      if (withPassword) {
        const pw = document.querySelector('input[name="password"]')
        if (pw instanceof HTMLInputElement) pw.focus()
      }
    }, 0)
  }

  function handleStep (event: CustomEvent<OtpLoginSteps>): void {
    step = event.detail
  }
</script>

{#if step === OtpLoginSteps.Email}
  <Form bind:this={form} caption={login.string.SignUp} {status} {fields} {object} {action} withProviders>
    <div slot="after-fields" class="form-row">
      {#if useOTP}
        <label class="check-label">
          <input
            type="checkbox"
            bind:checked={withPassword}
            on:change={() => {
              step = OtpLoginSteps.Email
              revalidateAndFocusPassword()
            }}
          />
          <Label label={login.string.SetPasswordNow} />
        </label>
      {/if}
    </div>
  </Form>
{/if}

{#if step === OtpLoginSteps.Otp && object.username !== ''}
  <OtpForm
    email={object.username}
    {navigateUrl}
    loginState="signup"
    password={object.password}
    retryOn={otpRetryOn}
    on:step={handleStep}
  />
{/if}

<style lang="scss">
  // TODO: Refactor me please
  .action {
    margin-left: 5rem;
  }

  .placeholder {
    height: 1.125rem;
  }

  /* Checkbox row for "Set password now" */
  .check-label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    color: var(--login-content-color, var(--theme-content-color));
  }

  /* Custom-styled checkbox so it's visible across themes (Intabia/Huly).
     Keep visuals simple and theme-aware via `--login-*` tokens (fallbacks to global tokens). */
  .check-label input[type='checkbox'] {
    -webkit-appearance: none;
    appearance: none;
    width: 1.125rem;
    height: 1.125rem;
    /* Thicker, more contrasting border to ensure visibility on light backgrounds */
    border: 2px solid var(--login-darker-color, var(--theme-darker-color, rgba(0, 0, 0, 0.2)));
    background: var(--login-button-default, var(--theme-button-default, #ffffff));
    border-radius: 0.2rem;
    display: inline-block;
    position: relative;
    box-sizing: border-box;
    vertical-align: middle;
    /* Provide native accent fallback so platform checkboxes remain visible when appearance can't be suppressed */
    accent-color: var(--login-primary-button-default, var(--primary-button-default));
  }

  .check-label input[type='checkbox']:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
  }

  .check-label input[type='checkbox']:checked {
    background: var(--login-primary-button-default, var(--primary-button-default, #cf13a2));
    border-color: var(--login-primary-button-default, var(--primary-button-default));
  }

  .check-label input[type='checkbox']:checked::after {
    content: '';
    position: absolute;
    left: 0.36rem;
    top: 0.06rem;
    width: 0.26rem;
    height: 0.6rem;
    border: solid var(--login-button-text-color, var(--primary-button-color, #ffffff));
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
</style>
