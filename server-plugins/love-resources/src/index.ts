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

import contact, { Employee, Person } from '@hcengineering/contact'
import core, {
  combineAttributes,
  concatLink,
  Doc,
  Ref,
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
  Room,
  RoomAccess,
  RoomInfo
} from '@hcengineering/love'
import { getMetadata } from '@hcengineering/platform'
import serverCore, { TriggerControl } from '@hcengineering/server-core'
import view from '@hcengineering/view'
import { workbenchId } from '@hcengineering/workbench'

export async function OnEmployee (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx as TxMixin<Person, Employee>
    if (actualTx._class !== core.class.TxMixin) {
      continue
    }
    if (actualTx.mixin !== contact.mixin.Employee) {
      continue
    }
    const val = actualTx.attributes.active
    if (val === undefined) {
      continue
    }
    const user = (
      await control.findAll(control.ctx, contact.mixin.Employee, { _id: actualTx.objectId as Ref<Employee> })
    )[0]
    if (user === undefined) {
      continue
    }
    if (user.role === 'GUEST') {
      continue
    }
    if (val) {
      const freeRoom = (await control.findAll(control.ctx, love.class.Office, { person: null }))[0]
      if (freeRoom !== undefined) {
        return [
          control.txFactory.createTxUpdateDoc(freeRoom._class, freeRoom.space, freeRoom._id, {
            person: actualTx.objectId
          })
        ]
      }
    } else {
      const room = (await control.findAll(control.ctx, love.class.Office, { person: actualTx.objectId }))[0]
      if (room !== undefined) {
        result.push(
          control.txFactory.createTxUpdateDoc(room._class, room.space, room._id, {
            person: null
          })
        )
      }
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
    if (meeting?.attachedTo !== undefined) {
      targetRoom = meeting.attachedTo as Ref<Room>
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
        attachedTo: info.room,
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
      if (newRoom === undefined) {
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

export async function meetingMinutesHTMLPresenter (doc: Doc, control: TriggerControl): Promise<string> {
  const meetingMinutes = doc as MeetingMinutes
  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''

  const panelProps = [view.component.EditDoc, meetingMinutes._id, meetingMinutes._class]
  const fragment = encodeURIComponent(panelProps.join('|'))
  const path = `${workbenchId}/${control.workspace.url}/${loveId}#${fragment}`
  const link = concatLink(front, path)
  return `<a href="${link}">${meetingMinutes.title}</a>`
}

/**
 * @public
 */
export async function meetingMinutesTextPresenter (doc: Doc): Promise<string> {
  const meetingMinutes = doc as MeetingMinutes
  return meetingMinutes.title
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  function: {
    MeetingMinutesHTMLPresenter: meetingMinutesHTMLPresenter,
    MeetingMinutesTextPresenter: meetingMinutesTextPresenter
  },
  trigger: {
    OnEmployee,
    OnUserStatus,
    OnParticipantInfo,
    OnRoomInfo
  }
})
