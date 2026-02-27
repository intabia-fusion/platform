//
// Copyright © 2026 Intabia Fusion Inc.
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
import { addLocation } from '@hcengineering/platform'
import { serverNotificationId } from '@hcengineering/server-notification'
import { serverChunterId } from '@hcengineering/server-chunter'
import { serverDocumentsId as serverControlledDocumentsId } from '@hcengineering/server-controlled-documents'
import { serverGmailId } from '@hcengineering/server-gmail'
import { serverTelegramId } from '@hcengineering/server-telegram'
import { serverTrainingId } from '@hcengineering/server-training'
import { serverTimeId } from '@hcengineering/server-time'
import { serverRequestId } from '@hcengineering/server-request'

export function prepare (): void {
  addLocation(serverNotificationId, () => import('@hcengineering/server-notification-resources'))
  addLocation(serverChunterId, () => import('@hcengineering/server-chunter-resources'))
  addLocation(serverControlledDocumentsId, () => import('@hcengineering/server-controlled-documents-resources'))
  addLocation(serverGmailId, () => import('@hcengineering/server-gmail-resources'))
  addLocation(serverTelegramId, () => import('@hcengineering/server-telegram-resources'))
  addLocation(serverTrainingId, () => import('@hcengineering/server-training-resources'))
  addLocation(serverTimeId, () => import('@hcengineering/server-time-resources'))
  addLocation(serverRequestId, () => import('@hcengineering/server-request-resources'))
}
