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

import { type Builder } from '@hcengineering/model'

export { serverLeadId } from '@hcengineering/server-lead'

export function createModel (builder: Builder): void {
  // TODO: FIXME
  // builder.mixin(lead.class.Lead, core.class.Class, serverNotification.mixin.HTMLPresenter, {
  //   presenter: serverLead.function.LeadHTMLPresenter
  // })
  //
  // builder.mixin(lead.class.Lead, core.class.Class, serverNotification.mixin.TextPresenter, {
  //   presenter: serverLead.function.LeadTextPresenter
  // })
  // builder.mixin(
  //   lead.ids.AssigneeNotification,
  //   notification.class.NotificationType,
  //   serverNotification.mixin.TypeMatch,
  //   {
  //     func: serverNotification.function.IsUserEmployeeInFieldValueTypeMatch
  //   }
  // )
}
