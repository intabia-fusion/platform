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

import { prepareTools as prepareToolsRaw } from '@intabiafusion/server-tool'

import { type Data, type Tx, type Version } from '@intabiafusion/core'
import { type MigrateOperation } from '@intabiafusion/model'
import builder, { getModelVersion, migrateOperations } from '@intabiafusion/model-all'
import { devTool } from '.'

import { addLocation } from '@intabiafusion/platform'
import { serverActivityId } from '@intabiafusion/server-activity'
import { serverAiBotId } from '@intabiafusion/server-ai-bot'
import { serverAttachmentId } from '@intabiafusion/server-attachment'
import { serverCalendarId } from '@intabiafusion/server-calendar'
import { serverCardId } from '@intabiafusion/server-card'
import { serverChunterId } from '@intabiafusion/server-chunter'
import { serverCollaborationId } from '@intabiafusion/server-collaboration'
import { serverContactId } from '@intabiafusion/server-contact'
import { serverDocumentId } from '@intabiafusion/server-document'
import { serverDriveId } from '@intabiafusion/server-drive'
import { serverGmailId } from '@intabiafusion/server-gmail'
import { serverGuestId } from '@intabiafusion/server-guest'
import { serverHrId } from '@intabiafusion/server-hr'
import { serverInventoryId } from '@intabiafusion/server-inventory'
import { serverLeadId } from '@intabiafusion/server-lead'
import { serverNotificationId } from '@intabiafusion/server-notification'
import { serverRecruitId } from '@intabiafusion/server-recruit'
import { serverRequestId } from '@intabiafusion/server-request'
import { serverSettingId } from '@intabiafusion/server-setting'
import { serverTagsId } from '@intabiafusion/server-tags'
import { serverTaskId } from '@intabiafusion/server-task'
import { serverTelegramId } from '@intabiafusion/server-telegram'
import { serverTimeId } from '@intabiafusion/server-time'
import { serverTrackerId } from '@intabiafusion/server-tracker'
import { serverViewId } from '@intabiafusion/server-view'

addLocation(serverActivityId, () => import('@intabiafusion/server-activity-resources'))
addLocation(serverAttachmentId, () => import('@intabiafusion/server-attachment-resources'))
addLocation(serverCollaborationId, () => import('@intabiafusion/server-collaboration-resources'))
addLocation(serverContactId, () => import('@intabiafusion/server-contact-resources'))
addLocation(serverNotificationId, () => import('@intabiafusion/server-notification-resources'))
addLocation(serverChunterId, () => import('@intabiafusion/server-chunter-resources'))
addLocation(serverInventoryId, () => import('@intabiafusion/server-inventory-resources'))
addLocation(serverLeadId, () => import('@intabiafusion/server-lead-resources'))
addLocation(serverRecruitId, () => import('@intabiafusion/server-recruit-resources'))
addLocation(serverSettingId, () => import('@intabiafusion/server-setting-resources'))
addLocation(serverTaskId, () => import('@intabiafusion/server-task-resources'))
addLocation(serverTrackerId, () => import('@intabiafusion/server-tracker-resources'))
addLocation(serverTagsId, () => import('@intabiafusion/server-tags-resources'))
addLocation(serverCardId, () => import('@intabiafusion/server-card-resources'))
addLocation(serverCalendarId, () => import('@intabiafusion/server-calendar-resources'))
addLocation(serverGmailId, () => import('@intabiafusion/server-gmail-resources'))
addLocation(serverTelegramId, () => import('@intabiafusion/server-telegram-resources'))
addLocation(serverHrId, () => import('@intabiafusion/server-hr-resources'))
addLocation(serverRequestId, () => import('@intabiafusion/server-request-resources'))
addLocation(serverViewId, () => import('@intabiafusion/server-view-resources'))
addLocation(serverDocumentId, () => import('@intabiafusion/server-document-resources'))
addLocation(serverTimeId, () => import('@intabiafusion/server-time-resources'))
addLocation(serverGuestId, () => import('@intabiafusion/server-guest-resources'))
addLocation(serverDriveId, () => import('@intabiafusion/server-drive-resources'))
addLocation(serverAiBotId, () => import('@intabiafusion/server-ai-bot-resources'))

function prepareTools (): {
  dbUrl: string
  txes: Tx[]
  version: Data<Version>
  migrateOperations: [string, MigrateOperation][]
} {
  return { ...prepareToolsRaw(builder().getTxes()), version: getModelVersion(), migrateOperations }
}

export function getMongoDBUrl (): string {
  const url = process.env.MONGO_URL
  if (url === undefined) {
    console.error('please provide mongo DB URL')
    process.exit(1)
  }
  return url
}

export function getAccountDBUrl (): string {
  const url = process.env.ACCOUNT_DB_URL
  if (url === undefined) {
    console.error('please provide mongo ACCOUNT_DB_URL')
    process.exit(1)
  }
  return url
}

export function getKvsUrl (): string {
  const url = process.env.KVS_URL
  if (url === undefined) {
    console.error('please provide KVS_URL')
    process.exit(1)
  }
  return url
}

devTool(prepareTools)
