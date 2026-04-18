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
import serverCore from '@intabiafusion/server-core'
import serverRequest from '@intabiafusion/server-request'
import serverNotification from '@intabiafusion/server-notification'
import request from '@intabiafusion/model-request'
import notification from '@intabiafusion/notification'
import serverActivity from '@intabiafusion/server-activity'

export { serverRequestId } from '@intabiafusion/server-request'

export function createModel (builder: Builder): void {
  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverRequest.trigger.OnRequest,
    txMatch: {
      objectClass: request.class.Request
    }
  })

  builder.mixin(request.class.Request, core.class.Class, serverActivity.mixin.TitlePresenter, {
    presenter: serverRequest.function.RequestTitlePresenter
  })

  builder.mixin(
    request.ids.CreateRequestNotification,
    notification.class.NotificationType,
    serverNotification.mixin.TypeMatch,
    {
      match: serverRequest.function.SendRequestMatch,
      create: serverRequest.function.SendRequestCreateNotification
    }
  )

  builder.mixin(
    request.ids.RemoveRequestNotification,
    notification.class.NotificationType,
    serverNotification.mixin.TypeMatch,
    {
      match: serverRequest.function.RemoveRequestMatch,
      create: serverRequest.function.RemoveRequestCreateNotification
    }
  )
}
