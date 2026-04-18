//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021 Hardcore Engineering Inc.
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

import attachment from '@intabiafusion/attachment'
import core from '@intabiafusion/core'
import serverAttachment from '@intabiafusion/server-attachment'
import serverCore from '@intabiafusion/server-core'

export { serverAttachmentId } from '@intabiafusion/server-attachment'

export function createModel (builder: Builder): void {
  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverAttachment.trigger.OnAttachmentDelete,
    txMatch: {
      _class: core.class.TxRemoveDoc,
      objectClass: attachment.class.Attachment
    }
  })
}
