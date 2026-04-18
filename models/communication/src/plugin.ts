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

import { communicationId, type Poll } from '@intabiafusion/communication'
import communication from '@intabiafusion/communication-resources/src/plugin'
import { type Attribute, type Ref } from '@intabiafusion/core'
import {} from '@intabiafusion/ui'
import { mergeIds, type Resource } from '@intabiafusion/platform'
import { type ViewAction } from '@intabiafusion/model-view'
import { type Card } from '@intabiafusion/card'
import { type NotificationGroup } from '@intabiafusion/notification'

export default mergeIds(communicationId, communication, {
  action: {
    Unsubscribe: '' as ViewAction,
    Subscribe: '' as ViewAction
  },
  function: {
    CanSubscribe: '' as Resource<(doc: Card | Card[] | undefined) => Promise<boolean>>,
    CanUnsubscribe: '' as Resource<(doc: Card | Card[] | undefined) => Promise<boolean>>
  },
  ids: {
    UserVotesAttribute: '' as Ref<Attribute<Poll>>,
    DirectNotificationGroup: '' as Ref<NotificationGroup>,
    PollNotificationGroup: '' as Ref<NotificationGroup>
  }
})
