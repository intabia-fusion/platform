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

import { type Builder } from '@hcengineering/model'
import core from '@hcengineering/core'
import serverCore from '@hcengineering/server-core'
import serverCommunication from '@hcengineering/server-communication'
import { MessageEventType } from '@hcengineering/communication-sdk-types'
import { MessageType } from '@hcengineering/communication-types'

export { serverCommunicationId } from '@hcengineering/server-communication'

export function createModel (builder: Builder): void {
  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverCommunication.trigger.AddCollaboratorsOnMessageCreate,
    txMatch: {
      _class: core.class.TxDomainEvent,
      'event.type': MessageEventType.CreateMessage,
      'event.messageType': MessageType.Text
    },
    isAsync: true
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverCommunication.trigger.ActivityMessagesTrigger,
    isAsync: true
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverCommunication.trigger.OnMessageCreate,
    txMatch: {
      _class: core.class.TxDomainEvent,
      'event.type': MessageEventType.CreateMessage
    },
    isAsync: true
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverCommunication.trigger.OnMessageRemove,
    txMatch: {
      _class: core.class.TxDomainEvent,
      'event.type': MessageEventType.RemovePatch
    },
    isAsync: true
  })
}
