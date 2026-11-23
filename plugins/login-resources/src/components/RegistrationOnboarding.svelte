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
  import type { LoginInfo, RegionInfo, WorkspaceLoginInfo } from '@hcengineering/account-client'
  import { SocialIdType, type PersonUuid } from '@hcengineering/core'
  import {
    getEmbeddedLabel,
    OK,
    PlatformError,
    Severity,
    Status,
    translate,
    unknownError
  } from '@hcengineering/platform'
  import { getCurrentLocation, languageStore } from '@hcengineering/ui'
  import { MenuButton } from '@hcengineering/ui/kit'
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import {
    createWorkspace,
    getAccountClient,
    getInviteInfo,
    getRegionInfo,
    goTo,
    navigateToWorkspace,
    restoreSession
  } from '../utils'
  import login from '../plugin'
  import RegistrationDetails from './RegistrationDetails.svelte'
  import StatusControl from './StatusControl.svelte'

  export let resumed = false

  let account: LoginInfo | undefined
  let firstName = ''
  let lastName = ''
  let workspaceName = ''
  let invitationWorkspace: string | undefined
  let invitationInviter: string | undefined
  let region = ''
  let regions: RegionInfo[] = []
  $: regionItems = regions.map((item) => ({ id: item.region, label: getEmbeddedLabel(item.name) }))
  let status: Status = OK
  let ready = false
  let workspaceCreation: Promise<[Status, WorkspaceLoginInfo | null]> | undefined

  function showError (error: unknown): void {
    status = error instanceof PlatformError ? error.status : unknownError(error)
  }

  onMount(async () => {
    try {
      const info = await restoreSession()
      if (info?.onboarding == null) {
        goTo('selectWorkspace')
        return
      }
      account = info
      if (info.onboarding.stage === 'complete') {
        const workspace = (await getAccountClient().getUserWorkspaces()).find(
          (item) => item.uuid === info.onboarding?.workspace
        )
        if (workspace == null) throw new Error('Completed registration workspace not found')
        const result = await getAccountClient().selectWorkspace(workspace.url)
        navigateToWorkspace(result.workspaceUrl, result, getCurrentLocation().query?.navigateUrl)
        return
      }
      if (info.onboarding.intent.kind === 'invite') {
        const [inviteStatus, invite] = await getInviteInfo(info.onboarding.intent.inviteId)
        if (invite == null) {
          status = inviteStatus
          return
        }
        invitationWorkspace = invite.name
        invitationInviter = invite.inviterName
      }
      const profile = await getAccountClient().getUserProfile(info.account as unknown as PersonUuid)
      firstName = profile?.firstName ?? ''
      lastName = profile?.lastName ?? ''
      regions = (await getRegionInfo())?.filter((item) => item.name.length > 0) ?? []
      region = info.onboarding.region ?? regions[0]?.region ?? ''
      const socialIds = await getAccountClient().getSocialIds()
      const email = (
        socialIds.find((id) => id.type === SocialIdType.EMAIL && (id.verifiedOn ?? 0) > 0)?.value ?? ''
      ).split('@')[0]
      workspaceName =
        info.onboarding.workspaceName ??
        (await translate(login.string.PersonalSpace, { email }, get(languageStore))).trim()
      if (info.onboarding.intent.kind === 'workspace' && info.onboarding.workspaceName != null) {
        workspaceCreation = createWorkspace(info.onboarding.workspaceName, region, get(languageStore), true)
      }
      ready = true
    } catch (error) {
      showError(error)
    }
  })

  async function saveName (first: string, last: string): Promise<boolean> {
    try {
      const onboarding = await getAccountClient().setOnboardingName(first, last)
      if (account != null) account = { ...account, onboarding }
      status = OK
      return true
    } catch (error) {
      showError(error)
      return false
    }
  }

  async function saveWorkspace (name: string): Promise<boolean> {
    try {
      workspaceCreation = createWorkspace(name, region, get(languageStore), true)
      const [resultStatus, result] = await workspaceCreation
      if (result == null) {
        workspaceCreation = undefined
        status = resultStatus
        return false
      }
      if (account?.onboarding != null) {
        account = { ...account, onboarding: { ...account.onboarding, stage: 'name', workspaceName: name, region } }
      }
      status = OK
      return true
    } catch (error) {
      showError(error)
      return false
    }
  }

  async function complete (
    event: CustomEvent<{ firstName: string, lastName: string, workspace: string }>
  ): Promise<void> {
    if (account?.onboarding == null) return
    status = new Status(Severity.INFO, login.status.ConnectingToServer, {})
    try {
      if (account.onboarding.intent.kind === 'invite') {
        const result = await getAccountClient().completeOnboardingInvite(
          {
            ...(firstName.trim() === '' ? { firstName: event.detail.firstName } : {}),
            ...(lastName.trim() === '' ? { lastName: event.detail.lastName } : {})
          },
          account.onboarding.intent.inviteId
        )
        navigateToWorkspace(result.workspaceUrl, result, getCurrentLocation().query?.navigateUrl)
      } else {
        const [resultStatus, result] = await (workspaceCreation ??
          createWorkspace(event.detail.workspace, region, get(languageStore), true))
        if (result == null) {
          workspaceCreation = undefined
          status = resultStatus
          return
        }
        navigateToWorkspace(result.workspaceUrl, result, getCurrentLocation().query?.navigateUrl)
      }
    } catch (error) {
      showError(error)
    }
  }
</script>

{#if ready && account?.onboarding != null}
  <RegistrationDetails
    {resumed}
    invited={account.onboarding.intent.kind === 'invite'}
    initialStep={account.onboarding.intent.kind === 'invite' || account.onboarding.workspaceName != null
      ? 'name'
      : 'workspace'}
    initialFirstName={firstName}
    initialLastName={lastName}
    initialWorkspace={workspaceName}
    {invitationWorkspace}
    {invitationInviter}
    {saveName}
    {saveWorkspace}
    {status}
    on:complete={complete}
  >
    <svelte:fragment slot="region-selector">
      {#if regions.length > 1}
        <MenuButton
          bind:selected={region}
          label={regionItems.find((item) => item.id === region)?.label}
          autoSelectSingle
          items={regionItems}
          on:selected={(event) => {
            region = event.detail
          }}
        />
      {/if}
    </svelte:fragment>
  </RegistrationDetails>
{/if}
{#if !ready && status !== OK}
  <StatusControl {status} />
{/if}
