//
// Copyright © 2020 Anticrm Platform Contributors.
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

// Import migrate operations.
import { type MigrateOperation } from '@intabiafusion/model'
import { activityOperation } from '@intabiafusion/model-activity'
import { aiBotId, aiBotOperation } from '@intabiafusion/model-ai-bot'
import { attachmentOperation } from '@intabiafusion/model-attachment'
import { calendarOperation } from '@intabiafusion/model-calendar'
import { cardOperation } from '@intabiafusion/model-card'
import { chatId, chatOperation } from '@intabiafusion/model-chat'
import { chunterOperation } from '@intabiafusion/model-chunter'
import { communicationId, communicationOperation } from '@intabiafusion/model-communication'
import { contactOperation } from '@intabiafusion/model-contact'
import { documentsOperation } from '@intabiafusion/model-controlled-documents'
import { coreOperation } from '@intabiafusion/model-core'
import { documentOperation } from '@intabiafusion/model-document'
import { driveOperation } from '@intabiafusion/model-drive'
import { githubOperation, githubOperationPreTime } from '@intabiafusion/model-github'
import { gmailOperation } from '@intabiafusion/model-gmail'
import { guestOperation } from '@intabiafusion/model-guest'
import { hrOperation } from '@intabiafusion/model-hr'
import { inboxId, inboxOperation } from '@intabiafusion/model-inbox'
import { inventoryOperation } from '@intabiafusion/model-inventory'
import { leadOperation } from '@intabiafusion/model-lead'
import { loveId, loveOperation } from '@intabiafusion/model-love'
import { notificationOperation } from '@intabiafusion/model-notification'
import { preferenceOperation } from '@intabiafusion/model-preference'
import { processId, processOperation } from '@intabiafusion/model-process'
import { productsOperation } from '@intabiafusion/model-products'
import { questionsOperation } from '@intabiafusion/model-questions'
import { ratingOperation } from '@intabiafusion/model-rating'
import { recorderId, recorderOperation } from '@intabiafusion/model-recorder'
import { recruitOperation } from '@intabiafusion/model-recruit'
import { requestOperation } from '@intabiafusion/model-request'
import { activityServerOperation } from '@intabiafusion/model-server-activity'
import { settingOperation } from '@intabiafusion/model-setting'
import { surveyOperation } from '@intabiafusion/model-survey'
import { tagsOperation } from '@intabiafusion/model-tags'
import { taskOperation } from '@intabiafusion/model-task'
import { telegramOperation } from '@intabiafusion/model-telegram'
import { templatesOperation } from '@intabiafusion/model-templates'
import { testManagementOperation } from '@intabiafusion/model-test-management'
import { textEditorOperation } from '@intabiafusion/model-text-editor'
import { timeOperation } from '@intabiafusion/model-time'
import { trackerOperation } from '@intabiafusion/model-tracker'
import { trainingOperation } from '@intabiafusion/model-training'
import { viewOperation } from '@intabiafusion/model-view'
import { workbenchOperation } from '@intabiafusion/model-workbench'

export const migrateOperations: [string, MigrateOperation][] = [
  ['core', coreOperation],
  ['rating', ratingOperation],
  ['activity', activityOperation],
  ['card', cardOperation],
  ['contact', contactOperation],
  ['chunter', chunterOperation],
  ['calendar', calendarOperation],
  ['gmail', gmailOperation],
  ['templates', templatesOperation],
  ['telegram', telegramOperation],
  ['task', taskOperation],
  ['attachment', attachmentOperation],
  ['lead', leadOperation],
  ['preference', preferenceOperation],
  ['recruit', recruitOperation],
  ['view', viewOperation],
  ['guest', guestOperation],
  ['tags', tagsOperation],
  ['setting', settingOperation],
  ['tracker', trackerOperation],
  ['documents', documentsOperation],
  ['questions', questionsOperation],
  ['training', trainingOperation],
  ['request', requestOperation],
  ['products', productsOperation],
  ['hr', hrOperation],
  ['document', documentOperation],
  ['drive', driveOperation],
  ['inventiry', inventoryOperation],
  ['github', githubOperation],
  ['pre-time', githubOperationPreTime],
  ['time', timeOperation],
  [loveId, loveOperation],
  ['activityServer', activityServerOperation],
  ['textEditorOperation', textEditorOperation],
  // We should call notification migration after activityServer and chunter
  ['notification', notificationOperation],
  ['workbench', workbenchOperation],
  ['testManagement', testManagementOperation],
  ['survey', surveyOperation],
  [aiBotId, aiBotOperation],
  [chatId, chatOperation],
  [inboxId, inboxOperation],
  [processId, processOperation],
  [communicationId, communicationOperation],
  [recorderId, recorderOperation]
]
