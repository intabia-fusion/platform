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
import { AccountRole, getCurrentAccount, type AccountUuid, type Ref } from '@hcengineering/core'
import love, { type MeetingMinutes, type UserMeetingInvite } from '@hcengineering/love'
import { createQuery, getClient, playSound } from '@hcengineering/presentation'
import { addNotification, NotificationSeverity, type PopupResult } from '@hcengineering/ui'
import { translate } from '@hcengineering/platform'
import { getCurrentLanguage } from '@hcengineering/theme'
import { derived, get, writable, type Writable } from 'svelte/store'
import { createMeeting, joinOrCreateMeetingByInvite } from './meetings'
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
  void checkAndJoinIfRecipientJoined(outgoing)
  return outgoing
})

// All waiting for confirmation
export const incomingInvitesStore = derived(allInvites, (all) => {
  const now = Date.now()
  const incoming = all.filter((it) => it.kind === 'invite-response' && it.isKnock !== true && it.expiresAt > now)

  if (incoming.length > 0 && stopIncomingSound == null) {
    stopIncomingSound = playIncomingSound()
  } else if (stopIncomingSound != null) {
    void stopIncomingInviteSound()
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
  const mySpace = getCurrentEmployeeSpace()
  if (mySpace === undefined) return

  let previous: UserMeetingInvite[] = []
  incomingInvitesQuery.query(love.class.UserMeetingInvite, { space: mySpace }, (invites) => {
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
 */
export async function responseToInviteRequest (invite: UserMeetingInvite, accept: boolean): Promise<void> {
  const client = getClient()
  const me = getCurrentEmployee()
  if (me === undefined) return

  try {
    if (accept) {
      // Check if this is an invite to an existing meeting
      if (invite.meeting !== undefined) {
        // Join existing meeting
        await joinOrCreateMeetingByInvite(invite.meeting)
        await client.update(invite, { status: 'accepted' })
      } else {
        // Create new meeting in MY office (the recipient's office)
        const myOffice = await client.findOne(love.class.Office, {
          person: me
        })

        if (myOffice !== undefined) {
          // Create meeting in MY office and join
          const meeting = await createMeeting(myOffice)

          if (meeting !== undefined) {
            // Add invite sender to meeting members (for private Space access)
            const senderPerson = await getPersonByPersonRef(invite.from)
            if (senderPerson?.personUuid != null && !meeting.members.includes(senderPerson.personUuid as AccountUuid)) {
              await client.update(meeting, {
                $push: { members: senderPerson.personUuid as AccountUuid }
              })
            }

            // Update invite-response with meeting reference
            await client.update(invite, {
              status: 'accepted',
              meeting: meeting._id
            })
          } else {
            // If meeting creation failed, decline the invite
            await client.update(invite, { status: 'declined' })
          }
        }
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

export async function checkAndJoinIfRecipientJoined (invites: UserMeetingInvite[]): Promise<void> {
  const client = getClient()
  const me = getCurrentEmployee()
  if (me === undefined) return

  for (const invite of invites) {
    if (handlingInvites.has(invite._id)) continue
    if (invite.status === 'accepted' && invite.meeting !== undefined) {
      handlingInvites.add(invite._id)
      let joined = false
      try {
        const currentMeeting = get(currentMeetingMinutes)
        if (currentMeeting?._id === invite.meeting) {
          joined = true
        } else {
          joined = await joinOrCreateMeetingByInvite(invite.meeting)
        }
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
      await client.removeDoc(love.class.UserMeetingInvite, invite.space, invite._id)
    }
  }
}
