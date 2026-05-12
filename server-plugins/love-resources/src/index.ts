//
// Copyright © 2024 Hardcore Engineering Inc.
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

import calendar, { Event } from '@hcengineering/calendar'
import contact, { Employee, formatName, Person, PersonSpace } from '@hcengineering/contact'
import core, {
  AccountUuid,
  Class,
  combineAttributes,
  concatLink,
  Data,
  Doc,
  DocumentUpdate,
  generateId,
  readOnlyGuestAccountUuid,
  Ref,
  Space,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxMixin,
  TxProcessor,
  TxUpdateDoc
} from '@hcengineering/core'
import love, {
  isOffice,
  loveId,
  MeetingMinutes,
  MeetingStatus,
  ParticipantInfo,
  RoomAccess,
  RoomInfo,
  UserMeetingInvite
} from '@hcengineering/love'
import { getMetadata } from '@hcengineering/platform'
import serverCore, { TriggerControl } from '@hcengineering/server-core'
import view from '@hcengineering/view'
import { workbenchId } from '@hcengineering/workbench'
import { getAccountBySocialId, getSocialStrings } from '@hcengineering/server-contact'
import notification, { CommonInboxNotification } from '@hcengineering/notification'

import { getInviteAllowedProviders } from './utils'
import { Presenter, PresenterControl } from '@hcengineering/server-activity'

export async function OnEmployee (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    let employeeId: Ref<Person> | undefined
    let employee: Employee | undefined

    // Handle TxCreateDoc (direct Employee creation)
    if (tx._class === core.class.TxCreateDoc) {
      const createTx = tx as TxCreateDoc<Employee>
      if (createTx.objectClass === contact.mixin.Employee) {
        employee = TxProcessor.createDoc2Doc(createTx)
        employeeId = createTx.objectId as Ref<Person>
      }
    } else if (tx._class === core.class.TxMixin) {
      // Handle TxMixin (Employee added as mixin to Person) - used by AI bot
      const mixinTx = tx as TxMixin<Person, Employee>
      if (mixinTx.mixin === contact.mixin.Employee) {
        employeeId = mixinTx.objectId
        // Check if employee is being activated
        if (mixinTx.attributes.active !== true) {
          continue
        }
        employee = mixinTx.attributes as Employee
      }
    }

    if (employeeId === undefined || employee === undefined) {
      continue
    }

    // Skip if employee is not active or is a guest
    if (!employee.active) {
      continue
    }
    if (employee.role === 'GUEST') {
      continue
    }

    control.ctx.info('[OnEmployee] Processing employee', {
      employeeId,
      active: employee.active,
      role: employee.role,
      txClass: tx._class
    })

    // Check if employee already has an office
    const existingRooms = await control.findAll(control.ctx, love.class.Office, { person: employeeId })
    control.ctx.info('[OnEmployee] Employee office check', {
      employeeId,
      existingOfficeCount: existingRooms.length
    })

    if (existingRooms.length > 0) {
      control.ctx.info('[OnEmployee] Employee already has office, skipping', {
        employeeId,
        officeId: existingRooms[0]._id
      })
      continue
    }

    // Find a free office and assign it
    const freeRoom = (await control.findAll(control.ctx, love.class.Office, { person: null }))[0]
    if (freeRoom !== undefined) {
      control.ctx.info('[OnEmployee] Assigning employee to office', {
        employeeId,
        officeId: freeRoom._id
      })
      result.push(
        control.txFactory.createTxUpdateDoc(freeRoom._class, freeRoom.space, freeRoom._id, {
          person: employeeId
        })
      )
    } else {
      control.ctx.info('[OnEmployee] No free office available', { employeeId })
    }
  }
  return result
}

export async function OnUserStatus (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  return []
}

async function roomJoinHandler (info: ParticipantInfo, control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []

  // Participants without a LiveKit sessionId (like AI bot) should not be added to RoomInfo.persons
  // to avoid triggering "room empty" logic when they disconnect (e.g., when stopping transcription)
  if (info.sessionId === null || info.sessionId === undefined) {
    return res
  }

  const roomInfos = await control.queryFind(control.ctx, love.class.RoomInfo, {})

  // Prefer MeetingMinutes association: if a ParticipantInfo references a meeting,
  // use the meeting's attached room as the canonical room for RoomInfo updates.
  let targetRoom = info.room
  if (info.meeting !== undefined) {
    const meeting = (await control.findAll(control.ctx, love.class.MeetingMinutes, { _id: info.meeting }))[0]
    if (meeting?.roomId !== undefined) {
      targetRoom = meeting.roomId
    }
  }

  const roomInfo = roomInfos.find((ri) => ri.room === targetRoom)
  if (roomInfo !== undefined && !roomInfo.persons.includes(info.person)) {
    res.push(
      control.txFactory.createTxUpdateDoc(love.class.RoomInfo, core.space.Workspace, roomInfo._id, {
        $push: { persons: info.person }
      })
    )
  } else {
    const room = (await control.findAll(control.ctx, love.class.Room, { _id: targetRoom }))[0]
    if (room === undefined) return []
    res.push(
      control.txFactory.createTxCreateDoc(love.class.RoomInfo, core.space.Workspace, {
        persons: [info.person],
        room: room._id,
        isOffice: isOffice(room)
      })
    )
  }
  if (info.account != null) {
    const meetingMinutes = (
      await control.findAll(control.ctx, love.class.MeetingMinutes, {
        roomId: info.room,
        status: MeetingStatus.Active
      })
    )[0]
    if (meetingMinutes !== undefined) {
      const colab = await control.findAll(control.ctx, core.class.Collaborator, {
        attachedTo: meetingMinutes._id,
        collaborator: info.account
      })
      if (colab.length === 0) {
        res.push(
          control.txFactory.createTxCreateDoc(core.class.Collaborator, core.space.Workspace, {
            attachedTo: meetingMinutes._id,
            attachedToClass: meetingMinutes._class,
            collection: 'collaborators',
            collaborator: info.account
          })
        )
      }
    }
  }
  return res
}

async function setDefaultRoomAccess (info: ParticipantInfo, control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  const roomInfos = await control.queryFind(control.ctx, love.class.RoomInfo, {})
  const oldRoomInfo = roomInfos.find((ri) => ri.persons.includes(info.person))
  if (oldRoomInfo !== undefined) {
    if (oldRoomInfo.persons.length === 1 && oldRoomInfo.persons[0] === info.person) {
      res.push(control.txFactory.createTxRemoveDoc(oldRoomInfo._class, oldRoomInfo.space, oldRoomInfo._id))

      const resetAccessTx = control.txFactory.createTxUpdateDoc(
        oldRoomInfo.isOffice ? love.class.Office : love.class.Room,
        core.space.Workspace,
        oldRoomInfo.room,
        {
          access: oldRoomInfo.isOffice ? RoomAccess.Knock : RoomAccess.Open
        }
      )
      res.push(resetAccessTx)
    } else {
      res.push(
        control.txFactory.createTxUpdateDoc(love.class.RoomInfo, core.space.Workspace, oldRoomInfo._id, {
          $pull: { persons: info.person }
        })
      )
    }
  }
  return res
}

export async function OnParticipantInfo (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx as TxCUD<ParticipantInfo>
    if (actualTx._class === core.class.TxCreateDoc) {
      const info = TxProcessor.createDoc2Doc(actualTx as TxCreateDoc<ParticipantInfo>)
      result.push(...(await roomJoinHandler(info, control)))
    }
    if (actualTx._class === core.class.TxRemoveDoc) {
      const removedInfo = control.removedMap.get(actualTx.objectId) as ParticipantInfo
      if (removedInfo === undefined) {
        continue
      }
      result.push(...(await setDefaultRoomAccess(removedInfo, control)))
      continue
    }
    if (actualTx._class === core.class.TxUpdateDoc) {
      const newRoom = (actualTx as TxUpdateDoc<ParticipantInfo>).operations.room
      const newMeeting = (actualTx as TxUpdateDoc<ParticipantInfo>).operations.meeting
      if (newRoom === undefined && newMeeting === undefined) {
        continue
      }
      const info = (
        await control.findAll(control.ctx, love.class.ParticipantInfo, { _id: actualTx.objectId }, { limit: 1 })
      )[0]
      if (info === undefined) {
        continue
      }
      result.push(...(await setDefaultRoomAccess(info, control)))
      result.push(...(await roomJoinHandler(info, control)))
    }
  }
  return result
}

const meetingMinutesUrlPresenter: Presenter = async (doc: Doc, control: PresenterControl): Promise<string> => {
  const meetingMinutes = doc as MeetingMinutes
  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''

  const panelProps = [view.component.EditDoc, meetingMinutes._id, meetingMinutes._class]
  const fragment = encodeURIComponent(panelProps.join('|'))
  const path = `${workbenchId}/${control.workspace.url}/${loveId}#${fragment}`
  return concatLink(front, path)
}

async function OnRoomInfo (txes: TxCUD<RoomInfo>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  const personsByRoom = new Map<Ref<RoomInfo>, Ref<Person>[]>()
  for (const tx of txes) {
    if (tx._class === core.class.TxRemoveDoc) {
      const roomInfo = control.removedMap.get(tx.objectId) as RoomInfo
      if (roomInfo === undefined) continue
      if (roomInfo.room === love.ids.Reception) continue
      personsByRoom.delete(tx.objectId)
      // Note: We no longer call finishRoomMeetings here on RoomInfo removal.
      // The love service handles room_finished webhook and finishes the specific meeting by meetingId.
      // Calling finishRoomMeetings here would incorrectly finish ALL active meetings for the room.
      continue
    }
    if (tx._class === core.class.TxUpdateDoc) {
      const updateTx = tx as TxUpdateDoc<RoomInfo>
      const pulled = combineAttributes([updateTx.operations], 'persons', '$pull', '$in')
      const pushed = combineAttributes([updateTx.operations], 'persons', '$push', '$each')

      if (pulled.length === 0 && pushed.length === 0) continue
      const roomInfos = await control.queryFind(control.ctx, love.class.RoomInfo, {})
      const roomInfo = roomInfos.find((r) => r._id === tx.objectId)
      if (roomInfo === undefined) continue
      if (roomInfo.room === love.ids.Reception) continue

      const currentPersons = personsByRoom.get(tx.objectId) ?? roomInfo.persons
      const newPersons = currentPersons.filter((p) => !pulled.includes(p)).concat(pushed)

      personsByRoom.set(tx.objectId, newPersons)
    }
  }
  return result
}

async function getPersonSpace (control: TriggerControl, person: Ref<Person>): Promise<PersonSpace> {
  // Find recipient's personal space (PersonSpace)
  return (await control.findAll(control.ctx, contact.class.PersonSpace, { person }, { limit: 1 }))[0]
}

/**
 * Unified trigger for UserMeetingInvite
 * Handles all events: creation, updates from sender (expiresAt, cancellation), updates from recipient (accept/decline)
 */
export async function OnUserMeetingInvite (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []

  for (const tx of txes) {
    // Handle creation of invite-request
    if (tx._class === core.class.TxCreateDoc) {
      const createTx = tx as TxCreateDoc<UserMeetingInvite>
      if (createTx.objectClass !== love.class.UserMeetingInvite) continue

      const invite = TxProcessor.createDoc2Doc(createTx)

      // Only process invite-request kind
      if (invite.kind !== 'invite-request') continue
      if (invite.status !== 'pending') continue

      // Skip self-invites
      if (invite.from === invite.to) continue

      // Knock-flow: if the recipient is currently inside a private meeting
      // that the sender doesn't have access to, treat this invite as a knock
      // and re-target it at that meeting's owners (request to join). This
      // applies even when the sender already has their own active meeting —
      // sending an invite to a person who's locked in another private room
      // is naturally a join-request.
      let isKnock = false
      let inviteMeeting: MeetingMinutes | undefined
      const senderPerson = await control
        .findAll(control.ctx, contact.class.Person, { _id: invite.from }, { limit: 1 })
        .then((r) => r[0])
      const senderAccount = senderPerson?.personUuid as AccountUuid | undefined
      const recipientInfos = await control.findAll(control.ctx, love.class.ParticipantInfo, { person: invite.to })
      for (const recipientInfo of recipientInfos) {
        if (recipientInfo.meeting === undefined) continue
        const recipientMeeting = await control
          .findAll(control.ctx, love.class.MeetingMinutes, { _id: recipientInfo.meeting }, { limit: 1 })
          .then((r) => r[0])
        if (recipientMeeting === undefined || recipientMeeting.status === MeetingStatus.Finished) continue
        if (!recipientMeeting.private) continue
        if (senderAccount !== undefined && recipientMeeting.members.includes(senderAccount)) continue
        inviteMeeting = recipientMeeting
        isKnock = true
        break
      }
      if (!isKnock && invite.meeting !== undefined) {
        inviteMeeting = await control
          .findAll(control.ctx, love.class.MeetingMinutes, { _id: invite.meeting }, { limit: 1 })
          .then((r) => r[0])
      }

      if (inviteMeeting?.private === true && !isKnock) {
        // Only owners can invite to private meetings.
        // (knock-case is handled above and never reaches this branch.)
        if (
          senderAccount === undefined ||
          inviteMeeting.owners === undefined ||
          !inviteMeeting.owners.includes(senderAccount)
        ) {
          continue
        }
      }

      // Add recipient to MeetingMinutes members on the server (after owner-check passed)
      // so the recipient can access the meeting space and receive knock/invite notifications.
      // For a knock the recipient is already a meeting owner, so skip.
      if (inviteMeeting !== undefined && !isKnock) {
        const recipientPerson = await control
          .findAll(control.ctx, contact.class.Person, { _id: invite.to }, { limit: 1 })
          .then((r) => r[0])
        const recipientAccount = recipientPerson?.personUuid as AccountUuid | undefined
        if (recipientAccount !== undefined && !inviteMeeting.members.includes(recipientAccount)) {
          result.push(
            control.txFactory.createTxUpdateDoc(love.class.MeetingMinutes, inviteMeeting.space, inviteMeeting._id, {
              $push: { members: { $each: [recipientAccount], $position: 0 } }
            })
          )
        }
      }

      // Find recipient's personal space (PersonSpace)
      const recipientSpace = await getPersonSpace(control, invite.to)
      if (recipientSpace === undefined) {
        control.ctx.warn('[OnUserMeetingInvite] no PersonSpace for recipient — skipping invite-response', {
          to: invite.to,
          isKnock
        })
        continue
      }

      // For knock-requests use a longer TTL (10 min) renewable from the
      // knocker's client; if the knocker closes the tab the invite expires
      // and is cleaned up. The meeting-end cleanup also wipes any lingering
      // invites (cleanupInvitesForMeeting in services/love).
      const knockTTLMs = 10 * 60 * 1000
      const responseExpiresAt = isKnock ? Date.now() + knockTTLMs : invite.expiresAt

      // For knock we patch the source invite-request with meeting+isKnock+
      // expiresAt so subsequent sync carries the meeting ref and the outgoing
      // UI doesn't auto-cancel in 30 seconds. Single tx — order matters.
      if (isKnock && inviteMeeting !== undefined) {
        result.push(
          control.txFactory.createTxUpdateDoc(love.class.UserMeetingInvite, createTx.objectSpace, createTx.objectId, {
            meeting: inviteMeeting._id,
            isKnock: true,
            expiresAt: responseExpiresAt
          })
        )
      }

      // Create invite-response in recipient's space.
      const responseId = generateId<UserMeetingInvite>()
      result.push(
        control.txFactory.createTxCreateDoc(
          love.class.UserMeetingInvite,
          recipientSpace._id,
          {
            kind: 'invite-response',
            from: invite.from,
            to: invite.to,
            meeting: inviteMeeting?._id ?? invite.meeting,
            expiresAt: responseExpiresAt,
            status: 'pending',
            isKnock
          },
          responseId
        )
      )

      // Create notification for recipient
      const employee = (
        await control.findAll(
          control.ctx,
          contact.mixin.Employee,
          { _id: invite.to as Ref<Employee>, active: true },
          { limit: 1 }
        )
      )[0]
      if (employee?.personUuid != null) {
        const account = employee.personUuid
        const socialIds = await getSocialStrings(control, employee._id)
        const receiverInfo = {
          account,
          socialIds,
          space: recipientSpace._id,
          employee: employee._id,
          role: employee.role
        } as const

        const sender: Person | undefined = (
          await control.findAll(control.ctx, contact.class.Person, { _id: invite.from })
        )[0]
        const allowedProviders = await getInviteAllowedProviders(control, receiverInfo.socialIds)

        // Get meeting info if available
        let notificationObjectId: Ref<Doc>
        let notificationObjectClass: Ref<Class<Doc>>
        let notificationObjectSpace: Ref<Space>

        if (invite.meeting !== undefined) {
          const meeting = await control
            .findAll(control.ctx, love.class.MeetingMinutes, { _id: invite.meeting }, { limit: 1 })
            .then((r) => r[0])
          // Attach to MeetingMinutes if exists
          notificationObjectId = meeting?._id ?? invite._id
          notificationObjectClass = meeting?._class ?? invite._class
          notificationObjectSpace = meeting?.space ?? invite.space
        } else {
          // No meeting - attach to sender's Person
          notificationObjectId = invite.from
          notificationObjectClass = contact.class.Person
          notificationObjectSpace = contact.space.Contacts
        }

        const currentContext = (
          await control.findAll(control.ctx, notification.class.DocNotifyContext, {
            objectId: notificationObjectId,
            user: receiverInfo.account
          })
        )[0]
        let contextId = currentContext?._id

        if (contextId === undefined) {
          const createContextTx = control.txFactory.createTxCreateDoc(
            notification.class.DocNotifyContext,
            receiverInfo.space,
            {
              objectId: notificationObjectId,
              objectClass: notificationObjectClass,
              objectSpace: notificationObjectSpace,
              user: receiverInfo.account,
              lastNotify: tx.modifiedOn
            }
          )
          contextId = createContextTx.objectId
          result.push(createContextTx)
        } else if (currentContext != null) {
          result.push(
            control.txFactory.createTxUpdateDoc(currentContext._class, currentContext.space, currentContext._id, {
              lastNotify: tx.modifiedOn
            })
          )
        }

        const senderName = formatName(sender?.name, control.branding?.lastNameFirst) ?? 'System'
        const data: Data<CommonInboxNotification> = {
          docNotifyContext: contextId,
          user: receiverInfo.account,
          message: love.string.InvitingYou,
          intlParams: {
            name: senderName,
            senderName
          },
          title: love.string.MeetingRequest,
          body: love.string.InvitingYou,
          header: love.string.MeetingRequest,
          headerIcon: love.icon.Invite,
          objectId: notificationObjectId,
          objectClass: notificationObjectClass,
          isViewed: receiverInfo.role === 'GUEST' && receiverInfo.account === readOnlyGuestAccountUuid,
          archived: false,
          allowedProviders: Object.fromEntries(
            allowedProviders.map((provider) => [provider, [love.ids.InviteNotification]])
          )
        }

        result.push(
          control.txFactory.createTxCreateDoc(notification.class.CommonInboxNotification, receiverInfo.space, {
            ...data
          })
        )
      }
    }

    // Handle updates
    if (tx._class === core.class.TxUpdateDoc || tx._class === core.class.TxRemoveDoc) {
      const cudTx = tx as TxCUD<UserMeetingInvite>
      if (cudTx.objectClass !== love.class.UserMeetingInvite) continue

      // Get the document being updated
      const sourceDoc =
        (
          await control.findAll(control.ctx, love.class.UserMeetingInvite, { _id: cudTx.objectId }, { limit: 1 })
        ).shift() ?? (control.removedMap.get(cudTx.objectId) as UserMeetingInvite | undefined)

      if (sourceDoc === undefined) continue

      if (sourceDoc.kind === 'invite-request') {
        // Update from sender - sync to recipient's invite-response
        // Find all invite-responses for this pair
        const inviteResponses = await control.findAll(control.ctx, love.class.UserMeetingInvite, {
          kind: 'invite-response',
          from: sourceDoc.from,
          to: sourceDoc.to
        })

        if (inviteResponses.length === 0) continue

        const now = Date.now()
        // Process all found invite-responses
        for (const response of inviteResponses) {
          // Handle cancellation - sync only if status changed
          if (tx._class === core.class.TxRemoveDoc || response.expiresAt < now) {
            // We need to remove other side
            result.push(control.txFactory.createTxRemoveDoc(love.class.UserMeetingInvite, response.space, response._id))
            continue
          }
          const updateTx = tx as TxUpdateDoc<UserMeetingInvite>

          // Handle expiresAt update - only if response is still pending and expiresAt changed
          if (updateTx.operations.expiresAt !== undefined && response.expiresAt !== updateTx.operations.expiresAt) {
            result.push(
              control.txFactory.createTxUpdateDoc(love.class.UserMeetingInvite, response.space, response._id, {
                expiresAt: updateTx.operations.expiresAt
              })
            )
          }
        }
      } else if (sourceDoc.kind === 'invite-response' && tx._class === core.class.TxRemoveDoc) {
        // Recipient removed their invite-response (e.g. joined the meeting via
        // MeetingMinutes link, not via the popup). Drop the matching
        // invite-request on sender side so the outgoing popup goes away too.
        // Skip knock-responses: the request must remain so the knocker's client
        // sees status='accepted' and auto-joins via checkAndJoinIfRecipientJoined.
        if (sourceDoc.isKnock === true) continue
        const inviteRequests = await control.findAll(control.ctx, love.class.UserMeetingInvite, {
          kind: 'invite-request',
          from: sourceDoc.from,
          to: sourceDoc.to
        })
        for (const request of inviteRequests) {
          result.push(control.txFactory.createTxRemoveDoc(love.class.UserMeetingInvite, request.space, request._id))
        }
      } else if (sourceDoc.kind === 'invite-response' && tx._class === core.class.TxUpdateDoc) {
        // Find invite-request for this pair
        const inviteRequests = await control.findAll(control.ctx, love.class.UserMeetingInvite, {
          kind: 'invite-request',
          from: sourceDoc.from,
          to: sourceDoc.to
        })

        const updateTx = tx as TxUpdateDoc<UserMeetingInvite>
        // Update from recipient (accept/decline) - sync to sender's invite-request
        const newStatus = updateTx.operations.status
        const newMeeting = updateTx.operations.meeting

        // If nothing changed, skip
        if (newStatus === undefined && newMeeting === undefined) continue

        // Knock: owner accepted/declined -> sync to knocker's invite-request.
        if (sourceDoc.isKnock === true && (newStatus === 'accepted' || newStatus === 'declined')) {
          // Authorize: the actor must be a meeting owner; if owners list is empty,
          // any current member may accept/decline. Otherwise non-owners receiving
          // the invite-response could grant themselves access to a private meeting.
          const knockMeeting =
            sourceDoc.meeting !== undefined
              ? (
                  await control.findAll(
                    control.ctx,
                    love.class.MeetingMinutes,
                    { _id: sourceDoc.meeting },
                    { limit: 1 }
                  )
                )[0]
              : undefined
          if (knockMeeting === undefined) continue
          const actorAccount = await getAccountBySocialId(control, updateTx.modifiedBy)
          const owners = knockMeeting.owners ?? []
          const authorized =
            actorAccount !== null &&
            (owners.length > 0 ? owners.includes(actorAccount) : knockMeeting.members.includes(actorAccount))
          if (!authorized) continue

          const request = inviteRequests[0]
          if (newStatus === 'accepted') {
            const knockerEmployee = (
              await control.findAll(
                control.ctx,
                contact.mixin.Employee,
                { _id: sourceDoc.from as Ref<Employee> },
                { limit: 1 }
              )
            )[0]
            const knockerAccount = knockerEmployee?.personUuid
            if (knockerAccount !== undefined && !knockMeeting.members.includes(knockerAccount)) {
              result.push(
                control.txFactory.createTxUpdateDoc(love.class.MeetingMinutes, knockMeeting.space, knockMeeting._id, {
                  $push: { members: knockerAccount }
                })
              )
            }
          }
          // Drop the owner-side invite-response.
          result.push(
            control.txFactory.createTxRemoveDoc(love.class.UserMeetingInvite, updateTx.objectSpace, updateTx.objectId)
          )
          // Sync status (+ meeting on accept) to the knocker's invite-request.
          if (request !== undefined) {
            const upd: DocumentUpdate<UserMeetingInvite> = { status: newStatus }
            if (newStatus === 'accepted' && request.meeting !== sourceDoc.meeting) {
              upd.meeting = sourceDoc.meeting
            }
            result.push(
              control.txFactory.createTxUpdateDoc(love.class.UserMeetingInvite, request.space, request._id, upd)
            )
          }
          continue
        }

        if (newStatus === 'declined' || (newStatus === 'accepted' && newMeeting !== undefined)) {
          // If we declined or accepted and meeting is set, we can remove the invite-response as it's no longer needed
          result.push(
            control.txFactory.createTxRemoveDoc(love.class.UserMeetingInvite, updateTx.objectSpace, updateTx.objectId)
          )
        }

        // If accepted, add recipient to meeting members
        if (newStatus === 'accepted' && newMeeting !== undefined) {
          const meeting = await control.findAll(
            control.ctx,
            love.class.MeetingMinutes,
            { _id: newMeeting },
            { limit: 1 }
          )
          if (meeting.length > 0) {
            // Find recipient's employee to get their account
            const recipientEmployee = await control.findAll(
              control.ctx,
              contact.mixin.Employee,
              { _id: sourceDoc.to as Ref<Employee> },
              { limit: 1 }
            )
            if (recipientEmployee.length > 0 && recipientEmployee[0].personUuid !== undefined) {
              const recipientAccount = recipientEmployee[0].personUuid
              const meetingDoc = meeting[0]
              // Add recipient to members if not already present
              if (!meetingDoc.members.includes(recipientAccount)) {
                result.push(
                  control.txFactory.createTxUpdateDoc(love.class.MeetingMinutes, meetingDoc.space, meetingDoc._id, {
                    $push: { members: recipientAccount }
                  })
                )
              }
            }
          }
        }

        for (const request of inviteRequests) {
          const upd: DocumentUpdate<UserMeetingInvite> = {}
          // Sync status if changed
          if (newStatus !== undefined && request.status !== newStatus) {
            upd.status = newStatus
          }
          // Sync meeting reference if provided (recipient created/joined a meeting)
          if (newMeeting !== undefined && request.meeting !== newMeeting) {
            upd.meeting = newMeeting
          }
          if (Object.keys(upd).length > 0) {
            result.push(
              control.txFactory.createTxUpdateDoc(love.class.UserMeetingInvite, request.space, request._id, upd)
            )
          }
        }
      }
    }
  }

  return result
}

/**
 * Trigger to update MeetingMinutes when Event is updated
 * - Updates meetingScheduledDate when Event date changes
 * - Updates members when Event participants change
 */
export async function OnEventUpdate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []

  for (const tx of txes) {
    if (tx._class !== core.class.TxUpdateDoc) continue

    const cudTx = tx as TxCUD<Event>
    if (cudTx.objectClass !== calendar.class.Event) continue

    // Get the event
    const event = (await control.findAll(control.ctx, calendar.class.Event, { _id: cudTx.objectId }, { limit: 1 }))[0]
    if (event === undefined) continue

    // Check if event has MeetingEventLink mixin
    const hasMeetingMixin = control.hierarchy.hasMixin(event, love.mixin.MeetingEventLink)
    if (!hasMeetingMixin) continue

    const meetingLink = control.hierarchy.as(event, love.mixin.MeetingEventLink)
    if (meetingLink.meetingId === undefined) continue

    // Get the meeting
    const meeting = await control.findAll(
      control.ctx,
      love.class.MeetingMinutes,
      { _id: meetingLink.meetingId },
      { limit: 1 }
    )
    if (meeting.length === 0) continue
    const meetingDoc = meeting[0]

    // Only update if meeting is in Scheduled status
    if (meetingDoc.status !== MeetingStatus.Scheduled) continue

    const updateTx = tx as TxUpdateDoc<Event>
    const ops = updateTx.operations
    const meetingUpdate: DocumentUpdate<MeetingMinutes> = {}

    // Update meetingScheduledDate if Event date changed
    if (ops.date !== undefined) {
      meetingUpdate.meetingScheduledDate = ops.date
    }

    // Update members if Event participants changed
    if (ops.participants !== undefined) {
      const newMembers: AccountUuid[] = []

      for (const participantRef of ops.participants) {
        const person = (
          await control.findAll(control.ctx, contact.class.Person, { _id: participantRef as Ref<Person> }, { limit: 1 })
        )[0]
        if (person?.personUuid !== undefined && !meetingDoc.members.includes(person.personUuid as AccountUuid)) {
          newMembers.push(person.personUuid as AccountUuid)
        }
      }

      if (newMembers.length > 0) {
        meetingUpdate.$push = { members: { $each: newMembers, $position: 0 } }
      }
    }

    // Apply update if there are changes
    if (Object.keys(meetingUpdate).length > 0) {
      result.push(
        control.txFactory.createTxUpdateDoc(love.class.MeetingMinutes, meetingDoc.space, meetingDoc._id, meetingUpdate)
      )
    }
  }

  return result
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  function: {
    MeetingMinutesUrlPresenter: meetingMinutesUrlPresenter
  },
  trigger: {
    OnEmployee,
    OnUserStatus,
    OnParticipantInfo,
    OnRoomInfo,
    OnUserMeetingInvite,
    OnEventUpdate
  }
})
