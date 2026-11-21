<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2022 Hardcore Engineering Inc.
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
  import { type IntlString, OK, type Status } from '@hcengineering/platform'
  import { type LoginInfo, MAX_EMAIL_LENGTH, MAX_PERSON_NAME_LENGTH } from '@hcengineering/account-client'
  import { logIn } from '@hcengineering/workbench'
  import { signupStore } from '@hcengineering/analytics-providers'

  import login from '../plugin'
  import { LoginEvents } from '../analytics'
  import { getPasswordValidationRules } from '../validations'
  import { goTo } from '../utils'
  import Form from './Form.svelte'
  import { signUp } from '../index'
  import type { Field } from '../types'
  import { onMount, onDestroy } from 'svelte'
  import { readAuthEmail, saveAuthEmail } from '../utils'

  export let signUpDisabled = false
  export let localLoginHidden = false
  export let caption: IntlString = login.string.SignUp
  export let subtitle: string | undefined = undefined
  export let onSignUp: ((loginInfo: LoginInfo | null, status: Status) => void | Promise<void>) | undefined = undefined

  const fields: Array<Field> = [
    { id: 'given-name', name: 'first', i18n: login.string.FirstName, maxLength: MAX_PERSON_NAME_LENGTH },
    { id: 'family-name', name: 'last', i18n: login.string.LastName, maxLength: MAX_PERSON_NAME_LENGTH },
    {
      id: 'email',
      name: 'username',
      i18n: login.string.Email,
      inputmode: 'email',
      maxLength: MAX_EMAIL_LENGTH
    },
    {
      id: 'password',
      name: 'password',
      i18n: login.string.Password,
      password: true,
      rules: getPasswordValidationRules()
    },
    {
      id: 'password',
      idOverride: 'password2',
      name: 'password2',
      i18n: login.string.PasswordRepeat,
      password: true
    }
  ]

  const object = {
    first: '',
    last: '',
    username: readAuthEmail(),
    password: '',
    password2: ''
  }

  let status: Status<any> = OK
  let agreedPersonalData = false
  let agreedRules = false

  if (signUpDisabled || localLoginHidden) {
    goTo('login')
  }

  onMount(() => {
    signupStore.setSignUpFlow(true)
  })

  const action = {
    i18n: caption,
    func: async () => {
      const [loginStatus, result] = await signUp(object.username, object.password, object.first, object.last, {
        personalData: agreedPersonalData,
        rules: agreedRules
      })

      status = loginStatus

      if (result != null) {
        saveAuthEmail(null)
      }

      if (onSignUp !== undefined) {
        void onSignUp(result, status)
      } else if (result != null) {
        await logIn(result)
        goTo('confirmationSend')
      }
    }
  }

  onDestroy(() => {
    saveAuthEmail(object.username ?? '')
  })
</script>

<Form
  {caption}
  {subtitle}
  {status}
  {fields}
  {object}
  {action}
  consentRequired
  bind:agreedPersonalData
  bind:agreedRules
  withProviders
  submitEvent={LoginEvents.SignUpSubmitAttempt}
  submitEventParams={{ method: 'email' }}
/>

<style lang="scss">
  // TODO: Refactor me please
  .action {
    margin-left: 5rem;
  }

  .placeholder {
    height: 1.125rem;
  }
</style>
