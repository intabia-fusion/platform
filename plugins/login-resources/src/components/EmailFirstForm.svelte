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
  import { MAX_EMAIL_LENGTH, type LoginInfo, type OnboardingIntent } from '@hcengineering/account-client'
  import { OK, Severity, Status, type IntlString } from '@hcengineering/platform'
  import { logIn } from '@hcengineering/workbench'
  import { TimeLeft } from '@hcengineering/ui'
  import Label from './internal/Label.svelte'
  import { onDestroy } from 'svelte'
  import { OtpLoginSteps } from '../index'
  import { doLoginNavigate, goTo, readAuthEmail, requestEmailOtp, saveAuthEmail } from '../utils'
  import login from '../plugin'
  import Form from './Form.svelte'
  import OtpForm from './OtpForm.svelte'

  export let navigateUrl: string | undefined = undefined
  export let intent: OnboardingIntent = { kind: 'workspace' }
  export let caption: IntlString = login.string.StartWithEmail
  export let subtitle: string | undefined = undefined
  export let onLogin: ((result: LoginInfo | null, status: Status) => void | Promise<void>) | undefined = undefined
  export let signedInAs: string | undefined = undefined
  const personalDataKey = 'login-consent-personal-data'
  const rulesKey = 'login-consent-rules'
  let agreedPersonalData = false
  let agreedRules = false
  try {
    agreedPersonalData = localStorage.getItem(personalDataKey) === 'true'
    agreedRules = localStorage.getItem(rulesKey) === 'true'
  } catch {}
  const consentCompact = agreedPersonalData && agreedRules
  $: {
    try {
      localStorage.setItem(personalDataKey, String(agreedPersonalData))
    } catch {}
  }
  $: {
    try {
      localStorage.setItem(rulesKey, String(agreedRules))
    } catch {}
  }

  const fields = [
    { id: 'email', name: 'email', i18n: login.string.Email, inputmode: 'email' as const, maxLength: MAX_EMAIL_LENGTH }
  ]
  const data = { email: readAuthEmail() }
  let status = OK
  let step = OtpLoginSteps.Email
  let retryOn = 0
  let retryBlocked = false
  let authenticatedSuccessfully = false
  let otpConsent: { personalData: boolean, rules: boolean } | undefined

  const action = {
    i18n: login.string.GetCode,
    func: async () => {
      status = new Status(Severity.INFO, login.status.ConnectingToServer, {})
      const consent = {
        personalData: agreedPersonalData,
        rules: agreedRules
      }
      const [nextStatus, result] = await requestEmailOtp(data.email, consent)
      status = nextStatus
      if (typeof nextStatus.params?.retryOn === 'number' && nextStatus.params.retryOn > Date.now()) {
        retryOn = nextStatus.params.retryOn
        retryBlocked = true
      }
      if (result?.sent === true && status === OK) {
        otpConsent = consent
        retryOn = result.retryOn
        step = OtpLoginSteps.Otp
      }
    }
  }

  async function authenticated (result: LoginInfo | null, nextStatus: Status): Promise<void> {
    status = nextStatus
    if (result != null) authenticatedSuccessfully = true
    if (intent.kind === 'invite' && onLogin !== undefined) {
      await onLogin(result, nextStatus)
    } else if (result?.onboarding != null && result.onboarding.stage !== 'complete') {
      await logIn(result)
      goTo('onboarding')
    } else if (onLogin !== undefined) {
      await onLogin(result, nextStatus)
    } else {
      await doLoginNavigate(
        result,
        (next) => {
          status = next
        },
        navigateUrl
      )
    }
  }

  onDestroy(() => {
    if (!authenticatedSuccessfully) saveAuthEmail(data.email)
  })
</script>

{#if step === OtpLoginSteps.Email}
  <Form
    {caption}
    {subtitle}
    hint={login.string.EmailCodeHint}
    compact
    {consentCompact}
    consentRequired
    {status}
    {fields}
    object={data}
    {action}
    proceedDisabled={retryBlocked}
    secondaryButtonLabel={signedInAs !== undefined ? login.string.SelectWorkspace : undefined}
    secondaryButtonAction={() => {
      goTo('selectWorkspace')
    }}
    bind:agreedPersonalData
    bind:agreedRules
    withProviders
  >
    <div slot="after-fields">
      {#if retryBlocked}
        <TimeLeft
          time={retryOn}
          on:timeout={() => {
            retryBlocked = false
          }}
        />
      {/if}
    </div>
    <svelte:fragment slot="before-secondary">
      <div class="signed-in">
        <Label label={login.string.SignedInAs} params={{ name: signedInAs ?? '' }} />
      </div>
    </svelte:fragment>
  </Form>
{:else}
  <OtpForm
    email={data.email}
    {retryOn}
    emailFirst
    consent={otpConsent}
    {intent}
    onLogin={authenticated}
    on:step={(event) => {
      step = event.detail
    }}
  />
{/if}

<style lang="scss">
  .signed-in {
    grid-column-start: 1;
    grid-column-end: 3;
    text-align: center;
    margin-bottom: -0.75rem;
    color: var(--login-label-color, var(--login-content-color, var(--theme-content-color)));
  }
</style>
