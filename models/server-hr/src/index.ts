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
import core from '@intabiafusion/core'
import hr from '@intabiafusion/hr'
import serverCore from '@intabiafusion/server-core'
import serverHr from '@intabiafusion/server-hr'
import serverActivity from '@intabiafusion/server-activity'

export { serverHrId } from '@intabiafusion/server-hr'

export function createModel (builder: Builder): void {
  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverHr.trigger.OnDepartmentStaff,
    txMatch: {
      _class: core.class.TxMixin,
      mixin: hr.mixin.Staff
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverHr.trigger.OnDepartmentRemove,
    txMatch: {
      objectClass: hr.class.Department,
      _class: core.class.TxRemoveDoc
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverHr.trigger.OnEmployee,
    txMatch: {
      _class: core.class.TxMixin,
      mixin: contact.mixin.Employee
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverHr.trigger.OnEmployeeDeactivate,
    isAsync: true,
    txMatch: {
      _class: core.class.TxMixin,
      mixin: contact.mixin.Employee
    }
  })

  builder.mixin(hr.class.Request, core.class.Class, serverActivity.mixin.TitlePresenter, {
    presenter: serverHr.function.RequestTitlePresenter
  })

  builder.mixin(hr.class.PublicHoliday, core.class.Class, serverActivity.mixin.TitlePresenter, {
    presenter: serverHr.function.PublicHolidayTitlePresenter
  })
}
