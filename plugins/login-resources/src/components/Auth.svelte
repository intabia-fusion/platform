<script lang="ts">
  import { onMount } from 'svelte'
  import { getCurrentLocation, Loading, navigate, TimeLeft } from '@hcengineering/ui'
  import Label from './internal/Label.svelte'
  import { logIn } from '@hcengineering/workbench'
  import { trackOAuthCompletion } from '@hcengineering/analytics-providers'
  import type { LoginInfoRequest, LoginInfoByToken } from '@hcengineering/account-client'
  import type { Status } from '@hcengineering/platform'
  import platform, { getMetadata, OK, PlatformError, unknownError } from '@hcengineering/platform'
  import { concatLink } from '@hcengineering/core'

  import type { Field } from '../types'
  import {
    afterConfirm,
    getLoginInfoFromQuery,
    getAutoJoinInfo,
    goTo,
    isWorkspaceLoginInfo,
    navigateToWorkspace,
    isLoginInfoRequest
  } from '../utils'
  import Form from './Form.svelte'
  import login from '../plugin'

  let request: LoginInfoRequest | undefined
  let providerConsent: string | undefined
  let fields: Field[]
  let status: Status = OK
  $: fields =
    request != null
      ? [
          { id: 'first_name', name: 'firstName', i18n: login.string.FirstName },
          { id: 'last_name', name: 'lastName', i18n: login.string.LastName, optional: true }
        ]
      : []
  const formData = {
    firstName: '' as string,
    lastName: '' as string
  }

  onMount(async () => {
    const location = getCurrentLocation()
    const consent = location.query?.providerConsent
    if (typeof consent === 'string' && consent !== '') {
      providerConsent = consent
      delete location.query?.providerConsent
      navigate(location, true)
      return
    }
    const autoJoinInfo = getAutoJoinInfo()
    let result: LoginInfoByToken | null = null

    try {
      result = await getLoginInfoFromQuery()
    } catch (err: any) {
      if (
        err instanceof PlatformError &&
        [platform.status.TokenExpired, platform.status.TokenNotActive].includes(err.status.code)
      ) {
        status = err.status
        return
      }
    }

    if (
      autoJoinInfo != null &&
      (result == null ||
        isLoginInfoRequest(result) ||
        result.onboarding == null ||
        result.onboarding.stage === 'complete')
    ) {
      goTo('autoJoin')
      return
    }

    trackOAuthCompletion(result)
    await handleLoginInfo(result)
  })

  async function handleLoginInfo (result: LoginInfoByToken): Promise<void> {
    if (result == null) {
      goTo('login', true)
    } else if (isLoginInfoRequest(result)) {
      request = result
    } else {
      await logIn(result)

      if (result.onboarding != null && result.onboarding.stage !== 'complete') {
        const location = getCurrentLocation()
        if (location.query?.inviteId != null) {
          delete location.query.token
          delete location.query.autoJoin
          location.path[1] = 'join'
          location.path.length = 2
          navigate(location, true)
        } else {
          goTo('onboarding', true)
        }
        return
      }

      if (isWorkspaceLoginInfo(result)) {
        navigateToWorkspace(result.workspaceUrl, result, getCurrentLocation().query?.navigateUrl, true)
        return
      }

      await afterConfirm(true)
    }
  }

  const action = {
    i18n: login.string.Proceed,
    func: async () => {
      try {
        const result = await getLoginInfoFromQuery(formData)
        await handleLoginInfo(result)
      } catch (err: any) {
        if (err instanceof PlatformError) {
          status = err.status
        } else {
          status = unknownError(err)
        }
      }
    }
  }

  const providerConsentAction = {
    i18n: login.string.Proceed,
    func: async () => {
      const accountsUrl = getMetadata(login.metadata.AccountsUrl) ?? ''
      window.location.assign(
        concatLink(
          accountsUrl,
          `/auth/consent?nonce=${encodeURIComponent(providerConsent ?? '')}&agreedPersonalData=true&agreedRules=true`
        )
      )
    }
  }

  let timer: TimeLeft | undefined
</script>

{#if providerConsent !== undefined}
  <Form caption={login.string.SignUp} {status} fields={[]} object={{}} action={providerConsentAction} consentRequired />
{:else if status?.code === platform.status.TokenExpired}
  <span class="text ml-8">
    <Label label={login.string.AccessExpired} />
  </span>
{:else if status?.code === platform.status.TokenNotActive}
  <span class="text ml-8">
    <Label label={login.string.AccessNotActive} />
    <TimeLeft
      bind:this={timer}
      time={status.params.notBefore * 1000}
      showHours={true}
      on:timeout={() => {
        console.log('reload due to token inactive')
        window.location.reload()
      }}
    />
  </span>
{:else if request != null}
  <Form caption={login.string.WhatIsYourName} {status} {fields} object={formData} {action} ignoreInitialValidation />
{:else}
  <Loading />
{/if}

<style>
  .text {
    color: var(--login-caption-color, var(--theme-caption-color));
  }
</style>
