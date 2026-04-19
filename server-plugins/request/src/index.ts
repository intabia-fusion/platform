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

import { Plugin, plugin, Resource } from '@hcengineering/platform'
import type { TriggerFunc } from '@hcengineering/server-core'
import { CreateNotificationResource, TypeMatchFuncResource } from '@hcengineering/server-notification'
import { Presenter } from '@hcengineering/server-activity'

/**
 * @public
 */
export const serverRequestId = 'server-request' as Plugin

/**
 * @public
 */
export default plugin(serverRequestId, {
  function: {
    RequestTitlePresenter: '' as Resource<Presenter>,
    SendRequestMatch: '' as TypeMatchFuncResource,
    RemoveRequestMatch: '' as TypeMatchFuncResource,
    RemoveRequestCreateNotification: '' as CreateNotificationResource,
    SendRequestCreateNotification: '' as CreateNotificationResource
  },
  trigger: {
    OnRequest: '' as Resource<TriggerFunc>
  }
})
