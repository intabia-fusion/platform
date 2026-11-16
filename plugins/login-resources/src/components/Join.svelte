<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import platform, { getMetadata, setMetadata, OK, PlatformError, Severity, Status } from '@hcengineering/platform'
  import { Analytics } from '@hcengineering/analytics'
  import type { LoginInfo, WorkspaceLoginInfo } from '@hcengineering/account-client'
  import { readOnlyGuestAccountUuid, type PersonUuid } from '@hcengineering/core'
  import presentation from '@hcengineering/presentation'
  import { type Location, getCurrentLocation, navigate, setMetadataLocalStorage } from '@hcengineering/ui'
  import { logIn, workbenchId } from '@hcengineering/workbench'
  import { onMount } from 'svelte'

  import { getAccount, getAccountClient, getInviteInfo, joinByInvite, setLoginInfo } from '../utils'
  import { LoginMethods } from '../index'
  import type { BottomAction } from '../index'
  import login from '../plugin'
  import Label from './internal/Label.svelte'
  import FormButton from './internal/FormButton.svelte'
  import SignupForm from './SignupForm.svelte'
  import LoginPasswordForm from './LoginPasswordForm.svelte'
  import BottomActionComponent from './BottomAction.svelte'
  import EmailFirstForm from './EmailFirstForm.svelte'
  import RegistrationDetails from './RegistrationDetails.svelte'
  import StatusControl from './StatusControl.svelte'

  const location = getCurrentLocation()
  const useOTP = getMetadata(presentation.metadata.UseOTP) === true
  Analytics.handleEvent('invite_link_activated', { invite_id: location.query?.inviteId })

  // Step management
  type JoinStep = 'initial' | 'signup' | 'login' | 'name'
  let step: JoinStep = 'initial'
  let hasExistingAccount = false
  let existingAccountEmail = ''
  let existingAccountName = ''
  let workspaceName = ''
  let inviterName = ''
  let checkingInvitation = true
  let checkingAccount = true
  let invalidInvitation = false
  let invitationError: Status = OK
  let joiningWithCurrentAccount = false
  let completingOnboardingInvite = false
  let invitationExpired = false
  let noFreeSeats = false
  let firstName = ''
  let lastName = ''

  // Login method for existing account
  let loginMethod: LoginMethods = LoginMethods.Password

  let status = OK

  function toJoinStatus (joinStatus: Status): Status {
    if (joinStatus.code === platform.status.PlanLimitExceeded) {
      noFreeSeats = true
      return OK
    }
    return joinStatus !== OK ? joinStatus : new Status(Severity.ERROR, login.status.JoinWorkspaceError, {})
  }

  async function handleLoginSuccess (result: WorkspaceLoginInfo): Promise<void> {
    await logIn(result)
    setLoginInfo(result)

    if (location.query?.navigateUrl != null) {
      try {
        const loc = JSON.parse(decodeURIComponent(location.query.navigateUrl)) as Location
        if (loc.path[1] === result.workspaceUrl) {
          navigate(loc)
          return
        }
      } catch (err: any) {
        // Json parse error could be ignored
      }
    }

    navigate({ path: [workbenchId, result.workspaceUrl] })
  }

  async function handleJoinAfterAuth (loginInfo: LoginInfo | null): Promise<void> {
    if (loginInfo == null) {
      return
    }

    status = new Status(Severity.INFO, login.status.ConnectingToServer, {})
    setMetadata(presentation.metadata.Token, loginInfo.token)
    setMetadataLocalStorage(login.metadata.LoginAccount, loginInfo.account)

    try {
      await logIn(loginInfo)
      await showNameStep(loginInfo)
    } catch (err: any) {
      Analytics.handleError(err)
      status = new Status(Severity.ERROR, login.status.JoinWorkspaceError, {})
    }
  }

  async function joinWithCurrentAccount (): Promise<void> {
    if (!hasExistingAccount) return

    joiningWithCurrentAccount = true
    status = new Status(Severity.INFO, login.status.ConnectingToServer, {})

    try {
      const account = await getAccount(false)
      if (account != null) await showNameStep(account)
    } catch (err: any) {
      Analytics.handleError(err)
      status = new Status(Severity.ERROR, login.status.JoinWorkspaceError, {})
      joiningWithCurrentAccount = false
    }
  }

  async function showNameStep (account: LoginInfo): Promise<void> {
    const profile = await getAccountClient().getUserProfile(account.account as unknown as PersonUuid)
    firstName = profile?.firstName ?? ''
    lastName = profile?.lastName ?? ''
    completingOnboardingInvite =
      account.onboarding?.stage !== 'complete' &&
      account.onboarding?.intent.kind === 'invite' &&
      account.onboarding.intent.inviteId === location.query?.inviteId
    status = OK
    joiningWithCurrentAccount = false
    step = 'name'
  }

  async function joinCurrentInvite (event: CustomEvent<{ firstName: string, lastName: string }>): Promise<void> {
    joiningWithCurrentAccount = true
    status = new Status(Severity.INFO, login.status.ConnectingToServer, {})
    try {
      const inviteId = location.query?.inviteId ?? ''
      const name = {
        ...(firstName.trim() === '' ? { firstName: event.detail.firstName } : {}),
        ...(lastName.trim() === '' ? { lastName: event.detail.lastName } : {})
      }
      if (completingOnboardingInvite) {
        const result = await getAccountClient().completeOnboardingInvite(name, inviteId)
        await handleLoginSuccess(result)
        return
      }
      const [joinStatus, joinResult] = await joinByInvite(inviteId, name)
      if (joinResult != null) {
        await handleLoginSuccess(joinResult)
      } else {
        status = toJoinStatus(joinStatus)
        joiningWithCurrentAccount = false
      }
    } catch (err: any) {
      Analytics.handleError(err)
      if (err instanceof PlatformError && err.status.code === platform.status.PlanLimitExceeded) {
        noFreeSeats = true
        joiningWithCurrentAccount = false
        return
      }
      status =
        err instanceof PlatformError ? err.status : new Status(Severity.ERROR, login.status.JoinWorkspaceError, {})
      joiningWithCurrentAccount = false
    }
  }

  onMount(() => {
    void loadWorkspaceInfo()
    void checkExistingAccount()
  })

  async function loadWorkspaceInfo (): Promise<void> {
    const inviteId = location.query?.inviteId
    if (inviteId == null || inviteId === '') {
      invalidInvitation = true
      checkingInvitation = false
      return
    }
    const [inviteStatus, info] = await getInviteInfo(inviteId)
    if (inviteStatus.code === platform.status.ExpiredLink) {
      invitationExpired = true
    } else if (
      [platform.status.Forbidden, platform.status.BadRequest, platform.status.WorkspaceNotFound].includes(
        inviteStatus.code
      )
    ) {
      invalidInvitation = true
    } else if (inviteStatus !== OK) {
      invitationError = inviteStatus
    } else if (info == null) {
      invalidInvitation = true
    } else {
      workspaceName = info.name ?? ''
      inviterName = info.inviterName ?? ''
    }
    checkingInvitation = false
  }

  async function checkExistingAccount (): Promise<void> {
    try {
      // getAccount will use token from metadata or cookie
      const loginInfo = await getAccount(false)
      // The shared anonymous account can't join: treat it as "not signed in"
      if (loginInfo != null && loginInfo.account !== readOnlyGuestAccountUuid) {
        hasExistingAccount = true
        existingAccountName = loginInfo.name ?? ''
        // socialId format is "type:value", extract the value part (email)
        existingAccountEmail = loginInfo.socialId != null ? loginInfo.socialId.split(':').slice(1).join(':') : ''
        setMetadata(presentation.metadata.Token, loginInfo.token)
        setMetadataLocalStorage(login.metadata.LoginAccount, loginInfo.account)
        if (useOTP) await showNameStep(loginInfo)
      } else if (useOTP) {
        step = 'signup'
      }
    } catch (err: any) {
      // Token expired or invalid, user will need to log in again
      hasExistingAccount = false
      if (useOTP) step = 'signup'
    } finally {
      checkingAccount = false
    }
  }

  function goToSignup (): void {
    step = 'signup'
  }

  function goToLogin (method: LoginMethods = LoginMethods.Password): void {
    step = 'login'
    loginMethod = method
  }

  function goBackToInitial (): void {
    step = 'initial'
    status = OK
    loginMethod = LoginMethods.Password
  }

  const switchToPasswordAction: BottomAction = {
    i18n: login.string.LoginWithPassword,
    func: () => {
      loginMethod = LoginMethods.Password
    }
  }

  const switchToOtpAction: BottomAction = {
    i18n: login.string.LoginWithCode,
    func: () => {
      loginMethod = LoginMethods.Otp
    }
  }
</script>

{#if step !== 'name' && !checkingInvitation && !invitationExpired && !invalidInvitation && invitationError === OK && workspaceName !== ''}
  <div class="invitation-context" data-testid="invitation-context">
    {#if inviterName !== ''}
      <Label label={login.string.InvitationFrom} params={{ name: inviterName, workspace: workspaceName }} />
    {:else}
      <Label label={login.string.InvitationTo} params={{ workspace: workspaceName }} />
    {/if}
  </div>
{/if}

{#if noFreeSeats}
  <div class="initial-container">
    <div class="title mb-2"><Label label={login.string.NoFreeSeats} /></div>
    <div class="description"><Label label={login.string.NoFreeSeatsDescription} /></div>
  </div>
{:else if checkingInvitation || (useOTP && checkingAccount)}
  <div class="initial-container"><Label label={login.string.CheckingLink} /></div>
{:else if invitationExpired || invalidInvitation}
  <div class="initial-container">
    <div class="title mb-2">
      <Label label={invitationExpired ? login.string.ExpiredLink : login.string.InvalidLink} />
    </div>
    <div class="description"><Label label={login.string.ExpiredLinkDescription} /></div>
  </div>
{:else if invitationError !== OK}
  <div class="initial-container"><StatusControl status={invitationError} /></div>
{:else if step === 'initial'}
  <div class="initial-container">
    <div class="title"><Label label={login.string.Join} /></div>
    {#if status !== OK}
      <div class="status mt-4"><StatusControl {status} /></div>
    {/if}

    <div class="actions">
      {#if hasExistingAccount}
        <FormButton
          label={login.string.JoinAs}
          params={{ name: existingAccountName || existingAccountEmail }}
          kind="contrast"
          shape="round"
          size="x-large"
          width="100%"
          loading={joiningWithCurrentAccount}
          on:click={joinWithCurrentAccount}
        />
      {/if}

      <FormButton
        label={login.string.CreateNewAccount}
        kind={hasExistingAccount ? 'default' : 'contrast'}
        shape="round"
        size="x-large"
        width="100%"
        on:click={goToSignup}
      />

      <FormButton
        label={login.string.AlreadySignedIn}
        kind="default"
        shape="round"
        size="x-large"
        width="100%"
        on:click={() => {
          goToLogin()
        }}
      />
    </div>
  </div>
{:else if step === 'name'}
  <RegistrationDetails
    invited
    {status}
    initialFirstName={firstName}
    initialLastName={lastName}
    invitationWorkspace={workspaceName}
    invitationInviter={inviterName}
    differentAccount={useOTP ? goToSignup : undefined}
    on:complete={joinCurrentInvite}
  />
{:else if step === 'signup'}
  <div class="form-container">
    {#if !useOTP}
      <div class="back-row">
        <FormButton type="button" kind="ghost" size="small" shape="round" on:click={goBackToInitial}>
          <Label label={login.string.BackLabel} />
        </FormButton>
      </div>
    {/if}

    {#if status !== OK}
      <div class="status">
        <StatusControl {status} />
      </div>
    {/if}

    {#if useOTP}
      <EmailFirstForm
        caption={login.string.SignUpAndJoin}
        intent={{ kind: 'invite', inviteId: location.query?.inviteId ?? '' }}
        onLogin={handleJoinAfterAuth}
      />
    {:else}
      <SignupForm caption={login.string.SignUpAndJoin} onSignUp={handleJoinAfterAuth} />
    {/if}
  </div>
{:else if step === 'login'}
  <div class="form-container">
    <div class="back-row">
      <FormButton type="button" kind="ghost" size="small" shape="round" on:click={goBackToInitial}>
        <Label label={login.string.BackLabel} />
      </FormButton>
    </div>

    {#if status !== OK}
      <div class="status">
        <StatusControl {status} />
      </div>
    {/if}

    {#if loginMethod === LoginMethods.Otp}
      <EmailFirstForm
        caption={login.string.LogInAndJoin}
        onLogin={handleJoinAfterAuth}
        intent={{ kind: 'invite', inviteId: location.query?.inviteId ?? '' }}
      />
      <BottomActionComponent action={switchToPasswordAction} />
    {:else}
      <LoginPasswordForm
        caption={login.string.LogInAndJoin}
        onLogin={handleJoinAfterAuth}
        extraBottomActions={[switchToOtpAction]}
      />
    {/if}
  </div>
{/if}

<style lang="scss">
  .invitation-context {
    padding: 2rem 2rem 0;
    color: var(--login-label-color, var(--login-content-color, var(--theme-content-color)));
    font-size: 0.875rem;
    line-height: 1.3125rem;
    overflow-wrap: anywhere;
  }
  .initial-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    color: var(--login-content-color, var(--theme-content-color));
  }

  .form-container {
    display: flex;
    flex-direction: column;
    color: var(--login-content-color, var(--theme-content-color));
  }

  .back-row {
    display: flex;
    align-items: center;
    padding: 0.5rem;
  }

  .title {
    font-weight: var(--login-title-font-weight, 500);
    font-size: var(--login-title-font-size, 1.25rem);
    color: var(--login-caption-color, var(--theme-caption-color));
    text-align: center;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-width: 300px;
    margin-top: 1rem;
  }

  .description {
    text-align: center;
  }

  .status {
    margin: 0 2rem;
  }
</style>
