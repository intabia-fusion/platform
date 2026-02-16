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
import core, { Doc, includesAny, Ref, Space } from '@hcengineering/core'
import { MessageNotificationType, NotificationType } from '@hcengineering/notification'
import { TriggerControl } from '@hcengineering/server-core'
import { Receiver, TypeMatchClient, TypeMatchFunc } from '@hcengineering/server-notification'

export const isUserFieldValueTypeMatch: TypeMatchFunc = (
  _client: TypeMatchClient,
  _type: NotificationType,
  _message: Doc,
  doc: Doc,
  receiver: Receiver
): boolean => {
  const type = _type as MessageNotificationType
  if (type.field === undefined) return false
  const value = (doc as any)[type.field]
  if (value == null) return false
  if (value === receiver.employeeRef) return true

  if (Array.isArray(value)) {
    return includesAny(value, receiver.socialIds)
  } else {
    return receiver.socialIds.includes(value)
  }
}

export async function getObjectSpace (control: TriggerControl, doc: Doc, cache: Map<Ref<Doc>, Doc>): Promise<Space> {
  return control.hierarchy.isDerived(doc._class, core.class.Space)
    ? (doc as Space)
    : ((cache.get(doc.space) as Space) ??
        (await control.findAll<Space>(control.ctx, core.class.Space, { _id: doc.space }, { limit: 1 }))[0])
}
