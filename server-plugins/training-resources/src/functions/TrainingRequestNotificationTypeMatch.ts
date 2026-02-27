//
// Copyright © 2024 Hardcore Engineering Inc.
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

import { Doc } from '@hcengineering/core'
import type { NotificationType } from '@hcengineering/notification'
import type { TrainingRequest } from '@hcengineering/training'
import { Receiver, TypeMatchClient, TypeMatchFunc } from '@hcengineering/server-notification'
import training from '@hcengineering/training'
import { DocUpdateMessage } from '@hcengineering/activity'

export const TrainingRequestNotificationTypeMatch: TypeMatchFunc = async (
  _client: TypeMatchClient,
  _type: NotificationType,
  _typeObject: Doc,
  doc: Doc,
  receiver: Receiver
): Promise<boolean> => {
  const message = _typeObject as DocUpdateMessage
  if (message.action === 'create' && message.objectClass === training.class.TrainingRequest) {
    return (doc as TrainingRequest).trainees.includes(receiver.employeeRef)
  }

  if (message.action === 'update' && message.attributeUpdates?.attrKey === 'trainees') {
    return (message.attributeUpdates.added ?? []).includes(receiver.employeeRef)
  }

  return false
}
