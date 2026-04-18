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

import core, { coreId, type Data, type PluginConfiguration, type Ref, type Tx, type Version } from '@intabiafusion/core'

import { Builder } from '@intabiafusion/model'
import activity, { activityId, createModel as activityModel } from '@intabiafusion/model-activity'
import { aiBotId, createModel as aiBotModel } from '@intabiafusion/model-ai-bot'
import { attachmentId, createModel as attachmentModel } from '@intabiafusion/model-attachment'
import calendar, { calendarId, createModel as calendarModel } from '@intabiafusion/model-calendar'
import card, { cardId, createModel as cardModel } from '@intabiafusion/model-card'
import chunter, { chunterId, createModel as chunterModel } from '@intabiafusion/model-chunter'
import contact, { contactId, createModel as contactModel } from '@intabiafusion/model-contact'
import { createModel as coreModel } from '@intabiafusion/model-core'
import { desktopDownloadsId, createModel as desktopDownloadsModel } from '@intabiafusion/model-desktop-downloads'
import { desktopPreferencesId, createModel as desktopPreferencesModel } from '@intabiafusion/model-desktop-preferences'
import { driveId, createModel as driveModel } from '@intabiafusion/model-drive'
import gmail, { gmailId, createModel as gmailModel } from '@intabiafusion/model-gmail'
import { guestId, createModel as guestModel } from '@intabiafusion/model-guest'
import hr, { hrId, createModel as hrModel } from '@intabiafusion/model-hr'
import inventory, { inventoryId, createModel as inventoryModel } from '@intabiafusion/model-inventory'
import lead, { leadId, createModel as leadModel } from '@intabiafusion/model-lead'
import { mediaId, createModel as mediaModel } from '@intabiafusion/model-media'
import notification, { notificationId, createModel as notificationModel } from '@intabiafusion/model-notification'
import { preferenceId, createModel as preferenceModel } from '@intabiafusion/model-preference'
import presentation, { presentationId, createModel as presentationModel } from '@intabiafusion/model-presentation'
import rating, { ratingId, createModel as ratingModel } from '@intabiafusion/model-rating'
import { recorderId, createModel as recorderModel } from '@intabiafusion/model-recorder'
import recruit, { recruitId, createModel as recruitModel } from '@intabiafusion/model-recruit'
import { requestId, createModel as requestModel } from '@intabiafusion/model-request'
import { serverActivityId, createModel as serverActivityModel } from '@intabiafusion/model-server-activity'
import { serverAiBotId, createModel as serverAiBotModel } from '@intabiafusion/model-server-ai-bot'
import { serverAttachmentId, createModel as serverAttachmentModel } from '@intabiafusion/model-server-attachment'
import { serverCalendarId, createModel as serverCalendarModel } from '@intabiafusion/model-server-calendar'
import { serverCardId, createModel as serverCardModel } from '@intabiafusion/model-server-card'
import { serverChunterId, createModel as serverChunterModel } from '@intabiafusion/model-server-chunter'
import {
  serverCollaborationId,
  createModel as serverCollaborationModel
} from '@intabiafusion/model-server-collaboration'
import { serverContactId, createModel as serverContactModel } from '@intabiafusion/model-server-contact'
import { serverCoreId, createModel as serverCoreModel } from '@intabiafusion/model-server-core'
import { serverDriveId, createModel as serverDriveModel } from '@intabiafusion/model-server-drive'
import { serverGmailId, createModel as serverGmailModel } from '@intabiafusion/model-server-gmail'
import { serverGuestId, createModel as serverGuestModel } from '@intabiafusion/model-server-guest'
import { serverHrId, createModel as serverHrModel } from '@intabiafusion/model-server-hr'
import { serverInventoryId, createModel as serverInventoryModel } from '@intabiafusion/model-server-inventory'
import { serverLeadId, createModel as serverLeadModel } from '@intabiafusion/model-server-lead'
import { serverNotificationId, createModel as serverNotificationModel } from '@intabiafusion/model-server-notification'
import { serverRecruitId, createModel as serverRecruitModel } from '@intabiafusion/model-server-recruit'
import { serverRequestId, createModel as serverRequestModel } from '@intabiafusion/model-server-request'
import { serverSettingId, createModel as serveSettingModel } from '@intabiafusion/model-server-setting'
import { serverTagsId, createModel as serverTagsModel } from '@intabiafusion/model-server-tags'
import { serverTaskId, createModel as serverTaskModel } from '@intabiafusion/model-server-task'
import { serverTelegramId, createModel as serverTelegramModel } from '@intabiafusion/model-server-telegram'
import { serverTemplatesId, createModel as serverTemplatesModel } from '@intabiafusion/model-server-templates'
import { serverTrackerId, createModel as serverTrackerModel } from '@intabiafusion/model-server-tracker'
import { serverViewId, createModel as serverViewModel } from '@intabiafusion/model-server-view'
import setting, { settingId, createModel as settingModel } from '@intabiafusion/model-setting'
import { supportId, createModel as supportModel } from '@intabiafusion/model-support'
import { tagsId, createModel as tagsModel } from '@intabiafusion/model-tags'
import { taskId, createModel as taskModel } from '@intabiafusion/model-task'
import telegram, { telegramId, createModel as telegramModel } from '@intabiafusion/model-telegram'
import { templatesId, createModel as templatesModel } from '@intabiafusion/model-templates'
import { textEditorId, createModel as textEditorModel } from '@intabiafusion/model-text-editor'
import { timeId, createModel as timeModel } from '@intabiafusion/model-time'
import tracker, { trackerId, createModel as trackerModel } from '@intabiafusion/model-tracker'
import { uploaderId, createModel as uploaderModel } from '@intabiafusion/model-uploader'
import view, { viewId, createModel as viewModel } from '@intabiafusion/model-view'
import workbench, { workbenchId, createModel as workbenchModel } from '@intabiafusion/model-workbench'
import { converterId, createModel as converterModel } from '@intabiafusion/model-converter'

import document, { documentId, createModel as documentModel } from '@intabiafusion/model-document'
import { serverDocumentId, createModel as serverDocumentModel } from '@intabiafusion/model-server-document'

import github, { githubId, createModel as githubModel } from '@intabiafusion/model-github'
import { serverGithubId, createModel as serverGithubModel } from '@intabiafusion/server-github-model'

import { exportId, createModel as exportModel } from '@intabiafusion/model-export'
import love, { loveId, createModel as loveModel } from '@intabiafusion/model-love'
import { printId, createModel as printModel } from '@intabiafusion/model-print'
import { serverLoveId, createModel as serverLoveModel } from '@intabiafusion/model-server-love'
import { serverProcessId, createModel as serverProcessModel } from '@intabiafusion/model-server-process'
import { serverTimeId, createModel as serverTimeModel } from '@intabiafusion/model-server-time'

import aiAssistant, { aiAssistantId, createModel as aiAssistantModel } from '@intabiafusion/model-ai-assistant'
import documents, { documentsId, createModel as documentsModel } from '@intabiafusion/model-controlled-documents'
import { hulyMailId, createModel as hulyMailModel } from '@intabiafusion/model-huly-mail'
import { mailId, createModel as mailModel } from '@intabiafusion/model-mail'
import products, { productsId, createModel as productsModel } from '@intabiafusion/model-products'
import { questionsId, createModel as questionsModel } from '@intabiafusion/model-questions'
import { serverProductsId, createModel as serverProductsModel } from '@intabiafusion/model-server-products'
import { serverTrainingId, createModel as serverTrainingModel } from '@intabiafusion/model-server-training'
import testManagement, {
  testManagementId,
  createModel as testManagementModel
} from '@intabiafusion/model-test-management'
import trainings, { trainingId, createModel as trainingModel } from '@intabiafusion/model-training'

import { achievementId, createModel as achievementModel } from '@intabiafusion/model-achievement'
import { billingId, createModel as billingModel } from '@intabiafusion/model-billing'
import chat, { chatId, createModel as chatModel } from '@intabiafusion/model-chat'
import communication, { communicationId, createModel as communicationModel } from '@intabiafusion/model-communication'
import { emojiId, createModel as emojiModel } from '@intabiafusion/model-emoji'
import { inboxId, createModel as inboxModel } from '@intabiafusion/model-inbox'
import { presenceId, createModel as presenceModel } from '@intabiafusion/model-presence'
import { pulseId, createModel as pulseModel } from '@intabiafusion/model-pulse'
import processes, { processId, createModel as processModel } from '@intabiafusion/model-process'
import {
  serverDocumentsId,
  createModel as serverDocumentsModel
} from '@intabiafusion/model-server-controlled-documents'
import survey, { surveyId, createModel as surveyModel } from '@intabiafusion/model-survey'
import { type Plugin } from '@intabiafusion/platform'

interface ConfigurablePlugin extends Omit<Data<PluginConfiguration>, 'pluginId' | 'transactions'> {}

type BuilderConfig = [(b: Builder) => void, Plugin] | [(b: Builder) => void, Plugin, ConfigurablePlugin | undefined]

export function getModelVersion (): Data<Version> {
  const rawVersion = (process.env.MODEL_VERSION ?? '0.6.0').replace('"', '').trim().replace('v', '').split('.')
  if (rawVersion.length === 3) {
    return {
      major: parseInt(rawVersion[0]),
      minor: parseInt(rawVersion[1]),
      patch: parseInt(rawVersion[2])
    }
  }
  return { major: 0, minor: 6, patch: 0 }
}

export type { MigrateOperation } from '@intabiafusion/model'

/**
 * @public
 * @param enabled - a set of enabled plugins
 * @param disabled  - a set of disabled plugins
 * @returns
 */
export default function buildModel (): Builder {
  const builder = new Builder()

  const defaultFilter = [
    workbench.class.Application,
    presentation.class.ComponentPointExtension,
    presentation.class.ObjectSearchCategory,
    notification.class.NotificationGroup,
    notification.class.NotificationType,
    notification.class.TxNotificationType,
    notification.class.MessageNotificationType,
    view.class.Action,
    contact.class.ChannelProvider,
    setting.class.IntegrationType,
    setting.class.WorkspaceSettingCategory,
    setting.class.SettingsCategory,
    workbench.class.Widget,
    core.class.SpaceTypeDescriptor
  ]

  const defaultMixinFilter = [activity.mixin.ActivityDoc]

  const builders: BuilderConfig[] = [
    [coreModel, coreId],
    [activityModel, activityId],
    [attachmentModel, attachmentId],
    [guestModel, guestId],
    [tagsModel, tagsId],
    [viewModel, viewId],
    [workbenchModel, workbenchId],
    [
      cardModel,
      cardId,
      {
        label: card.string.Cards,
        description: card.string.ConfigDescription,
        enabled: false,
        beta: false,
        icon: card.icon.Card,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      contactModel,
      contactId,
      {
        label: contact.string.ConfigLabel,
        description: contact.string.ConfigDescription,
        enabled: true,
        system: true,
        beta: false,
        icon: contact.icon.ContactApplication,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      chunterModel,
      chunterId,
      {
        label: chunter.string.ConfigLabel,
        description: chunter.string.ConfigDescription,
        enabled: true,
        beta: false,
        icon: chunter.icon.Chunter,
        classFilter: [workbench.class.Application],
        mixinFilter: defaultMixinFilter
      }
    ],
    [taskModel, taskId],
    [
      calendarModel,
      calendarId,
      {
        label: calendar.string.ConfigLabel,
        description: calendar.string.ConfigDescription,
        enabled: true,
        beta: true,
        icon: calendar.icon.Calendar,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      recruitModel,
      recruitId,
      {
        label: recruit.string.ConfigLabel,
        description: recruit.string.ConfigDescription,
        enabled: false,
        beta: false,
        icon: recruit.icon.RecruitApplication,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [settingModel, settingId],
    [
      telegramModel,
      telegramId,
      {
        label: telegram.string.ConfigLabel,
        description: telegram.string.ConfigDescription,
        enabled: true,
        beta: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      leadModel,
      leadId,
      {
        label: lead.string.ConfigLabel,
        description: lead.string.ConfigDescription,
        enabled: false,
        beta: true,
        icon: lead.icon.LeadApplication,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      gmailModel,
      gmailId,
      {
        label: gmail.string.ConfigLabel,
        description: gmail.string.ConfigDescription,
        enabled: false,
        beta: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      inventoryModel,
      inventoryId,
      {
        label: inventory.string.ConfigLabel,
        description: inventory.string.ConfigDescription,
        enabled: false,
        beta: true,
        icon: inventory.icon.InventoryApplication,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [presentationModel, presentationId],
    [templatesModel, templatesId],
    [textEditorModel, textEditorId],
    [uploaderModel, uploaderId],
    [recorderModel, recorderId],
    [mediaModel, mediaId],
    [notificationModel, notificationId],
    [preferenceModel, preferenceId],
    [
      hrModel,
      hrId,
      {
        label: hr.string.ConfigLabel,
        description: hr.string.ConfigDescription,
        enabled: false,
        beta: true,
        icon: hr.icon.Structure,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      trackerModel,
      trackerId,
      {
        label: tracker.string.ConfigLabel,
        description: tracker.string.ConfigDescription,
        enabled: true,
        beta: false,
        icon: tracker.icon.TrackerApplication,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      documentModel,
      documentId,
      {
        label: document.string.ConfigLabel,
        description: document.string.ConfigDescription,
        enabled: true,
        beta: false,
        icon: document.icon.DocumentApplication,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      requestModel,
      requestId,
      {
        label: setting.string.Configure,
        // description: request.string.ConfigDescription,
        enabled: false,
        beta: false,
        hidden: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [timeModel, timeId],
    [supportModel, supportId],
    [desktopPreferencesModel, desktopPreferencesId],
    [desktopDownloadsModel, desktopDownloadsId],

    [
      githubModel,
      githubId,
      {
        label: github.string.ConfigLabel,
        description: github.string.ConfigDescription,
        enabled: false,
        beta: false,
        icon: github.icon.Github,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      loveModel,
      loveId,
      {
        label: love.string.Office,
        description: love.string.LoveDescription,
        enabled: true,
        beta: false,
        icon: love.icon.Love,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [printModel, printId],
    [exportModel, exportId],
    [aiBotModel, aiBotId],
    [
      processModel,
      processId,
      {
        label: processes.string.ConfigLabel,
        description: processes.string.ConfigDescription,
        enabled: false,
        beta: false,
        icon: processes.icon.Process,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [driveModel, driveId],
    [
      documentsModel,
      documentsId,
      {
        label: documents.string.ConfigLabel,
        description: documents.string.ConfigDescription,
        enabled: false,
        beta: false,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      questionsModel,
      questionsId,
      {
        label: setting.string.Configure,
        enabled: false,
        beta: false,
        hidden: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      trainingModel,
      trainingId,
      {
        label: trainings.string.ConfigLabel,
        description: trainings.string.ConfigDescription,
        enabled: false,
        beta: false,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      productsModel,
      productsId,
      {
        label: products.string.ConfigLabel,
        description: products.string.ConfigDescription,
        enabled: false,
        beta: false,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      testManagementModel,
      testManagementId,
      {
        label: testManagement.string.ConfigLabel,
        description: testManagement.string.ConfigDescription,
        enabled: false,
        beta: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      surveyModel,
      surveyId,
      {
        label: survey.string.ConfigLabel,
        description: survey.string.ConfigDescription,
        enabled: false,
        beta: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [presenceModel, presenceId],
    [pulseModel, pulseId],
    [
      chatModel,
      chatId,
      {
        label: chat.string.Chat,
        hidden: true,
        enabled: false,
        beta: true,
        classFilter: [...defaultFilter, card.class.MasterTag, chat.masterTag.Thread],
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      inboxModel,
      inboxId,
      {
        label: setting.string.Configure,
        hidden: true,
        enabled: false,
        beta: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [achievementModel, achievementId],
    [emojiModel, emojiId],
    [
      communicationModel,
      communicationId,
      {
        label: setting.string.Configure,
        hidden: true,
        enabled: false,
        beta: true,
        classFilter: [...defaultFilter, card.class.MasterTag, communication.type.Direct, communication.type.Poll],
        mixinFilter: defaultMixinFilter
      }
    ],
    [mailModel, mailId],
    [
      billingModel,
      billingId,
      {
        label: setting.string.Configure,
        beta: false,
        system: true,
        enabled: true
      }
    ],
    [hulyMailModel, hulyMailId],
    [
      aiAssistantModel,
      aiAssistantId,
      {
        label: aiAssistant.string.ConfigLabel,
        description: aiAssistant.string.ConfigDescription,
        hidden: true,
        enabled: false,
        beta: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [
      ratingModel,
      ratingId,
      {
        label: rating.string.Rating,
        description: rating.string.Rating,
        icon: rating.icon.Rating,
        hidden: false,
        enabled: false,
        beta: true,
        classFilter: defaultFilter,
        mixinFilter: defaultMixinFilter
      }
    ],
    [converterModel, converterId],

    [serverCoreModel, serverCoreId],
    [serverAttachmentModel, serverAttachmentId],
    [serverCollaborationModel, serverCollaborationId],
    [serverContactModel, serverContactId],
    [serveSettingModel, serverSettingId],
    [serverChunterModel, serverChunterId],
    [serverInventoryModel, serverInventoryId],
    [serverLeadModel, serverLeadId],
    [serverTagsModel, serverTagsId],
    [serverTaskModel, serverTaskId],
    [serverTrackerModel, serverTrackerId],
    [serverCardModel, serverCardId],
    [serverCalendarModel, serverCalendarId],
    [serverRecruitModel, serverRecruitId],
    [serverGmailModel, serverGmailId],
    [serverTemplatesModel, serverTemplatesId],
    [serverTelegramModel, serverTelegramId],
    [serverHrModel, serverHrId],
    [serverNotificationModel, serverNotificationId],
    [serverRequestModel, serverRequestId],
    [serverViewModel, serverViewId],
    [serverActivityModel, serverActivityId],
    [serverDocumentModel, serverDocumentId],
    [serverGithubModel, serverGithubId],
    [serverLoveModel, serverLoveId],
    [serverTimeModel, serverTimeId],
    [serverGuestModel, serverGuestId],
    [serverDriveModel, serverDriveId],
    [serverProductsModel, serverProductsId],
    [serverTrainingModel, serverTrainingId],
    [serverDocumentsModel, serverDocumentsId],
    [serverAiBotModel, serverAiBotId],
    [serverProcessModel, serverProcessId]
  ]

  for (const [b, id, config] of builders) {
    const txes: Tx[] = []
    builder.onTx = (tx) => {
      txes.push(tx)
    }
    b(builder)
    builder.createDoc(
      core.class.PluginConfiguration,
      core.space.Model,
      {
        pluginId: id,
        transactions: txes.map((it) => it._id),
        ...config,
        label: config?.label ?? setting.string.Configure,
        hidden: config !== undefined ? config.hidden : true,
        enabled: (config?.enabled ?? true) && !(config?.hidden ?? false),
        beta: config?.beta ?? false
      },
      ('plugin-configuration-' + id) as Ref<PluginConfiguration>
    )
    builder.onTx = undefined
  }

  builder.createDoc(core.class.Version, core.space.Model, getModelVersion(), core.version.Model)
  return builder
}

// Export upgrade procedures
export { migrateOperations } from './migration'
