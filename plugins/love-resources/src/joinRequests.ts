//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { type Ref } from '@hcengineering/core'
import { type Person } from '@hcengineering/contact'

import { type MeetingMinutes } from '@hcengineering/love'
// import JoinRequestPopup from './components/meeting/invites/JoinRequestPopup.svelte'
// import JoinResponsePopup from './components/meeting/invites/JoinResponsePopup.svelte'

export const joinRequestSecondsToLive = 5

export interface JoinRequest {
  from: Ref<Person>
  meetingId: Ref<MeetingMinutes>
}

export interface JoinResponse {
  meetingId: Ref<MeetingMinutes>
  accept: boolean
}

// const requestPopupCategory = 'joinRequest'
// let requestPopup: PopupResult | undefined

export async function subscribeJoinResponses (): Promise<void> {}

export async function unsubscribeJoinResponses (): Promise<void> {}

export function sendJoinRequest (meetingId: string): void {
  // if (getCurrentAccount().role === AccountRole.ReadOnlyGuest) return
  // closeJoinRequestPopup()
  // requestMeetingId = meetingId
  // requestPopup = showPopup(JoinRequestPopup, { meetingId }, undefined, undefined, undefined, {
  //   category: requestPopupCategory,
  //   overlay: false,
  //   fixed: true
  // })
}

export function closeJoinRequestPopup (): void {}

export async function updateJoinRequest (): Promise<void> {}

export async function cancelJoinRequest (): Promise<void> {}

// async function onJoinResponse (_key: string, response: JoinResponse | undefined): Promise<void> {
//   await joinOrCreateMeetingByInvite(response.meetingId)
// }

export async function subscribeJoinRequests (meetingId: string | undefined): Promise<void> {}

export async function unsubscribeJoinRequests (): Promise<void> {}

export async function responseToJoinRequest (joinRequest: JoinRequest, accept: boolean): Promise<void> {
  // if (!accept) return
  // await joinOrCreateMeetingByInvite(joinRequest.meetingId)
}
