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

import core from '@intabiafusion/core'
import { type Builder } from '@intabiafusion/model'
import tracker from '@intabiafusion/model-tracker'
import notification, { type NotificationType } from '@intabiafusion/notification'
import serverCore from '@intabiafusion/server-core'
import serverNotification, { type TypeMatch } from '@intabiafusion/server-notification'
import serverTracker from '@intabiafusion/server-tracker'
import serverView from '@intabiafusion/server-view'
import serverActivity from '@intabiafusion/server-activity'

export { serverTrackerId } from '@intabiafusion/server-tracker'

export function createModel (builder: Builder): void {
  builder.mixin(tracker.class.Issue, core.class.Class, serverActivity.mixin.IdentifierPresenter, {
    presenter: serverTracker.function.IssueIdentifierPresenter
  })

  builder.mixin(tracker.class.Issue, core.class.Class, serverActivity.mixin.UrlPresenter, {
    presenter: serverTracker.function.IssueUrlPresenter
  })

  builder.mixin(tracker.class.Issue, core.class.Class, serverView.mixin.ServerLinkIdProvider, {
    encode: serverTracker.function.IssueLinkIdProvider
  })

  builder.mixin(tracker.class.Issue, core.class.Class, serverCore.mixin.SearchPresenter, {
    iconConfig: {
      component: tracker.component.IssueSearchIcon,
      fields: [['status'], ['space']]
    },
    shortTitle: [['identifier']],
    title: [['title']]
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverTracker.trigger.OnIssueUpdate,
    txMatch: {
      objectClass: { $in: [tracker.class.Issue, tracker.class.TimeSpendReport] }
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverTracker.trigger.OnComponentRemove,
    txMatch: {
      _class: core.class.TxRemoveDoc,
      objectClass: tracker.class.Component
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverTracker.trigger.OnProjectRemove,
    txMatch: {
      _class: core.class.TxRemoveDoc,
      objectClass: tracker.class.Project
    }
  })

  builder.mixin<NotificationType, TypeMatch>(
    tracker.ids.AssigneeNotification,
    notification.class.MessageNotificationType,
    serverNotification.mixin.TypeMatch,
    {
      match: serverNotification.function.IsUserFieldValueTypeMatch
    }
  )
}
