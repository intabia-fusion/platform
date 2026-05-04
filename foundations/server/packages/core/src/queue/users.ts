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

import { type AccountUuid, type PersonId } from '@hcengineering/core'

export enum QueueUserEvent {
  login = 'login',
  logout = 'logout',
  notifyStatusChanged = 'notifyStatusChanged'
}

export type QueueUserMessage = QueueUserLogin | QueueUserLogout | QueueUserNotifyStatusChanged

export interface QueueUserLogin {
  type: QueueUserEvent.login
  user: AccountUuid
  transactorId: string
  timestamp: number
  sessions: number
  socialIds: PersonId[]
}

export interface QueueUserLogout {
  type: QueueUserEvent.logout
  user: AccountUuid
  transactorId: string
  timestamp: number
  sessions: number
  socialIds: PersonId[]
}

export interface QueueUserNotifyStatusChanged {
  type: QueueUserEvent.notifyStatusChanged
  user: AccountUuid
  hasUnread: boolean
  timestamp: number
}

export const userEvents = {
  login: function userLogin (data: Omit<QueueUserLogin, 'type'>): QueueUserLogin {
    return {
      type: QueueUserEvent.login,
      ...data
    }
  },
  logout: function userLogout (data: Omit<QueueUserLogin, 'type'>): QueueUserLogout {
    return {
      type: QueueUserEvent.logout,
      ...data
    }
  },
  notifyStatusChanged: function notifyStatusChanged (
    data: Omit<QueueUserNotifyStatusChanged, 'type'>
  ): QueueUserNotifyStatusChanged {
    return {
      type: QueueUserEvent.notifyStatusChanged,
      ...data
    }
  }
}
