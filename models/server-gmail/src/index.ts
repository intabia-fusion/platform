//
// Copyright © 2022 Hardcore Engineering Inc.
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

import { type Builder } from '@intabiafusion/model'

import contact from '@intabiafusion/contact'
import core, { type Class, type Doc } from '@intabiafusion/core'
import gmail from '@intabiafusion/gmail'
import notification, { type NotificationType } from '@intabiafusion/notification'
import serverCore, { type ObjectDDParticipant } from '@intabiafusion/server-core'
import serverGmail from '@intabiafusion/server-gmail'
import serverNotification, { type TypeMatch } from '@intabiafusion/server-notification'
export { serverGmailId } from '@intabiafusion/server-gmail'

export function createModel (builder: Builder): void {
  builder.mixin<Class<Doc>, ObjectDDParticipant>(
    contact.class.Channel,
    core.class.Class,
    serverCore.mixin.ObjectDDParticipant,
    {
      collectDocs: serverGmail.function.FindMessages
    }
  )

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverGmail.trigger.OnMessageCreate,
    txMatch: {
      _class: core.class.TxCreateDoc,
      objectClass: gmail.class.Message
    }
  })

  builder.mixin<NotificationType, TypeMatch>(
    gmail.ids.EmailNotification,
    notification.class.MessageNotificationType,
    serverNotification.mixin.TypeMatch,
    {
      match: serverGmail.function.IsIncomingMessageTypeMatch
    }
  )

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverGmail.trigger.NotificationsHandler,
    isAsync: true,
    txMatch: {
      _class: core.class.TxCreateDoc,
      objectClass: notification.class.InboxNotification
    }
  })
}
