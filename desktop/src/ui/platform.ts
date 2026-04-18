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

import {
  Plugin,
  addEventListener,
  addLocation,
  addStringsLoader,
  getMetadata,
  platformId,
  setMetadata
} from '@intabiafusion/platform'

import { activityId } from '@intabiafusion/activity'
import aiBot, { aiBotId } from '@intabiafusion/ai-bot'
import { attachmentId } from '@intabiafusion/attachment'
import calendar, { calendarId } from '@intabiafusion/calendar'
import { cardId } from '@intabiafusion/card'
import { chunterId } from '@intabiafusion/chunter'
import client, { clientId } from '@intabiafusion/client'
import contactPlugin, { contactId } from '@intabiafusion/contact'
import { converterId } from '@intabiafusion/converter'
import { documentsId } from '@intabiafusion/controlled-documents'
import { desktopPreferencesId } from '@intabiafusion/desktop-preferences'
import { desktopDownloadsId } from '@intabiafusion/desktop-downloads'
import { diffviewId } from '@intabiafusion/diffview'
import { documentId } from '@intabiafusion/document'
import { driveId } from '@intabiafusion/drive'
import exportPlugin, { exportId } from '@intabiafusion/export'
import gmail, { gmailId } from '@intabiafusion/gmail'
import globalProfile, { globalProfileId, globalProfileRoute } from '@intabiafusion/global-profile'
import guest, { guestId } from '@intabiafusion/guest'
import { hrId } from '@intabiafusion/hr'
import { imageCropperId } from '@intabiafusion/image-cropper'
import { inventoryId } from '@intabiafusion/inventory'
import { leadId } from '@intabiafusion/lead'
import login, { loginId } from '@intabiafusion/login'
import notification, { notificationId } from '@intabiafusion/notification'
import onboard, { onboardId } from '@intabiafusion/onboard'
import presence, { presenceId } from '@intabiafusion/presence'
import { pulseId } from '@intabiafusion/pulse'
import { processId } from '@intabiafusion/process'
import { productsId } from '@intabiafusion/products'
import { questionsId } from '@intabiafusion/questions'
import { recruitId } from '@intabiafusion/recruit'
import rekoni from '@intabiafusion/rekoni'
import { requestId } from '@intabiafusion/request'
import setting, { settingId } from '@intabiafusion/setting'
import support, { supportId, supportLink, reportBugLink, privacyPolicyLink, defaultSupportEmail } from '@intabiafusion/support'
import { surveyId } from '@intabiafusion/survey'
import { tagsId } from '@intabiafusion/tags'
import { taskId } from '@intabiafusion/task'
import telegram, { telegramId } from '@intabiafusion/telegram'
import { templatesId } from '@intabiafusion/templates'
import { testManagementId } from '@intabiafusion/test-management'
import { timeId } from '@intabiafusion/time'
import tracker, { trackerId } from '@intabiafusion/tracker'
import { trainingId } from '@intabiafusion/training'
import uiPlugin, { getCurrentLocation, locationStorageKeyId, navigate, setLocationStorageKey } from '@intabiafusion/ui'
import { mediaId } from '@intabiafusion/media'
import { uploaderId } from '@intabiafusion/uploader'
import recorder, { recorderId } from '@intabiafusion/recorder'
import { viewId } from '@intabiafusion/view'
import workbench, { workbenchId } from '@intabiafusion/workbench'
import { mailId } from '@intabiafusion/mail'
import { chatId } from '@intabiafusion/chat'
import { inboxId } from '@intabiafusion/inbox'
import { achievementId } from '@intabiafusion/achievement'
import communication, { communicationId } from '@intabiafusion/communication'
import { emojiId } from '@intabiafusion/emoji'
import { hulyMailId } from '@intabiafusion/huly-mail'
import { aiAssistantId } from '@intabiafusion/ai-assistant'
import { ratingId } from '@intabiafusion/rating'
import billingPlugin, { billingId } from '@intabiafusion/billing'

import '@intabiafusion/activity-assets'
import '@intabiafusion/analytics-collector-assets'
import '@intabiafusion/attachment-assets'
import '@intabiafusion/calendar-assets'
import '@intabiafusion/card-assets'
import '@intabiafusion/chunter-assets'
import '@intabiafusion/contact-assets'
import '@intabiafusion/controlled-documents-assets'
import '@intabiafusion/desktop-preferences-assets'
import '@intabiafusion/desktop-downloads-assets'
import '@intabiafusion/diffview-assets'
import '@intabiafusion/document-assets'
import '@intabiafusion/drive-assets'
import '@intabiafusion/export-assets'
import '@intabiafusion/gmail-assets'
import '@intabiafusion/guest-assets'
import '@intabiafusion/global-profile-assets'
import '@intabiafusion/hr-assets'
import '@intabiafusion/inventory-assets'
import '@intabiafusion/lead-assets'
import '@intabiafusion/login-assets'
import '@intabiafusion/love-assets'
import '@intabiafusion/notification-assets'
import '@intabiafusion/preference-assets'
import '@intabiafusion/print-assets'
import '@intabiafusion/process-assets'
import '@intabiafusion/products-assets'
import '@intabiafusion/questions-assets'
import '@intabiafusion/recruit-assets'
import '@intabiafusion/request-assets'
import '@intabiafusion/setting-assets'
import '@intabiafusion/support-assets'
import '@intabiafusion/survey-assets'
import '@intabiafusion/tags-assets'
import '@intabiafusion/task-assets'
import '@intabiafusion/telegram-assets'
import '@intabiafusion/templates-assets'
import '@intabiafusion/test-management-assets'
import '@intabiafusion/text-editor-assets'
import '@intabiafusion/time-assets'
import '@intabiafusion/tracker-assets'
import '@intabiafusion/training-assets'
import '@intabiafusion/uploader-assets'
import '@intabiafusion/recorder-assets'
import '@intabiafusion/view-assets'
import '@intabiafusion/workbench-assets'
import '@intabiafusion/mail-assets'
import '@intabiafusion/chat-assets'
import '@intabiafusion/inbox-assets'
import '@intabiafusion/achievement-assets'
import '@intabiafusion/emoji-assets'
import '@intabiafusion/media-assets'
import '@intabiafusion/communication-assets'
import '@intabiafusion/billing-assets'
import '@intabiafusion/huly-mail-assets'
import '@intabiafusion/ai-assistant-assets'
import '@intabiafusion/rating-assets'

import analyticsCollector, { analyticsCollectorId } from '@intabiafusion/analytics-collector'
import { concatLink, coreId } from '@intabiafusion/core'
import love, { loveId } from '@intabiafusion/love'
import presentation, { createFileStorage, presentationId } from '@intabiafusion/presentation'
import print, { printId } from '@intabiafusion/print'
import sign from '@intabiafusion/sign'
import textEditor, { textEditorId } from '@intabiafusion/text-editor'

import { AccentColorType, initThemeStore, setDefaultLanguage, setForceAccent } from '@intabiafusion/theme'
import { configureNotifications } from './notifications'
import { configureAnalyticsProviders } from '@intabiafusion/analytics-providers'
import { Branding, Config } from './types'
import { ipcMainExposed } from './typesUtils'

import github, { githubId } from '@intabiafusion/github'
import '@intabiafusion/github-assets'
import { preferenceId } from '@intabiafusion/preference'
import { uiId } from '@intabiafusion/ui/src/plugin'

function configureI18n (): void {
  // Add localization
  addStringsLoader(
    platformId,
    async (lang: string) =>
      await import(
        /* webpackInclude: /\.json$/ */
        /* webpackMode: "lazy" */
        /* webpackChunkName: "lang-[request]" */
        `@intabiafusion/platform/lang/${lang}.json`
      )
  )
  addStringsLoader(
    coreId,
    async (lang: string) =>
      await import(
        /* webpackInclude: /\.json$/ */
        /* webpackMode: "lazy" */
        /* webpackChunkName: "lang-[request]" */
        `@intabiafusion/core/lang/${lang}.json`
      )
  )
  addStringsLoader(
    presentationId,
    async (lang: string) => await import(`@intabiafusion/presentation/lang/${lang}.json`)
  )
  addStringsLoader(
    textEditorId,
    async (lang: string) => await import(`@intabiafusion/text-editor-assets/lang/${lang}.json`)
  )
  addStringsLoader(uiId, async (lang: string) => await import(`@intabiafusion/ui/lang/${lang}.json`))
  addStringsLoader(mediaId, async (lang: string) => await import(`@intabiafusion/media-assets/lang/${lang}.json`))
  addStringsLoader(uploaderId, async (lang: string) => await import(`@intabiafusion/uploader-assets/lang/${lang}.json`))
  addStringsLoader(recorderId, async (lang: string) => await import(`@intabiafusion/recorder-assets/lang/${lang}.json`))
  addStringsLoader(activityId, async (lang: string) => await import(`@intabiafusion/activity-assets/lang/${lang}.json`))
  addStringsLoader(
    attachmentId,
    async (lang: string) => await import(`@intabiafusion/attachment-assets/lang/${lang}.json`)
  )
  addStringsLoader(calendarId, async (lang: string) => await import(`@intabiafusion/calendar-assets/lang/${lang}.json`))
  addStringsLoader(chunterId, async (lang: string) => await import(`@intabiafusion/chunter-assets/lang/${lang}.json`))
  addStringsLoader(contactId, async (lang: string) => await import(`@intabiafusion/contact-assets/lang/${lang}.json`))
  addStringsLoader(driveId, async (lang: string) => await import(`@intabiafusion/drive-assets/lang/${lang}.json`))
  addStringsLoader(gmailId, async (lang: string) => await import(`@intabiafusion/gmail-assets/lang/${lang}.json`))
  addStringsLoader(hrId, async (lang: string) => await import(`@intabiafusion/hr-assets/lang/${lang}.json`))
  addStringsLoader(
    inventoryId,
    async (lang: string) => await import(`@intabiafusion/inventory-assets/lang/${lang}.json`)
  )
  addStringsLoader(leadId, async (lang: string) => await import(`@intabiafusion/lead-assets/lang/${lang}.json`))
  addStringsLoader(loginId, async (lang: string) => await import(`@intabiafusion/login-assets/lang/${lang}.json`))
  addStringsLoader(
    notificationId,
    async (lang: string) => await import(`@intabiafusion/notification-assets/lang/${lang}.json`)
  )
  addStringsLoader(onboardId, async (lang: string) => await import(`@intabiafusion/onboard-assets/lang/${lang}.json`))
  addStringsLoader(
    preferenceId,
    async (lang: string) => await import(`@intabiafusion/preference-assets/lang/${lang}.json`)
  )
  addStringsLoader(recruitId, async (lang: string) => await import(`@intabiafusion/recruit-assets/lang/${lang}.json`))
  addStringsLoader(requestId, async (lang: string) => await import(`@intabiafusion/request-assets/lang/${lang}.json`))
  addStringsLoader(settingId, async (lang: string) => await import(`@intabiafusion/setting-assets/lang/${lang}.json`))
  addStringsLoader(supportId, async (lang: string) => await import(`@intabiafusion/support-assets/lang/${lang}.json`))
  addStringsLoader(tagsId, async (lang: string) => await import(`@intabiafusion/tags-assets/lang/${lang}.json`))
  addStringsLoader(taskId, async (lang: string) => await import(`@intabiafusion/task-assets/lang/${lang}.json`))
  addStringsLoader(telegramId, async (lang: string) => await import(`@intabiafusion/telegram-assets/lang/${lang}.json`))
  addStringsLoader(
    templatesId,
    async (lang: string) => await import(`@intabiafusion/templates-assets/lang/${lang}.json`)
  )
  addStringsLoader(trackerId, async (lang: string) => await import(`@intabiafusion/tracker-assets/lang/${lang}.json`))
  addStringsLoader(viewId, async (lang: string) => await import(`@intabiafusion/view-assets/lang/${lang}.json`))
  addStringsLoader(
    workbenchId,
    async (lang: string) => await import(`@intabiafusion/workbench-assets/lang/${lang}.json`)
  )

  addStringsLoader(
    desktopPreferencesId,
    async (lang: string) => await import(`@intabiafusion/desktop-preferences-assets/lang/${lang}.json`)
  )
  addStringsLoader(
    desktopDownloadsId,
    async (lang: string) => await import(`@intabiafusion/desktop-downloads-assets/lang/${lang}.json`)
  )
  addStringsLoader(diffviewId, async (lang: string) => await import(`@intabiafusion/diffview-assets/lang/${lang}.json`))
  addStringsLoader(documentId, async (lang: string) => await import(`@intabiafusion/document-assets/lang/${lang}.json`))
  addStringsLoader(timeId, async (lang: string) => await import(`@intabiafusion/time-assets/lang/${lang}.json`))
  addStringsLoader(githubId, async (lang: string) => await import(`@intabiafusion/github-assets/lang/${lang}.json`))
  addStringsLoader(
    documentsId,
    async (lang: string) => await import(`@intabiafusion/controlled-documents-assets/lang/${lang}.json`)
  )
  addStringsLoader(productsId, async (lang: string) => await import(`@intabiafusion/products-assets/lang/${lang}.json`))
  addStringsLoader(
    questionsId,
    async (lang: string) => await import(`@intabiafusion/questions-assets/lang/${lang}.json`)
  )
  addStringsLoader(trainingId, async (lang: string) => await import(`@intabiafusion/training-assets/lang/${lang}.json`))
  addStringsLoader(guestId, async (lang: string) => await import(`@intabiafusion/guest-assets/lang/${lang}.json`))
  addStringsLoader(
    globalProfileId,
    async (lang: string) => await import(`@intabiafusion/global-profile-assets/lang/${lang}.json`)
  )
  addStringsLoader(loveId, async (lang: string) => await import(`@intabiafusion/love-assets/lang/${lang}.json`))
  addStringsLoader(printId, async (lang: string) => await import(`@intabiafusion/print-assets/lang/${lang}.json`))
  addStringsLoader(exportId, async (lang: string) => await import(`@intabiafusion/export-assets/lang/${lang}.json`))
  addStringsLoader(
    analyticsCollectorId,
    async (lang: string) => await import(`@intabiafusion/analytics-collector-assets/lang/${lang}.json`)
  )
  addStringsLoader(
    testManagementId,
    async (lang: string) => await import(`@intabiafusion/test-management-assets/lang/${lang}.json`)
  )
  addStringsLoader(surveyId, async (lang: string) => await import(`@intabiafusion/survey-assets/lang/${lang}.json`))
  addStringsLoader(cardId, async (lang: string) => await import(`@intabiafusion/card-assets/lang/${lang}.json`))
  addStringsLoader(mailId, async (lang: string) => await import(`@intabiafusion/mail-assets/lang/${lang}.json`))
  addStringsLoader(chatId, async (lang: string) => await import(`@intabiafusion/chat-assets/lang/${lang}.json`))
  addStringsLoader(inboxId, async (lang: string) => await import(`@intabiafusion/inbox-assets/lang/${lang}.json`))
  addStringsLoader(processId, async (lang: string) => await import(`@intabiafusion/process-assets/lang/${lang}.json`))
  addStringsLoader(
    achievementId,
    async (lang: string) => await import(`@intabiafusion/achievement-assets/lang/${lang}.json`)
  )
  addStringsLoader(
    communicationId,
    async (lang: string) => await import(`@intabiafusion/communication-assets/lang/${lang}.json`)
  )
  addStringsLoader(emojiId, async (lang: string) => await import(`@intabiafusion/emoji-assets/lang/${lang}.json`))
  addStringsLoader(billingId, async (lang: string) => await import(`@intabiafusion/billing-assets/lang/${lang}.json`))
  addStringsLoader(
    hulyMailId,
    async (lang: string) => await import(`@intabiafusion/huly-mail-assets/lang/${lang}.json`)
  )
  addStringsLoader(
    aiAssistantId,
    async (lang: string) => await import(`@intabiafusion/ai-assistant-assets/lang/${lang}.json`)
  )
  addStringsLoader(ratingId, async (lang: string) => await import(`@intabiafusion/rating-assets/lang/${lang}.json`))
}

export class PlatformBranding {
  constructor (private readonly title: string) {}

  public getTitle (): string {
    return this.title
  }
}

export class PlatformParameters {
  constructor (private readonly branding: PlatformBranding) {}

  public getBranding (): PlatformBranding {
    return this.branding
  }
}

export async function configurePlatform (onWorkbenchConnect?: () => Promise<void>): Promise<PlatformParameters> {
  configureI18n()

  const ipcMain = ipcMainExposed()
  const config: Config = await ipcMain.config()
  const myBranding: Branding = await ipcMain.branding()
  // await (await fetch(devConfig? '/config-dev.json' : '/config.json')).json()
  console.log('loading configuration', config)
  console.log('loaded branding', myBranding)

  const title = myBranding.title ?? 'Huly Desktop'
  ipcMain.setTitle(title)

  configureAnalyticsProviders(config)

  setMetadata(login.metadata.AccountsUrl, config.ACCOUNTS_URL)
  setMetadata(login.metadata.DisableSignUp, config.DISABLE_SIGNUP === 'true')
  setMetadata(login.metadata.HideLocalLogin, config.HIDE_LOCAL_LOGIN === 'true')
  setMetadata(login.metadata.LoginTheme, config.LOGIN_THEME ?? 'intabia')

  setMetadata(presentation.metadata.UploadURL, config.UPLOAD_URL)
  setMetadata(presentation.metadata.UploadURL, config.FILES_URL)
  setMetadata(presentation.metadata.DatalakeUrl, config.DATALAKE_URL ?? '')
  setMetadata(
    presentation.metadata.FileStorage,
    createFileStorage(config.UPLOAD_URL, config.DATALAKE_URL, config.HULYLAKE_URL)
  )
  setMetadata(presentation.metadata.PreviewUrl, config.PREVIEW_URL)
  setMetadata(presentation.metadata.FrontUrl, config.FRONT_URL)
  setMetadata(presentation.metadata.LinkPreviewUrl, config.LINK_PREVIEW_URL ?? '')
  setMetadata(presentation.metadata.UseOTP, config.USE_OTP !== 'false')
  setMetadata(recorder.metadata.StreamUrl, config.STREAM_URL ?? '')
  setMetadata(presentation.metadata.StatsUrl, config.STATS_URL)
  setMetadata(presentation.metadata.HulylakeUrl, config.HULYLAKE_URL ?? '')

  const disabledFeatures = (config.DISABLED_FEATURES ?? '').split(',').map(it => it.trim()).filter(it => it.length > 0)
  setMetadata(presentation.metadata.DisabledFeatures, new Set(disabledFeatures))

  setMetadata(textEditor.metadata.Collaborator, config.COLLABORATOR ?? '')

  setMetadata(github.metadata.GithubApplication, config.GITHUB_APP ?? '')
  setMetadata(github.metadata.GithubClientID, config.GITHUB_CLIENTID ?? '')
  setMetadata(github.metadata.GithubURL, config.GITHUB_URL ?? '')

  const testingAccentTheme = localStorage.getItem('#testing.accent.theme')

  if (testingAccentTheme != null) {
    setForceAccent(testingAccentTheme as AccentColorType)
  } else if (config.ACCENT_THEME != null && config.ACCENT_THEME.trim() !== '') {
    setForceAccent(config.ACCENT_THEME as AccentColorType)
  }

  setMetadata(communication.metadata.Enabled, config.COMMUNICATION_API_ENABLED === 'true')

  if (config.MODEL_VERSION != null) {
    console.log('Minimal Model version requirement', config.MODEL_VERSION)
    setMetadata(presentation.metadata.ModelVersion, config.MODEL_VERSION)
  }
  if (config.VERSION != null) {
    console.log('Minimal version requirement', config.VERSION)
    setMetadata(presentation.metadata.FrontVersion, config.VERSION)
  }
  setMetadata(telegram.metadata.TelegramURL, config.TELEGRAM_URL ?? 'http://localhost:8086')
  setMetadata(telegram.metadata.BotUrl, config.TELEGRAM_BOT_URL)
  setMetadata(gmail.metadata.GmailURL, config.GMAIL_URL ?? 'http://localhost:8087')
  setMetadata(calendar.metadata.CalendarServiceURL, config.CALENDAR_URL ?? 'http://localhost:8095')
  setMetadata(calendar.metadata.PublicScheduleURL, config.PUBLIC_SCHEDULE_URL)
  setMetadata(calendar.metadata.CalDavServerURL, config.CALDAV_SERVER_URL)
  setMetadata(notification.metadata.PushPublicKey, config.PUSH_PUBLIC_KEY)

  setMetadata(rekoni.metadata.RekoniUrl, config.REKONI_URL)
  setMetadata(contactPlugin.metadata.LastNameFirst, myBranding.lastNameFirst === 'true')
  setMetadata(love.metadata.ServiceEndpoint, config.LOVE_ENDPOINT)
  setMetadata(love.metadata.WebSocketURL, config.LIVEKIT_WS)
  setMetadata(print.metadata.PrintURL, config.PRINT_URL)
  setMetadata(sign.metadata.SignURL, config.SIGN_URL)
  setMetadata(uiPlugin.metadata.DefaultApplication, login.component.LoginApp)
  setMetadata(analyticsCollector.metadata.EndpointURL, config.ANALYTICS_COLLECTOR_URL)
  setMetadata(aiBot.metadata.EndpointURL, config.AI_URL)
  setMetadata(presence.metadata.PresenceUrl, config.PRESENCE_URL ?? '')
  setMetadata(exportPlugin.metadata.ExportUrl, config.EXPORT_URL ?? '')

  setMetadata(billingPlugin.metadata.BillingURL, config.BILLING_URL ?? '')
  setMetadata(presentation.metadata.PaymentUrl, config.PAYMENT_URL ?? '')
  setMetadata(presentation.metadata.SignupUrl, config.SIGNUP_URL ?? 'https://huly.io/signup')

  setMetadata(support.metadata.SupportLink, myBranding.support?.supportLink ?? supportLink)
  setMetadata(support.metadata.ReportBugLink, myBranding.support?.reportBugLink ?? reportBugLink)

  const frontUrl = config.FRONT_URL ?? window.location.origin
  setMetadata(support.metadata.DocsLink, myBranding.support?.docsLink ?? concatLink(frontUrl, 'docs'))

  setMetadata(support.metadata.PrivacyPolicyLink, myBranding.support?.privacyPolicyLink ?? privacyPolicyLink)
  setMetadata(support.metadata.SupportEmail, config.SUPPORT_EMAIL ?? defaultSupportEmail)

  const languages =
    myBranding.languages !== undefined && myBranding.languages !== ''
      ? myBranding.languages.split(',').map((l) => l.trim())
      : ['en', 'ru', 'es', 'pt', 'pt-br', 'zh', 'fr', 'cs', 'it', 'de', 'ja', 'tr']

  setMetadata(uiPlugin.metadata.Languages, languages)

  setMetadata(
    uiPlugin.metadata.Routes,
    new Map([
      [workbenchId, workbench.component.WorkbenchApp],
      [loginId, login.component.LoginApp],
      [onboardId, onboard.component.OnboardApp],
      [calendarId, calendar.component.ConnectApp],
      [guestId, guest.component.GuestApp],
      [globalProfileRoute, globalProfile.component.GlobalProfileApp]
    ])
  )

  addLocation(coreId, async () => ({ default: async () => ({}) }))
  addLocation(presentationId, async () => ({ default: async () => ({}) }))

  addLocation(clientId, async () => await import('@intabiafusion/client-resources'))
  addLocation(loginId, async () => await import('@intabiafusion/login-resources'))
  addLocation(onboardId, async () => await import('@intabiafusion/onboard-resources'))
  addLocation(workbenchId, async () => await import('@intabiafusion/workbench-resources'))
  addLocation(viewId, async () => await import('@intabiafusion/view-resources'))
  addLocation(converterId, async () => await import('@intabiafusion/converter-resources'))
  addLocation(taskId, async () => await import('@intabiafusion/task-resources'))
  addLocation(contactId, async () => await import('@intabiafusion/contact-resources'))
  addLocation(chunterId, async () => await import('@intabiafusion/chunter-resources'))
  addLocation(recruitId, async () => await import('@intabiafusion/recruit-resources'))
  addLocation(activityId, async () => await import('@intabiafusion/activity-resources'))
  addLocation(settingId, async () => await import('@intabiafusion/setting-resources'))
  addLocation(leadId, async () => await import('@intabiafusion/lead-resources'))
  addLocation(telegramId, async () => await import('@intabiafusion/telegram-resources'))
  addLocation(attachmentId, async () => await import('@intabiafusion/attachment-resources'))
  addLocation(gmailId, async () => await import('@intabiafusion/gmail-resources'))
  addLocation(imageCropperId, async () => await import('@intabiafusion/image-cropper-resources'))
  addLocation(inventoryId, async () => await import('@intabiafusion/inventory-resources'))
  addLocation(templatesId, async () => await import('@intabiafusion/templates-resources'))
  addLocation(notificationId, async () => await import('@intabiafusion/notification-resources'))
  addLocation(tagsId, async () => await import('@intabiafusion/tags-resources'))
  addLocation(calendarId, async () => await import('@intabiafusion/calendar-resources'))
  addLocation(analyticsCollectorId, async () => await import('@intabiafusion/analytics-collector-resources'))
  addLocation(aiBotId, async () => await import('@intabiafusion/ai-bot-resources'))

  addLocation(trackerId, async () => await import('@intabiafusion/tracker-resources'))
  addLocation(hrId, async () => await import('@intabiafusion/hr-resources'))
  addLocation(requestId, async () => await import('@intabiafusion/request-resources'))
  addLocation(driveId, async () => await import('@intabiafusion/drive-resources'))
  addLocation(supportId, async () => await import('@intabiafusion/support-resources'))
  addLocation(diffviewId, async () => await import('@intabiafusion/diffview-resources'))
  addLocation(documentId, async () => await import('@intabiafusion/document-resources'))
  addLocation(timeId, async () => await import('@intabiafusion/time-resources'))
  addLocation(questionsId, async () => await import('@intabiafusion/questions-resources'))
  addLocation(trainingId, async () => await import('@intabiafusion/training-resources'))
  addLocation(productsId, async () => await import('@intabiafusion/products-resources'))
  addLocation(documentsId, async () => await import('@intabiafusion/controlled-documents-resources'))
  addLocation(mediaId, async () => await import('@intabiafusion/media-resources'))
  addLocation(uploaderId, async () => await import('@intabiafusion/uploader-resources'))
  addLocation(recorderId, async () => await import('@intabiafusion/recorder-resources'))
  addLocation(presenceId, async () => await import('@intabiafusion/presence-resources'))
  addLocation(githubId, async () => await import(/* webpackChunkName: "github" */ '@intabiafusion/github-resources'))
  addLocation(
    desktopPreferencesId,
    async () =>
      await import(/* webpackChunkName: "desktop-preferences" */ '@intabiafusion/desktop-preferences-resources')
  )
  addLocation(
    desktopDownloadsId,
    async () => await import(/* webpackChunkName: "desktop-downloads" */ '@intabiafusion/desktop-downloads-resources')
  )
  addLocation(guestId, () => import(/* webpackChunkName: "guest" */ '@intabiafusion/guest-resources'))
  addLocation(
    globalProfileId,
    () => import(/* webpackChunkName: "global-profile" */ '@intabiafusion/global-profile-resources')
  )
  addLocation(loveId, () => import(/* webpackChunkName: "love" */ '@intabiafusion/love-resources'))
  addLocation(printId, () => import(/* webpackChunkName: "print" */ '@intabiafusion/print-resources'))
  addLocation(exportId, () => import(/* webpackChunkName: "export" */ '@intabiafusion/export-resources'))
  addLocation(textEditorId, () => import(/* webpackChunkName: "text-editor" */ '@intabiafusion/text-editor-resources'))
  addLocation(
    testManagementId,
    () => import(/* webpackChunkName: "test-management" */ '@intabiafusion/test-management-resources')
  )
  addLocation(surveyId, () => import(/* webpackChunkName: "survey" */ '@intabiafusion/survey-resources'))
  addLocation(cardId, () => import(/* webpackChunkName: "card" */ '@intabiafusion/card-resources'))
  addLocation(chatId, () => import(/* webpackChunkName: "chat" */ '@intabiafusion/chat-resources'))
  addLocation(inboxId, () => import(/* webpackChunkName: "inbox" */ '@intabiafusion/inbox-resources'))
  addLocation(processId, () => import(/* webpackChunkName: "process" */ '@intabiafusion/process-resources'))
  addLocation(achievementId, () => import(/* webpackChunkName: "achievement" */ '@intabiafusion/achievement-resources'))
  addLocation(
    communicationId,
    () => import(/* webpackChunkName: "communication" */ '@intabiafusion/communication-resources')
  )
  addLocation(emojiId, () => import(/* webpackChunkName: "achievement" */ '@intabiafusion/emoji-resources'))
  if ((config.BILLING_URL ?? '') !== '') {
    addLocation(billingId, () => import(/* webpackChunkName: "billing" */ '@intabiafusion/billing-resources'))
  }
  addLocation(hulyMailId, () => import(/* webpackChunkName: "huly-mail" */ '@intabiafusion/huly-mail-resources'))
  addLocation(
    aiAssistantId,
    () => import(/* webpackChunkName: "ai-assistant" */ '@intabiafusion/ai-assistant-resources')
  )
  addLocation(ratingId, async () => await import(/* webpackChunkName: "rating" */ '@intabiafusion/rating-resources'))

  setMetadata(client.metadata.FilterModel, 'ui')
  setMetadata(client.metadata.ExtraFilter, disabledFeatures)
  setMetadata(client.metadata.ExtraPlugins, ['preference' as Plugin, pulseId as Plugin])

  // Use binary response transfer for faster performance and small transfer sizes.
  setMetadata(client.metadata.UseBinaryProtocol, true)
  // Disable for now, since it causes performance issues on linux/docker/kubernetes boxes for now.
  setMetadata(client.metadata.UseProtocolCompression, true)

  setMetadata(uiPlugin.metadata.PlatformTitle, title)
  setMetadata(workbench.metadata.PlatformTitle, title)
  setDefaultLanguage(myBranding.defaultLanguage ?? 'en')
  setMetadata(workbench.metadata.DefaultApplication, myBranding.defaultApplication ?? 'tracker')
  setMetadata(workbench.metadata.DefaultSpace, myBranding.defaultSpace ?? tracker.project.DefaultProject)
  setMetadata(workbench.metadata.DefaultSpecial, myBranding.defaultSpecial ?? 'issues')

  try {
    const parsed = JSON.parse(config.EXCLUDED_APPLICATIONS_FOR_ANONYMOUS ?? '')
    setMetadata(workbench.metadata.ExcludedApplicationsForAnonymous, Array.isArray(parsed) ? parsed : [])
  } catch (err) {
    setMetadata(workbench.metadata.ExcludedApplicationsForAnonymous, [])
  }

  initThemeStore()

  addEventListener(workbench.event.NotifyConnection, async () => {
    await ipcMain.setFrontCookie(
      config.FRONT_URL,
      presentation.metadata.Token.replaceAll(':', '-'),
      getMetadata(presentation.metadata.Token) ?? ''
    )
    await onWorkbenchConnect?.()
  })

  configureNotifications()

  setMetadata(setting.metadata.BackupUrl, config.BACKUP_URL ?? '')

  if (config.INITIAL_URL !== '') {
    setLocationStorageKey('uberflow_child')
  }

  const last = localStorage.getItem(locationStorageKeyId)

  if (config.INITIAL_URL !== '') {
    console.log('NAVIGATE', config.INITIAL_URL, getCurrentLocation())
    // NavigationExpandedDefault=false fills buggy:
    // — Navigator closes in unpredictable way
    // — Many sections of the have have no default central content so without
    // navigator is looks like something is broken
    // Should consifer if we want to fix this
    // setMetadata(workbench.metadata.NavigationExpandedDefault, false)
    navigate({
      path: config.INITIAL_URL.split('/')
    })
  } else if (last !== null) {
    navigate(JSON.parse(last))
  } else {
    navigate({ path: [] })
  }

  console.log('Initial location is: ', getCurrentLocation())

  return new PlatformParameters(new PlatformBranding(title))
}
