//
// Copyright © 2023 Hardcore Engineering Inc.
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

import { type Builder, Mixin } from '@hcengineering/model'
import serverCore from '@hcengineering/server-core'
import core from '@hcengineering/core'
import serverActivity, {
  type IdentifierPresenter,
  type Presenter,
  type TitlePresenter,
  type UrlPresenter
} from '@hcengineering/server-activity'
import { TClass } from '@hcengineering/model-core'
import activity from '@hcengineering/activity'
import notification from '@hcengineering/notification'
import card from '@hcengineering/card'
import type { Resource } from '@hcengineering/platform'

export { activityServerOperation } from './migration'
export { serverActivityId } from '@hcengineering/server-activity'

@Mixin(serverActivity.mixin.TitlePresenter, core.class.Class)
export class TTitlePresenter extends TClass implements TitlePresenter {
  presenter!: Resource<Presenter>
}

@Mixin(serverActivity.mixin.IdentifierPresenter, core.class.Class)
export class TIdentifierPresenter extends TClass implements IdentifierPresenter {
  presenter!: Resource<Presenter>
}

@Mixin(serverActivity.mixin.UrlPresenter, core.class.Class)
export class TUrlPresenter extends TClass implements UrlPresenter {
  presenter!: Resource<Presenter>
}

export function createModel (builder: Builder): void {
  builder.createModel(TIdentifierPresenter, TUrlPresenter, TTitlePresenter)

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverActivity.trigger.ActivityMessagesHandler,
    txMatch: {
      objectClass: {
        $nin: [
          activity.class.ActivityMessage,
          notification.class.DocNotifyContext,
          notification.class.ActivityInboxNotification,
          notification.class.MentionInboxNotification,
          notification.class.ReactionInboxNotification,
          notification.class.BrowserNotification
        ]
      }
    },
    isAsync: true
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverActivity.trigger.HandleCardActivity,
    isAsync: true,
    txMatch: {
      objectClass: card.class.Card
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverActivity.trigger.OnDocRemoved,
    isAsync: true
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverActivity.trigger.ReferenceTrigger,
    txMatch: {
      objectClass: { $ne: activity.class.ActivityReference },
      attachedToClass: {
        $nin: [
          notification.class.InboxNotification,
          notification.class.DocNotifyContext,
          notification.class.BrowserNotification
        ]
      }
    },
    isAsync: true
  })
}
