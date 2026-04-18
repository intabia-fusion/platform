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

import core from '@intabiafusion/core'
import lead from '@intabiafusion/model-lead'
import notification, { type NotificationType } from '@intabiafusion/notification'
import serverLead from '@intabiafusion/server-lead'
import serverNotification, { type TypeMatch } from '@intabiafusion/server-notification'
import serverActivity from '@intabiafusion/server-activity'

export { serverLeadId } from '@intabiafusion/server-lead'

export function createModel (builder: Builder): void {
  builder.mixin(lead.class.Lead, core.class.Class, serverActivity.mixin.UrlPresenter, {
    presenter: serverLead.function.LeadUrlPresenter
  })

  builder.mixin(lead.class.Lead, core.class.Class, serverActivity.mixin.IdentifierPresenter, {
    presenter: serverLead.function.LeadIdentifierPresenter
  })

  builder.mixin<NotificationType, TypeMatch>(
    lead.ids.AssigneeNotification,
    notification.class.MessageNotificationType,
    serverNotification.mixin.TypeMatch,
    {
      match: serverNotification.function.IsUserFieldValueTypeMatch
    }
  )
}
