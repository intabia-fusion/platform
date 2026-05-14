//
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
//

import { getCurrentEmployee, getCurrentEmployeeSpace, type Person } from '@hcengineering/contact'
import { getPersonByPersonRef } from '@hcengineering/contact-resources'
import { AccountRole, getCurrentAccount, type Ref } from '@hcengineering/core'
import love, { type MeetingMinutes, type UserMeetingInvite } from '@hcengineering/love'
import { createQuery, getClient, onClient, playSound } from '@hcengineering/presentation'
import { addNotification, NotificationSeverity, type PopupResult } from '@hcengineering/ui'
import { translate } from '@hcengineering/platform'
import { getCurrentLanguage } from '@hcengineering/theme'
import { derived, get, writable, type Writable } from 'svelte/store'
import { joinOrCreateMeetingByInvite } from './meetings'
import { currentMeetingMinutes } from './stores'
import KnockResolutionToast from './components/meeting/invites/KnockResolutionToast.svelte'

export const inviteRequestSecondsToLive = 30
const knockHeartbeatMs = 60_000
const knockHeartbeatExtendMs = 10 * 60 * 1000

let knockHeartbeatTimer: ReturnType<typeof setInterval> | undefined

let requestPopup: PopupResult | undefined
let responsePopup: PopupResult | undefined

export const allInvites: Writable<UserMeetingInvite[]> = writable([])

// All invites we send to somebody.
export const outgoingInvitesStore = derived(allInvites, (all) => {
  const outgoing = all.filter((it) => it.kind === 'invite-request')
  console.log('[outgoingInvitesStore] recompute', {
    total: all.length,
    outgoing: outgoing.map((o) => ({
      id: o._id,
      status: o.status,
      meeting: o.meeting,
      isKnock: o.isKnock,
      modOn: o.modifiedOn
    }))
  })
  void checkAndJoinIfRecipientJoined(outgoing)
  return outgoing
})

// All waiting for confirmation
export const incomingInvitesStore = derived(allInvites, (all) => {
  const now = Date.now()
  const incoming = all.filter(
    (it) => it.kind === 'invite-response' && it.isKnock !== true && it.status === 'pending' && it.expiresAt > now
  )

  if (incoming.length > 0 && stopIncomingSound == null) {
    stopIncomingSound = playIncomingSound()
  } else if (stopIncomingSound != null) {
    void stopIncomingInviteSound()
  }

  // After accept, the server lazy-creates a meeting in the caller's office
  // and patches our invite-response with `meeting`. Watch for accepted +
  // meeting-set responses and auto-join them (mirrors the caller-side
  // `checkAndJoinIfRecipientJoined`).
  const acceptedWithMeeting = all.filter(
    (it) => it.kind === 'invite-response' && it.isKnock !== true && it.status === 'accepted' && it.meeting !== undefined
  )
  console.log('[incomingInvitesStore] recompute', {
    total: all.length,
    incoming: incoming.length,
    acceptedWithMeeting: acceptedWithMeeting.length,
    invites: all
      .filter((it) => it.kind === 'invite-response')
      .map((i) => ({ id: i._id, status: i.status, meeting: i.meeting, isKnock: i.isKnock, modOn: i.modifiedOn }))
  })
  if (acceptedWithMeeting.length > 0) {
    void checkAndJoinIfRecipientAccepted(acceptedWithMeeting)
  }

  return incoming
})

// Pending knock-to-join requests addressed to me as a meeting owner.
// No 30s expiry, no sound — they go into a side panel until the owner acts
// or the meeting ends (server-side cleanup). Filter out invites whose
// knocker stopped renewing the heartbeat (likely closed the tab).
export const knockingInvitesStore = derived(allInvites, (all) => {
  const now = Date.now()
  return all.filter(
    (it) => it.kind === 'invite-response' && it.isKnock === true && it.status === 'pending' && it.expiresAt > now
  )
})

// Active sound stop function
let stopIncomingSound: Promise<(() => void) | null> | undefined

// Query for incoming invite-response (created by server trigger in recipient's space)
const incomingInvitesQuery = createQuery(true)

export interface InviteRequest {
  from: Ref<Person>
  meetingId: string
}

export interface InviteResponse {
  from: Ref<Person>
  meetingId: string
  accept: boolean
}

/**
 * Send meeting invites to multiple persons
 * Shows popup for sender with cancel button
 */
export async function sendInvites (persons: Array<Ref<Person>>, meeting?: Ref<MeetingMinutes>): Promise<void> {
  if (getCurrentAccount().role === AccountRole.ReadOnlyGuest) {
    return
  }

  const currentPerson = getCurrentEmployee()
  if (currentPerson === undefined) {
    return
  }

  // Filter out self-invites
  const validPersons = persons.filter((p) => p !== currentPerson)
  if (validPersons.length === 0) {
    return
  }

  closeInvitesPopup()

  // Check if we're in a meeting
  const meetingId = meeting ?? get(currentMeetingMinutes)?._id

  const mySpace = getCurrentEmployeeSpace()

  if (mySpace === undefined) {
    return
  }

  const expiresAt = Date.now() + inviteRequestSecondsToLive * 1000

  const client = getClient()

  // Note: members are added to the MeetingMinutes on the server in OnUserMeetingInvite
  // after the privacy/owner check passes — clients must not mutate members directly,
  // otherwise non-owners could grant private-meeting access to arbitrary persons.

  for (const person of validPersons) {
    // Use per-person apply with notMatch to prevent duplicate pending invites
    const apply = client.apply('create-invite:' + currentPerson + ':' + person)
    apply.notMatch(love.class.UserMeetingInvite, {
      kind: 'invite-request',
      from: currentPerson,
      to: person,
      status: 'pending'
    })
    await apply.createDoc(love.class.UserMeetingInvite, mySpace, {
      kind: 'invite-request',
      from: currentPerson,
      to: person,
      expiresAt,
      status: 'pending',
      ...(meetingId !== undefined && { meeting: meetingId })
    })
    await apply.commit()
  }
}

/**
 * Close the invite request popup
 */
export function closeInvitesPopup (): void {
  requestPopup?.close()
  requestPopup = undefined
}

/**
 * Close the invite response popup
 */
export function closeResponsePopup (): void {
  responsePopup?.close()
  responsePopup = undefined
}

/**
 * Cancel all invites for a meeting
 */
export async function cancelInvites (
  meetingId: Ref<MeetingMinutes> | undefined,
  invites: UserMeetingInvite[]
): Promise<void> {
  const client = getClient()
  const currentPerson = getCurrentEmployee()
  if (currentPerson === undefined) return

  try {
    // Cancel them
    for (const invite of invites) {
      await client.remove(invite)
    }
  } catch (error) {
    console.warn('Failed to cancel invites:', error)
  }

  closeInvitesPopup()
}

/**
 * Subscribe to incoming meeting invites
 * Called when app starts
 * We read ALL UserMeetingInvite from our personal space, then separate by kind:
 * - invite-request: outgoing invites from us, track status changes
 * - invite-response: incoming invites to us, show accept/decline panel
 */
export function subscribeToIncomingInvites (): void {
  // Defer until the client *and* the current employee space are both ready.
  // `onClient` only guarantees a live transactor connection — `setCurrentEmployeeSpace`
  // runs later in the workbench connect flow (it depends on a PersonSpace
  // findOne). Subscribing before the space is known fixed a class of test
  // races where the caller's `liveQuery` never landed, and the auto-join
  // handler on the caller side never observed the synced invite-request.
  onClient(() => {
    const trySubscribe = (): void => {
      const mySpace = getCurrentEmployeeSpace()
      if (mySpace === undefined) {
        setTimeout(trySubscribe, 100)
        return
      }

      let previous: UserMeetingInvite[] = []
      console.log('[subscribeToIncomingInvites] starting query', { mySpace })
      incomingInvitesQuery.query(love.class.UserMeetingInvite, { space: mySpace }, (invites) => {
        console.log('[invites liveQuery] update', {
          count: invites.length,
          mySpace,
          invites: invites.map((i) => ({
            _id: i._id,
            kind: i.kind,
            status: i.status,
            meeting: i.meeting,
            isKnock: i.isKnock,
            from: i.from,
            to: i.to,
            modOn: i.modifiedOn
          }))
        })
        void notifyOnKnockResolution(previous, invites)
        previous = invites
        allInvites.set(invites)
      })

      if (knockHeartbeatTimer === undefined) {
        knockHeartbeatTimer = setInterval(() => {
          void renewOutgoingKnocks()
        }, knockHeartbeatMs)
      }
    }
    trySubscribe()
  })
}

async function renewOutgoingKnocks (): Promise<void> {
  const me = getCurrentEmployee()
  if (me === undefined) return
  const client = getClient()
  const all = get(allInvites)
  const newExpiry = Date.now() + knockHeartbeatExtendMs
  for (const invite of all) {
    if (invite.kind !== 'invite-request' || invite.from !== me || invite.isKnock !== true) continue
    if (invite.status !== 'pending') continue
    if (invite.expiresAt - Date.now() > knockHeartbeatExtendMs / 2) continue
    try {
      await client.update(invite, { expiresAt: newExpiry })
    } catch {
      // Best effort — invite may have been removed concurrently.
    }
  }
}

/**
 * Track the last observed status of every outgoing knock-request. We only
 * want to notify the knocker when their request was explicitly declined —
 * acceptance (the request is consumed by `checkAndJoinIfRecipientJoined`)
 * and meeting-end cleanup must stay silent.
 */
const lastKnockStatus = new Map<Ref<UserMeetingInvite>, 'pending' | 'accepted' | 'declined'>()

async function notifyOnKnockResolution (previous: UserMeetingInvite[], current: UserMeetingInvite[]): Promise<void> {
  const me = getCurrentEmployee()
  if (me === undefined) return

  // Refresh known statuses from the latest snapshot.
  const currentMap = new Map<Ref<UserMeetingInvite>, UserMeetingInvite>()
  for (const inv of current) currentMap.set(inv._id, inv)
  for (const inv of current) {
    if (inv.kind === 'invite-request' && inv.from === me && inv.isKnock === true) {
      lastKnockStatus.set(inv._id, inv.status)
    }
  }

  if (previous.length === 0) return
  for (const prev of previous) {
    if (currentMap.has(prev._id)) continue
    if (prev.kind !== 'invite-request') continue
    if (prev.from !== me) continue
    if (prev.isKnock !== true) continue
    // Only show the declined toast if the last observed status was 'declined'.
    // Accepted invites are removed by checkAndJoinIfRecipientJoined; meeting
    // cleanup also removes them — both must stay silent here.
    const lastStatus = lastKnockStatus.get(prev._id) ?? prev.status
    lastKnockStatus.delete(prev._id)
    if (lastStatus !== 'declined') continue
    addNotification(
      await translate(love.string.KnockingTo, {}, getCurrentLanguage()),
      await translate(love.string.KnockDeclined, {}, getCurrentLanguage()),
      KnockResolutionToast,
      undefined,
      NotificationSeverity.Info,
      'love'
    )
  }
}

/**
 * Respond to an invite request (accept or decline)
 * This function is called from IncomingInvitePanel component
 * Updates invite-response, server trigger syncs to invite-request
 *
 * For invites without `meeting`: the server lazy-creates one in the
 * caller's office on accept and patches it back into our invite-response.
 * We do not create a meeting on the recipient side anymore — that path
 * used to host the meeting in the recipient's office and made the
 * recipient the owner, which was the wrong semantic. See
 * `checkAndJoinIfRecipientAccepted` for the lazy-create auto-join.
 */
export async function responseToInviteRequest (invite: UserMeetingInvite, accept: boolean): Promise<void> {
  const client = getClient()
  const me = getCurrentEmployee()
  if (me === undefined) return

  try {
    if (accept) {
      if (invite.meeting !== undefined) {
        // Existing meeting: join immediately, then mark accepted. The server
        // removes the invite-response once status flips.
        await joinOrCreateMeetingByInvite(invite.meeting)
        await client.update(invite, { status: 'accepted' })
      } else {
        // Lazy-create path: just flip status. The server will create the
        // meeting in the caller's office, patch our invite-response with
        // the meeting ref, and we'll auto-join via liveQuery in
        // `checkAndJoinIfRecipientAccepted` below.
        await client.update(invite, { status: 'accepted' })
      }
    } else {
      // Just decline the invite
      await client.update(invite, { status: 'declined' })
    }
  } catch (error) {
    console.warn('Failed to respond to invite:', error)
  }
}

/**
 * Play sound for incoming invites
 */
async function playIncomingSound (): Promise<(() => void) | null> {
  try {
    // Stop previous sound if playing
    await stopIncomingInviteSound()
    return (await playSound(love.sound.Knock, true)) ?? null
  } catch (err) {
    console.error('Error playing sound:', err)
  }
  return null
}

/**
 * Stop incoming invite sound
 */
export async function stopIncomingInviteSound (): Promise<void> {
  if (stopIncomingSound != null) {
    const stop = await stopIncomingSound
    stop?.()
    stopIncomingSound = undefined
  }
}

/**
 * Unsubscribe from incoming invites
 */
export function unsubscribeFromIncomingInvites (): void {
  incomingInvitesQuery.unsubscribe()
  if (knockHeartbeatTimer !== undefined) {
    clearInterval(knockHeartbeatTimer)
    knockHeartbeatTimer = undefined
  }
}

// Guard against re-entry from concurrent store recalculations.
const handlingInvites = new Set<Ref<UserMeetingInvite>>()
const handlingAccepted = new Set<Ref<UserMeetingInvite>>()

/**
 * Receiver-side auto-join after the server lazy-created the meeting in the
 * caller's office. Mirrors {@link checkAndJoinIfRecipientJoined} (caller
 * side): when we observe our own invite-response in `accepted` with a
 * `meeting` ref, connect to it and then remove the invite-response.
 */
export async function checkAndJoinIfRecipientAccepted (invites: UserMeetingInvite[]): Promise<void> {
  const client = getClient()
  for (const invite of invites) {
    if (invite.meeting === undefined) continue
    if (invite.status !== 'accepted') continue
    if (handlingAccepted.has(invite._id)) continue
    console.log('[checkAndJoinIfRecipientAccepted] auto-joining', { invite: invite._id, meeting: invite.meeting })
    handlingAccepted.add(invite._id)
    let joined = false
    try {
      const currentMeeting = get(currentMeetingMinutes)
      if (currentMeeting?._id === invite.meeting) {
        joined = true
      } else {
        joined = await joinOrCreateMeetingByInvite(invite.meeting)
      }
      console.log('[checkAndJoinIfRecipientAccepted] join result', { invite: invite._id, joined })
    } catch (err) {
      console.warn('Failed to auto-join via lazy-created meeting', err)
    } finally {
      if (joined) {
        try {
          await client.removeDoc(love.class.UserMeetingInvite, invite.space, invite._id)
        } catch {
          // Already removed concurrently — ignore.
        }
      }
      handlingAccepted.delete(invite._id)
    }
  }
}

export async function checkAndJoinIfRecipientJoined (invites: UserMeetingInvite[]): Promise<void> {
  const client = getClient()
  const me = getCurrentEmployee()
  if (me === undefined) return

  console.log('[checkAndJoinIfRecipientJoined] called', {
    invites: invites.map((i) => ({ id: i._id, status: i.status, meeting: i.meeting, modOn: i.modifiedOn })),
    handling: [...handlingInvites]
  })
  for (const invite of invites) {
    if (handlingInvites.has(invite._id)) continue
    if (invite.status === 'accepted' && invite.meeting !== undefined) {
      console.log('[checkAndJoinIfRecipientJoined] auto-joining', { invite: invite._id, meeting: invite.meeting })
      handlingInvites.add(invite._id)
      let joined = false
      try {
        const currentMeeting = get(currentMeetingMinutes)
        if (currentMeeting?._id === invite.meeting) {
          joined = true
        } else {
          joined = await joinOrCreateMeetingByInvite(invite.meeting)
        }
        console.log('[checkAndJoinIfRecipientJoined] join result', { invite: invite._id, joined })
      } catch (err) {
        // Keep invite for next derived-store recompute so the client can retry.
        console.warn('Failed to auto-join via accepted invite', err)
      } finally {
        if (joined) {
          try {
            await client.removeDoc(love.class.UserMeetingInvite, invite.space, invite._id)
          } catch {
            // Already removed concurrently — ignore.
          }
        }
        handlingInvites.delete(invite._id)
      }
    } else if (invite.status === 'declined') {
      if (invite.declineReason === 'no-host-office') {
        // Server auto-declined because the caller (us) has no Office to
        // host the meeting in.
        addNotification(
          await translate(love.string.NoHostOffice, {}, getCurrentLanguage()),
          await translate(love.string.NoHostOfficeBody, {}, getCurrentLanguage()),
          KnockResolutionToast,
          undefined,
          NotificationSeverity.Warning,
          'love'
        )
      } else if (invite.isKnock !== true) {
        // Recipient explicitly declined a normal call. Knock-declines are
        // notified separately in `notifyOnKnockResolution` so the toast
        // reads "your knock was declined" with knock-specific copy.
        const recipient = await getPersonByPersonRef(invite.to)
        const name = recipient?.name ?? ''
        addNotification(
          await translate(love.string.CallDeclined, {}, getCurrentLanguage()),
          await translate(love.string.CallDeclinedBody, { name }, getCurrentLanguage()),
          KnockResolutionToast,
          undefined,
          NotificationSeverity.Info,
          'love'
        )
      }
      await client.removeDoc(love.class.UserMeetingInvite, invite.space, invite._id)
    }
  }
}
