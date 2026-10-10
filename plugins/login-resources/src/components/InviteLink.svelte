<!--
// Copyright © 2022 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import type { Timestamp } from '@hcengineering/core'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { MessageBox, copyTextToClipboard, createQuery } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import {
    Button,
    ButtonIcon,
    EditBox,
    Grid,
    IconClose,
    Label,
    Loading,
    MiniToggle,
    showPopup,
    ticker
  } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'

  import platform, { OK, PlatformError, Severity, Status } from '@hcengineering/platform'

  import login from '../plugin'
  import { getAccountClient, getInviteLink, sendInvite } from '../utils'
  import InviteWorkspace from './icons/InviteWorkspace.svelte'
  import StatusControl from './StatusControl.svelte'

  export let role: AccountRole = AccountRole.User
  export let ignoreSettings: boolean = false

  const dispatch = createEventDispatcher()

  const query = createQuery()
  const isSecureContext = window.isSecureContext

  interface InviteParams {
    expirationTime: number
    emailMask: string
    limit: number | undefined
  }

  $: !ignoreSettings &&
    query.query(setting.class.InviteSettings, {}, (set) => {
      if (set !== undefined && set.length > 0) {
        expHours = set[0].expirationTime
        emailMask = set[0].emailMask
        limit = set[0].limit
      } else {
        expHours = 48
        limit = -1
      }

      if (limit === -1) noLimit = true

      defaultValues = {
        expirationTime: expHours,
        emailMask,
        limit
      }
    })

  function setToDefault (): void {
    expHours = defaultValues.expirationTime
    emailMask = defaultValues.emailMask
    limit = defaultValues.limit
    noLimit = limit === undefined || limit === -1
  }

  async function getLink (expHours: number, mask: string, limit: number | undefined, role: AccountRole): Promise<void> {
    loading = true
    status = OK
    try {
      link = await getInviteLink(expHours, mask, limit ?? -1, role)
    } catch (err: any) {
      if (err instanceof PlatformError && err.status.code === platform.status.PlanLimitExceeded) {
        // The seat count may have been used up between the onMount check and here.
        showNoFreeSeats()
        return
      }
      status =
        err instanceof PlatformError
          ? err.status
          : new Status(Severity.ERROR, platform.status.UnknownError, { message: err.message })
    } finally {
      loading = false
    }
  }

  let copiedTime: Timestamp | undefined
  let copied = false

  $: if (copiedTime !== undefined && copied && $ticker - copiedTime > 1000) {
    copied = false
  }

  async function copy (): Promise<void> {
    if (!isSecureContext) return
    if (link === undefined) return

    await copyTextToClipboard(link)
    copied = true
    copiedTime = Date.now()
  }

  let expHours: number = 48
  let emailMask: string = ''
  let limit: number | undefined = undefined
  let useDefault: boolean | undefined = true
  let noLimit: boolean = false
  const isOwnerOrMaintainer: boolean = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  let defaultValues: InviteParams = {
    expirationTime: 48,
    emailMask: '',
    limit: undefined
  }

  // Invite one or several people by email: the account service creates a single-use link per address and mails it.
  let inviteEmail = ''
  let sending = false
  let sentTo: string[] = []
  let emailStatus: Status = OK
  $: emails = inviteEmail.split(/[\s,;]+/).filter((it) => it !== '')
  $: emailValid = emails.length > 0 && emails.every((it) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(it))

  async function send (): Promise<void> {
    if (!emailValid || sending) return
    sending = true
    emailStatus = OK
    sentTo = []
    try {
      // One by one: a refusal (rate limit, seats) stops the rest and keeps them in the field.
      for (const email of emails) {
        await sendInvite(email, role)
        sentTo = [...sentTo, email]
      }
      inviteEmail = ''
    } catch (err: any) {
      inviteEmail = emails.filter((it) => !sentTo.includes(it)).join(', ')
      if (err instanceof PlatformError && err.status.code === platform.status.PlanLimitExceeded) {
        showNoFreeSeats()
        return
      }
      emailStatus =
        err instanceof PlatformError
          ? err.status
          : new Status(Severity.ERROR, platform.status.UnknownError, { message: err.message })
    } finally {
      sending = false
    }
  }

  let link: string | undefined
  let loading = false
  let status: Status = OK
  let seatsChecked = false

  function showNoFreeSeats (): void {
    dispatch('close')
    showPopup(MessageBox, {
      label: login.string.NoFreeSeats,
      message: login.string.NoFreeSeatsForInvite,
      canSubmit: false
    })
  }

  onMount(async () => {
    try {
      if (!(await getAccountClient().getWorkspaceSeats()).available) {
        showNoFreeSeats()
        return
      }
    } catch (err: any) {
      // Not fatal: the create call below is still guarded server side.
      console.error('Failed to check workspace seats', err)
    }
    seatsChecked = true
  })
</script>

<div class="antiPopup popup" class:secure={isSecureContext}>
  <div class="flex-between fs-title mb-9">
    <div class="flex-row-center flex-gap-2">
      <InviteWorkspace size={'large'} />
      <Label label={login.string.InviteDescription} />
    </div>
    <ButtonIcon
      icon={IconClose}
      kind={'tertiary'}
      size={'small'}
      on:click={() => {
        dispatch('close')
      }}
    />
  </div>
  {#if isOwnerOrMaintainer && !ignoreSettings && seatsChecked}
    <Grid column={1} rowGap={1.5}>
      <MiniToggle
        bind:on={useDefault}
        label={login.string.UseWorkspaceInviteSettings}
        on:click={() => {
          setToDefault()
        }}
      />
      {#if !useDefault}
        <EditBox
          label={login.string.LinkValidHours}
          bind:value={expHours}
          format={'number'}
          on:keypress={() => (link = undefined)}
          disabled={useDefault || !isOwnerOrMaintainer}
        />
        <MiniToggle bind:on={noLimit} label={login.string.NoLimit} on:change={() => noLimit && (limit = -1)} />
        {#if !noLimit}
          <EditBox
            label={login.string.InviteLimit}
            bind:value={limit}
            format={'number'}
            on:keypress={() => (link = undefined)}
            disabled={useDefault || !isOwnerOrMaintainer}
          />
        {/if}
      {/if}
    </Grid>
  {/if}
  {#if !ignoreSettings && useDefault && seatsChecked}
    <!-- What the workspace defaults are, so the link is not a blind click. -->
    <span class="text-sm content-dark-color" class:mt-2={isOwnerOrMaintainer}>
      {#if defaultValues.limit === undefined || defaultValues.limit === -1}
        <Label label={login.string.InviteDefaultsNoLimit} params={{ hours: defaultValues.expirationTime }} />
      {:else}
        <Label
          label={login.string.InviteDefaultsLimit}
          params={{ hours: defaultValues.expirationTime, limit: defaultValues.limit }}
        />
      {/if}
      {#if defaultValues.emailMask !== ''}
        {' '}<Label label={login.string.InviteDefaultsMask} params={{ mask: defaultValues.emailMask }} />
      {/if}
    </span>
  {/if}
  {#if status !== OK}
    <div class="mt-4 mb-4"><StatusControl {status} overflow /></div>
  {/if}
  {#if !seatsChecked || loading}
    <div class="mt-4"><Loading shrink /></div>
  {:else if link !== undefined}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="link" class:notSecure={!isSecureContext} class:over-underline={isSecureContext} on:click={copy}>
      {link}
    </div>
    <div class="buttons">
      <Button
        label={login.string.Close}
        size={'medium'}
        kind={'primary'}
        on:click={() => {
          dispatch('close')
        }}
      />
      {#if isSecureContext}
        <Button label={copied ? login.string.Copied : login.string.Copy} size={'medium'} on:click={copy} />
      {/if}
    </div>
  {:else}
    <div class="buttons">
      <Button
        label={login.string.GetLink}
        size={'medium'}
        kind={'primary'}
        on:click={() => {
          void (((limit !== undefined && limit > 0) || noLimit) && getLink(expHours, emailMask, limit, role))
        }}
      />
    </div>
  {/if}
  {#if seatsChecked}
    <div class="email-invite">
      <span class="text-sm content-dark-color"><Label label={login.string.InviteByEmail} /></span>
      <div class="flex-row-center flex-gap-2">
        <div class="flex-grow">
          <EditBox
            bind:value={inviteEmail}
            placeholder={login.string.Email}
            kind={'default-large'}
            on:keydown={(e) => {
              if (e.key === 'Enter') void send()
            }}
          />
        </div>
        <Button
          label={login.string.SendInvite}
          size={'medium'}
          loading={sending}
          disabled={!emailValid}
          on:click={() => {
            void send()
          }}
        />
      </div>
      {#if sentTo.length > 0}
        <span class="text-sm content-color">
          <Label label={login.string.InviteSentTo} params={{ email: sentTo.join(', ') }} />
        </span>
      {/if}
      {#if emailStatus !== OK}
        <StatusControl status={emailStatus} overflow />
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .popup {
    display: flex;
    flex-direction: column;
    padding: 1.75rem;
    width: 40rem;
    max-width: calc(100vw - 2rem);
    background: var(--popup-bg-color);
    border-radius: 1.25rem;
    user-select: none;
    box-shadow: var(--popup-shadow);

    // A divider line, not a box: the email section is the second part of the same dialog.
    .email-invite {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 1.75rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--theme-divider-color);
    }

    .link {
      margin: 1.75rem 0 0;
      overflow-wrap: break-word;

      &.notSecure {
        user-select: text;
      }
    }

    .buttons {
      margin-top: 1.75rem;
      flex-shrink: 0;
      display: grid;
      grid-auto-flow: column;
      direction: rtl;
      justify-content: flex-start;
      align-items: center;
      column-gap: 0.5rem;
    }
  }
</style>
