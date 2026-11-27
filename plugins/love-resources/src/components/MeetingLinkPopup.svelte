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
  import calendar, { type Event } from '@hcengineering/calendar'
  import { copyTextToClipboard, getClient } from '@hcengineering/presentation'
  import love, {
    defaultMeetingAccess,
    meetingMasterQuery,
    type MeetingAccess,
    type MeetingEventLink,
    type MeetingLinkKind,
    type PermanentMeeting
  } from '@hcengineering/love'
  import { Button, DropdownLabelsIntl, EditBox, Label, type DropdownIntlItem } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'
  import plugin from '../plugin'
  import {
    getEventMeetingLink,
    notifyCopied,
    revokeMeetingLink,
    revokePermanentMeetingLink,
    withPassword
  } from '../utils'
  import { getLoveClient } from '../loveClient'
  import { findMeetingLink } from '../meetingLink'

  // Exactly one of the two: a calendar series keeps its policy in a mixin, a permanent meeting
  // on the document itself.
  export let event: Event | undefined = undefined
  export let meeting: PermanentMeeting | undefined = undefined

  const client = getClient()
  const loveClient = getLoveClient()
  const dispatch = createEventDispatcher()

  const DAY = 24 * 60 * 60 * 1000

  const startItems: DropdownIntlItem[] = [
    { id: 'members', label: plugin.string.StartMembersOnly },
    { id: 'link', label: plugin.string.StartAnyoneWithLink }
  ]
  const pastItems: DropdownIntlItem[] = [
    { id: 'last', label: plugin.string.PastLast },
    { id: 'none', label: plugin.string.PastNone }
  ]
  // Days rather than a free-form duration: the value only decides how long a dead series stays
  // reachable, and an exact figure there means nothing to anyone.
  const ttlItems: DropdownIntlItem[] = [
    { id: `${DAY}`, label: plugin.string.Day },
    { id: `${7 * DAY}`, label: plugin.string.Week },
    { id: `${30 * DAY}`, label: plugin.string.Month },
    { id: 'forever', label: plugin.string.Forever }
  ]

  let master: Event | undefined
  // The mixin of the series, resolved once. The popup is opened from two places - the meeting card
  // (a `meeting` is passed) and the event card (only an `event` is passed), and in the second case
  // nothing says whether the series belongs to a permanent meeting until its mixin is read.
  let link: MeetingEventLink | undefined
  let access: MeetingAccess = defaultMeetingAccess

  // A permanent meeting has no series to outlive, so `past` and `afterTtl` decide nothing there.
  $: isPermanent = meeting !== undefined
  // A series that a permanent meeting built inherits that meeting's link: it never expires and has
  // no "after the series" behaviour to pick, so neither setting is offered on its event card either.
  $: isPermanentSeries = link?.permanentMeeting !== undefined
  $: offersSeriesSettings = !isPermanent && !isPermanentSeries
  // A series built by a permanent meeting is not a target of its own: the link, the password and
  // the revoke all belong to the meeting, otherwise the same meeting answers with two URLs - one
  // from its own card and one from the series card - and a password set on the series never
  // reaches the link guests open.
  $: permanentMeetingId = meeting?._id ?? link?.permanentMeeting
  $: linkKind = (permanentMeetingId !== undefined ? 'meeting' : 'event') as MeetingLinkKind
  $: pointer = permanentMeetingId ?? master?.eventId

  // Kept only in this popup's memory after a successful save, to power "copy link + password" -
  // the server never returns the plaintext, so a freshly reopened popup has nothing to copy.
  let plainPassword: string | undefined
  // A password saved in an earlier session is a hash on the server: the popup has no plaintext to put
  // into the link, so the copy asks for it once instead of hiding the action entirely.
  let askingPasswordToCopy = false
  let copyPassword = ''
  // The hash is write-only: the server stores it and never sends it back, so "is there a password"
  // is kept as a flag instead of a fake hash in `access`.
  let passwordSet = false
  let editingPassword = false
  let passwordInput = ''

  // Loaded once per opened popup, not derived. A reactive `$:` block here would depend on `access`
  // too (it is read to compute `passwordSet`) and write it back: every write invalidates the block,
  // it re-runs, issues another `findOne`, gets a fresh object and writes again - an endless query
  // loop that locks the tab up. Owning the value also lets the dropdowns below keep what the user
  // picked instead of having it overwritten by the stored one on the next pass.
  onMount(() => {
    if (meeting !== undefined) {
      access = meeting.meetingAccess ?? defaultMeetingAccess
      passwordSet = access.guestPassword !== undefined
      return
    }
    const seriesEvent = event
    if (seriesEvent === undefined) return
    void client.findOne(calendar.class.Event, meetingMasterQuery(seriesEvent)).then(async (res) => {
      master = res
      if (res === undefined) return
      // Read through the mixin document: a master fetched by the event class arrives without the
      // mixin fields, so `hierarchy.as` on it returns the event itself - both the stored policy and
      // `permanentMeeting` read as undefined, which is what showed the series settings on a
      // permanent meeting's card.
      link = await findMeetingLink(client, res)
      const owned = await permanentMeetingOf(link)
      access = owned?.meetingAccess ?? link?.meetingAccess ?? defaultMeetingAccess
      passwordSet = access.guestPassword !== undefined
    })
  })

  // The meeting behind a series, when there is one: its policy wins over the series' copy.
  async function permanentMeetingOf (seriesLink: MeetingEventLink | undefined): Promise<PermanentMeeting | undefined> {
    const id = seriesLink?.permanentMeeting
    if (id === undefined) return undefined
    return await client.findOne(love.class.PermanentMeeting, { _id: id })
  }

  async function save (update: Partial<MeetingAccess>): Promise<void> {
    access = { ...access, ...update }
    if (meeting !== undefined) {
      await client.update(meeting, { meetingAccess: access })
      return
    }
    const owned = await permanentMeetingOf(link)
    if (owned !== undefined) {
      // The link resolves to the meeting, so the policy has to live there too.
      await client.update(owned, { meetingAccess: access })
      return
    }
    if (master === undefined) return
    await client.updateMixin(master._id, master._class, master.space, love.mixin.MeetingEventLink, {
      meetingAccess: access
    })
  }

  function startEditPassword (): void {
    passwordInput = ''
    editingPassword = true
  }

  // One write at a time: the password and the revoke are server calls, and a second click while the
  // first one is in flight would send the same request twice.
  let busy = false

  async function savePassword (): Promise<void> {
    if (busy) return
    if (pointer === undefined || passwordInput === '') return
    busy = true
    try {
      await loveClient.setGuestPassword(pointer, passwordInput, linkKind)
      plainPassword = passwordInput
      passwordSet = true
      editingPassword = false
      askingPasswordToCopy = false
    } finally {
      busy = false
    }
  }

  async function removePassword (): Promise<void> {
    if (busy) return
    if (pointer === undefined) return
    busy = true
    try {
      await loveClient.setGuestPassword(pointer, null, linkKind)
      plainPassword = undefined
      passwordSet = false
      askingPasswordToCopy = false
    } finally {
      busy = false
    }
  }

  async function copyLink (): Promise<void> {
    if (pointer === undefined) return
    // The promise goes in as is: Safari drops the clipboard write once the user gesture is awaited away.
    await copyTextToClipboard(getEventMeetingLink(pointer, linkKind))
    await notifyCopied(plugin.string.LinkCopied)
  }

  async function copyLinkWithPassword (password?: string): Promise<void> {
    if (pointer === undefined) return
    const plain = password ?? plainPassword
    if (plain === undefined || plain === '') {
      // Nothing to put into the link yet: ask for the password with the same field the form uses.
      askingPasswordToCopy = true
      copyPassword = ''
      return
    }
    const link = await getEventMeetingLink(pointer, linkKind)
    if (link === '') return
    await copyTextToClipboard(withPassword(link, plain))
    askingPasswordToCopy = false
    await notifyCopied(plugin.string.LinkCopied)
  }

  async function revoke (): Promise<void> {
    if (busy) return
    busy = true
    try {
      if (meeting !== undefined) {
        await revokePermanentMeetingLink(meeting)
      } else if (permanentMeetingId !== undefined) {
        // Opened from the series: revoking the series link would leave the meeting's own link alive.
        const owned = await permanentMeetingOf(link)
        if (owned !== undefined) await revokePermanentMeetingLink(owned)
      } else if (event !== undefined) {
        await revokeMeetingLink(event)
      }
    } finally {
      busy = false
    }
    dispatch('close')
  }
</script>

<div class="antiPopup p-4 flex-col flex-gap-3">
  <div class="fs-title"><Label label={plugin.string.MeetingLinkSettings} /></div>

  <div class="grid">
    <Label label={plugin.string.WhoCanStart} />
    <DropdownLabelsIntl
      items={startItems}
      selected={access.start}
      kind="regular"
      size="medium"
      on:selected={(e) => {
        void save({ start: e.detail })
      }}
    />

    {#if offersSeriesSettings}
      <Label label={plugin.string.AfterTheSeries} />
      <DropdownLabelsIntl
        items={pastItems}
        selected={access.past}
        kind="regular"
        size="medium"
        on:selected={(e) => {
          void save({ past: e.detail })
        }}
      />

      <Label label={plugin.string.LinkLifetime} />
      <DropdownLabelsIntl
        items={ttlItems}
        selected={access.afterTtl === null ? 'forever' : `${access.afterTtl}`}
        kind="regular"
        size="medium"
        on:selected={(e) => {
          void save({ afterTtl: e.detail === 'forever' ? null : Number(e.detail) })
        }}
      />
    {/if}
  </div>

  <div class="flex-col flex-gap-2">
    <div class="flex-row-center flex-gap-2">
      <Label label={plugin.string.GuestPassword} />
      <Label label={passwordSet ? plugin.string.PasswordSet : plugin.string.PasswordNotSet} />
    </div>
    {#if editingPassword}
      <div class="flex-row-center flex-gap-2">
        <EditBox
          bind:value={passwordInput}
          format="password"
          placeholder={plugin.string.EnterPassword}
          kind="default"
          autoFocus
        />
        <Button
          label={plugin.string.SetPassword}
          disabled={passwordInput === '' || busy}
          loading={busy}
          on:click={savePassword}
        />
      </div>
    {:else}
      <div class="flex-row-center flex-wrap flex-gap-2">
        <Button label={plugin.string.SetPassword} on:click={startEditPassword} />
        {#if passwordSet}
          <Button
            kind="dangerous"
            label={plugin.string.RemovePassword}
            disabled={busy}
            loading={busy}
            on:click={removePassword}
          />
        {/if}
        <!-- A password is copied in either form: with the password inside the link and the bare link. -->
        {#if passwordSet}
          <Button
            label={plugin.string.CopyLinkWithPassword}
            on:click={() => {
              void copyLinkWithPassword()
            }}
          />
        {/if}
      </div>
    {/if}

    {#if askingPasswordToCopy}
      <div class="flex-row-center flex-wrap flex-gap-2">
        <EditBox
          bind:value={copyPassword}
          format="password"
          placeholder={plugin.string.EnterPassword}
          kind="default"
          autoFocus
        />
        <Button
          label={plugin.string.CopyLinkWithPassword}
          disabled={copyPassword === ''}
          on:click={() => {
            void copyLinkWithPassword(copyPassword)
          }}
        />
      </div>
    {/if}
  </div>

  <Button label={plugin.string.CopyGuestLink} on:click={copyLink} />

  <Button
    kind="dangerous"
    label={plugin.string.RevokeLink}
    showTooltip={{ label: plugin.string.RevokeLinkTooltip }}
    disabled={busy}
    loading={busy}
    on:click={revoke}
  />
</div>

<style lang="scss">
  .grid {
    display: grid;
    grid-template-columns: 1fr auto;
    row-gap: 0.75rem;
    column-gap: 1rem;
    align-items: center;
  }
</style>
