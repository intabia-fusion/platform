//
// Copyright © 2023 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
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
} from '@hcengineering/platform'

import { activityId } from '@hcengineering/activity'
import aiBot, { aiBotId } from '@hcengineering/ai-bot'
import { attachmentId } from '@hcengineering/attachment'
import calendar, { calendarId } from '@hcengineering/calendar'
import { cardId } from '@hcengineering/card'
import { chunterId } from '@hcengineering/chunter'
import client, { clientId } from '@hcengineering/client'
import contactPlugin, { contactId } from '@hcengineering/contact'
import { converterId } from '@hcengineering/converter'
import { documentsId } from '@hcengineering/controlled-documents'
import { desktopPreferencesId } from '@hcengineering/desktop-preferences'
import { desktopDownloadsId } from '@hcengineering/desktop-downloads'
import { diffviewId } from '@hcengineering/diffview'
import { documentId } from '@hcengineering/document'
import { driveId } from '@hcengineering/drive'
import exportPlugin, { exportId } from '@hcengineering/export'
import gmail, { gmailId } from '@hcengineering/gmail'
import globalProfile, { globalProfileId, globalProfileRoute } from '@hcengineering/global-profile'
import guest, { guestId } from '@hcengineering/guest'
import { hrId } from '@hcengineering/hr'
import { imageCropperId } from '@hcengineering/image-cropper'
import { inventoryId } from '@hcengineering/inventory'
import { leadId } from '@hcengineering/lead'
import login, { loginId } from '@hcengineering/login'
import notification, { notificationId } from '@hcengineering/notification'
import onboard, { onboardId } from '@hcengineering/onboard'
import presence, { presenceId } from '@hcengineering/presence'
import { pulseId } from '@hcengineering/pulse'
import { processId } from '@hcengineering/process'
import { productsId } from '@hcengineering/products'
import { questionsId } from '@hcengineering/questions'
import { recruitId } from '@hcengineering/recruit'
import rekoni from '@hcengineering/rekoni'
import { requestId } from '@hcengineering/request'
import setting, { settingId } from '@hcengineering/setting'
import support, {
  supportId,
  supportLink,
  reportBugLink,
  privacyPolicyLink,
  defaultSupportEmail
} from '@hcengineering/support'
import { surveyId } from '@hcengineering/survey'
import { tagsId } from '@hcengineering/tags'
import { taskId } from '@hcengineering/task'
import telegram, { telegramId } from '@hcengineering/telegram'
import { templatesId } from '@hcengineering/templates'
import { testManagementId } from '@hcengineering/test-management'
import { timeId } from '@hcengineering/time'
import tracker, { trackerId } from '@hcengineering/tracker'
import { trainingId } from '@hcengineering/training'
import uiPlugin, { getCurrentLocation, locationStorageKeyId, navigate, setLocationStorageKey } from '@hcengineering/ui'
import { mediaId } from '@hcengineering/media'
import { uploaderId } from '@hcengineering/uploader'
import recorder, { recorderId } from '@hcengineering/recorder'
import { viewId } from '@hcengineering/view'
import workbench, { workbenchId } from '@hcengineering/workbench'

import { achievementId } from '@hcengineering/achievement'
import { emojiId } from '@hcengineering/emoji'
import { hulyMailId } from '@hcengineering/huly-mail'
import { aiAssistantId } from '@hcengineering/ai-assistant'
import { ratingId } from '@hcengineering/rating'
import billingPlugin, { billingId } from '@hcengineering/billing'
import admin, { adminId } from '@hcengineering/admin'

import '@hcengineering/activity-assets'
import '@hcengineering/analytics-collector-assets'
import '@hcengineering/attachment-assets'
import '@hcengineering/calendar-assets'
import '@hcengineering/card-assets'
import '@hcengineering/chunter-assets'
import '@hcengineering/contact-assets'
import '@hcengineering/controlled-documents-assets'
import '@hcengineering/desktop-preferences-assets'
import '@hcengineering/desktop-downloads-assets'
import '@hcengineering/diffview-assets'
import '@hcengineering/document-assets'
import '@hcengineering/drive-assets'
import '@hcengineering/export-assets'
import '@hcengineering/gmail-assets'
import '@hcengineering/guest-assets'
import '@hcengineering/global-profile-assets'
import '@hcengineering/hr-assets'
import '@hcengineering/inventory-assets'
import '@hcengineering/lead-assets'
import '@hcengineering/login-assets'
import '@hcengineering/love-assets'
import '@hcengineering/notification-assets'
import '@hcengineering/preference-assets'
import '@hcengineering/print-assets'
import '@hcengineering/process-assets'
import '@hcengineering/products-assets'
import '@hcengineering/questions-assets'
import '@hcengineering/recruit-assets'
import '@hcengineering/request-assets'
import '@hcengineering/setting-assets'
import '@hcengineering/support-assets'
import '@hcengineering/survey-assets'
import '@hcengineering/tags-assets'
import '@hcengineering/task-assets'
import '@hcengineering/telegram-assets'
import '@hcengineering/templates-assets'
import '@hcengineering/test-management-assets'
import '@hcengineering/text-editor-assets'
import '@hcengineering/time-assets'
import '@hcengineering/tracker-assets'
import '@hcengineering/training-assets'
import '@hcengineering/uploader-assets'
import '@hcengineering/recorder-assets'
import '@hcengineering/view-assets'
import '@hcengineering/workbench-assets'
import '@hcengineering/mail-assets'
import '@hcengineering/achievement-assets'
import '@hcengineering/emoji-assets'
import '@hcengineering/media-assets'
import '@hcengineering/billing-assets'
import '@hcengineering/admin-assets'
import '@hcengineering/huly-mail-assets'
import '@hcengineering/ai-assistant-assets'
import '@hcengineering/rating-assets'
import '@hcengineering/workflow-assets'

import analyticsCollector, { analyticsCollectorId } from '@hcengineering/analytics-collector'
import { concatLink, coreId } from '@hcengineering/core'
import love, { loveId } from '@hcengineering/love'
import presentation, { createFileStorage, presentationId } from '@hcengineering/presentation'
import print, { printId } from '@hcengineering/print'
import sign from '@hcengineering/sign'
import textEditor, { textEditorId } from '@hcengineering/text-editor'
import { workflowId } from '@hcengineering/workflow'

import { AccentColorType, initThemeStore, setDefaultLanguage, setForceAccent } from '@hcengineering/theme'
import { configureNotifications } from './notifications'
import { configureAnalyticsProviders } from '@hcengineering/analytics-providers'
import { Branding, Config } from './types'
import { ipcMainExposed } from './typesUtils'

import github, { githubId } from '@hcengineering/github'
import '@hcengineering/github-assets'

import presentationStrings from '@hcengineering/presentation/src/lang'
import textEditorStrings from '@hcengineering/text-editor-assets/lang'
import uiStrings from '@hcengineering/ui/src/lang'
import mediaStrings from '@hcengineering/media-assets/lang'
import uploaderStrings from '@hcengineering/uploader-assets/lang'
import recorderStrings from '@hcengineering/recorder-assets/lang'
import activityStrings from '@hcengineering/activity-assets/lang'
import attachmentStrings from '@hcengineering/attachment-assets/lang'
import calendarStrings from '@hcengineering/calendar-assets/lang'
import chunterStrings from '@hcengineering/chunter-assets/lang'
import contactStrings from '@hcengineering/contact-assets/lang'
import driveStrings from '@hcengineering/drive-assets/lang'
import gmailStrings from '@hcengineering/gmail-assets/lang'
import hrStrings from '@hcengineering/hr-assets/lang'
import inventoryStrings from '@hcengineering/inventory-assets/lang'
import leadStrings from '@hcengineering/lead-assets/lang'
import loginStrings from '@hcengineering/login-assets/lang'
import notificationStrings from '@hcengineering/notification-assets/lang'
import onboardStrings from '@hcengineering/onboard-assets/lang'
import preferenceStrings from '@hcengineering/preference-assets/lang'
import recruitStrings from '@hcengineering/recruit-assets/lang'
import requestStrings from '@hcengineering/request-assets/lang'
import settingStrings from '@hcengineering/setting-assets/lang'
import supportStrings from '@hcengineering/support-assets/lang'
import tagsStrings from '@hcengineering/tags-assets/lang'
import taskStrings from '@hcengineering/task-assets/lang'
import telegramStrings from '@hcengineering/telegram-assets/lang'
import templatesStrings from '@hcengineering/templates-assets/lang'
import trackerStrings from '@hcengineering/tracker-assets/lang'
import viewStrings from '@hcengineering/view-assets/lang'
import workbenchStrings from '@hcengineering/workbench-assets/lang'
import desktopPreferencesStrings from '@hcengineering/desktop-preferences-assets/lang'
import desktopDownloadsStrings from '@hcengineering/desktop-downloads-assets/lang'
import diffviewStrings from '@hcengineering/diffview-assets/lang'
import documentStrings from '@hcengineering/document-assets/lang'
import timeStrings from '@hcengineering/time-assets/lang'
import githubStrings from '@hcengineering/github-assets/lang'
import aiBotResourcesStrings from '@hcengineering/ai-bot-resources/src/lang'
import controlledDocumentsStrings from '@hcengineering/controlled-documents-assets/lang'
import productsStrings from '@hcengineering/products-assets/lang'
import questionsStrings from '@hcengineering/questions-assets/lang'
import trainingStrings from '@hcengineering/training-assets/lang'
import guestStrings from '@hcengineering/guest-assets/lang'
import globalProfileStrings from '@hcengineering/global-profile-assets/lang'
import loveStrings from '@hcengineering/love-assets/lang'
import printStrings from '@hcengineering/print-assets/lang'
import exportStrings from '@hcengineering/export-assets/lang'
import analyticsCollectorStrings from '@hcengineering/analytics-collector-assets/lang'
import testManagementStrings from '@hcengineering/test-management-assets/lang'
import surveyStrings from '@hcengineering/survey-assets/lang'
import cardStrings from '@hcengineering/card-assets/lang'
import mailStrings from '@hcengineering/mail-assets/lang'
import processStrings from '@hcengineering/process-assets/lang'
import achievementStrings from '@hcengineering/achievement-assets/lang'
import emojiStrings from '@hcengineering/emoji-assets/lang'
import billingStrings from '@hcengineering/billing-assets/lang'
import adminStrings from '@hcengineering/admin-assets/lang'
import hulyMailStrings from '@hcengineering/huly-mail-assets/lang'
import aiAssistantStrings from '@hcengineering/ai-assistant-assets/lang'
import ratingStrings from '@hcengineering/rating-assets/lang'
import workflowStrings from '@hcengineering/workflow-assets/lang'

function configureI18n (): void {
  const platformLangs: Record<string, () => Promise<any>> = {
    cs: async () => await import('@hcengineering/platform/lang/cs.json'),
    de: async () => await import('@hcengineering/platform/lang/de.json'),
    en: async () => await import('@hcengineering/platform/lang/en.json'),
    es: async () => await import('@hcengineering/platform/lang/es.json'),
    fr: async () => await import('@hcengineering/platform/lang/fr.json'),
    it: async () => await import('@hcengineering/platform/lang/it.json'),
    ja: async () => await import('@hcengineering/platform/lang/ja.json'),
    pt: async () => await import('@hcengineering/platform/lang/pt.json'),
    'pt-br': async () => await import('@hcengineering/platform/lang/pt-br.json'),
    ru: async () => await import('@hcengineering/platform/lang/ru.json'),
    tr: async () => await import('@hcengineering/platform/lang/tr.json'),
    zh: async () => await import('@hcengineering/platform/lang/zh.json')
  }
  addStringsLoader(platformId, async (lang: string) => await (platformLangs[lang] ?? platformLangs.en)())

  const coreLangs: Record<string, () => Promise<any>> = {
    cs: async () => await import('@hcengineering/core/lang/cs.json'),
    de: async () => await import('@hcengineering/core/lang/de.json'),
    en: async () => await import('@hcengineering/core/lang/en.json'),
    es: async () => await import('@hcengineering/core/lang/es.json'),
    fr: async () => await import('@hcengineering/core/lang/fr.json'),
    it: async () => await import('@hcengineering/core/lang/it.json'),
    ja: async () => await import('@hcengineering/core/lang/ja.json'),
    pt: async () => await import('@hcengineering/core/lang/pt.json'),
    'pt-br': async () => await import('@hcengineering/core/lang/pt-br.json'),
    ru: async () => await import('@hcengineering/core/lang/ru.json'),
    tr: async () => await import('@hcengineering/core/lang/tr.json'),
    zh: async () => await import('@hcengineering/core/lang/zh.json')
  }
  addStringsLoader(coreId, async (lang: string) => await (coreLangs[lang] ?? coreLangs.en)())
  presentationStrings()
  textEditorStrings()
  uiStrings()
  mediaStrings()
  uploaderStrings()
  recorderStrings()
  activityStrings()
  attachmentStrings()
  calendarStrings()
  chunterStrings()
  contactStrings()
  driveStrings()
  gmailStrings()
  hrStrings()
  inventoryStrings()
  leadStrings()
  loginStrings()
  notificationStrings()
  onboardStrings()
  preferenceStrings()
  recruitStrings()
  requestStrings()
  settingStrings()
  supportStrings()
  tagsStrings()
  taskStrings()
  telegramStrings()
  templatesStrings()
  trackerStrings()
  viewStrings()
  workbenchStrings()
  desktopPreferencesStrings()
  desktopDownloadsStrings()
  diffviewStrings()
  documentStrings()
  timeStrings()
  githubStrings()
  aiBotResourcesStrings()
  controlledDocumentsStrings()
  productsStrings()
  questionsStrings()
  trainingStrings()
  guestStrings()
  globalProfileStrings()
  loveStrings()
  printStrings()
  exportStrings()
  analyticsCollectorStrings()
  testManagementStrings()
  surveyStrings()
  cardStrings()
  mailStrings()
  processStrings()
  achievementStrings()
  emojiStrings()
  billingStrings()
  adminStrings()
  hulyMailStrings()
  aiAssistantStrings()
  ratingStrings()
  workflowStrings()
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

  const title = myBranding.title ?? 'Platform Desktop'
  ipcMain.setTitle(title)

  configureAnalyticsProviders(config)

  setMetadata(login.metadata.AccountsUrl, config.ACCOUNTS_URL)
  setMetadata(login.metadata.DisableSignUp, config.DISABLE_SIGNUP === 'true')
  setMetadata(login.metadata.HideLocalLogin, config.HIDE_LOCAL_LOGIN === 'true')
  setMetadata(login.metadata.LoginTheme, config.LOGIN_THEME ?? 'intabia')

  setMetadata(login.metadata.Copyright, config.COPYRIGHT ?? login.string.IntabiaFusion)
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

  const disabledFeatures = (config.DISABLED_FEATURES ?? '')
    .split(',')
    .map((it) => it.trim())
    .filter((it) => it.length > 0)
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
  setMetadata(login.metadata.LicenseUrl, config.LICENSE_URL ?? `${frontUrl}/legal/license`)
  setMetadata(login.metadata.UserAgreementUrl, config.USERAGREEMENT_URL ?? `${frontUrl}/legal/user-agreement`)
  setMetadata(login.metadata.ConfidentialUrl, config.CONFIDENTIAL_URL ?? `${frontUrl}/legal/confidential`)
  setMetadata(login.metadata.PersonalDataUrl, config.PERSONAL_DATA_URL ?? `${frontUrl}/legal/agreement`)

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
      [globalProfileRoute, globalProfile.component.GlobalProfileApp],
      [adminId, admin.component.AdminApp],
      ['meetings', love.component.GuestMeetingApp]
    ])
  )

  addLocation(coreId, async () => ({ default: async () => ({}) }))
  addLocation(presentationId, async () => ({ default: async () => ({}) }))

  addLocation(clientId, async () => await import('@hcengineering/client-resources'))
  addLocation(loginId, async () => await import('@hcengineering/login-resources'))
  addLocation(adminId, async () => await import('@hcengineering/admin-resources'))
  addLocation(onboardId, async () => await import('@hcengineering/onboard-resources'))
  addLocation(workbenchId, async () => await import('@hcengineering/workbench-resources'))
  addLocation(viewId, async () => await import('@hcengineering/view-resources'))
  addLocation(converterId, async () => await import('@hcengineering/converter-resources'))
  addLocation(taskId, async () => await import('@hcengineering/task-resources'))
  addLocation(contactId, async () => await import('@hcengineering/contact-resources'))
  addLocation(chunterId, async () => await import('@hcengineering/chunter-resources'))
  addLocation(recruitId, async () => await import('@hcengineering/recruit-resources'))
  addLocation(activityId, async () => await import('@hcengineering/activity-resources'))
  addLocation(settingId, async () => await import('@hcengineering/setting-resources'))
  addLocation(leadId, async () => await import('@hcengineering/lead-resources'))
  addLocation(telegramId, async () => await import('@hcengineering/telegram-resources'))
  addLocation(attachmentId, async () => await import('@hcengineering/attachment-resources'))
  addLocation(gmailId, async () => await import('@hcengineering/gmail-resources'))
  addLocation(imageCropperId, async () => await import('@hcengineering/image-cropper-resources'))
  addLocation(inventoryId, async () => await import('@hcengineering/inventory-resources'))
  addLocation(templatesId, async () => await import('@hcengineering/templates-resources'))
  addLocation(notificationId, async () => await import('@hcengineering/notification-resources'))
  addLocation(tagsId, async () => await import('@hcengineering/tags-resources'))
  addLocation(calendarId, async () => await import('@hcengineering/calendar-resources'))
  addLocation(analyticsCollectorId, async () => await import('@hcengineering/analytics-collector-resources'))
  addLocation(aiBotId, async () => await import('@hcengineering/ai-bot-resources'))

  addLocation(trackerId, async () => await import('@hcengineering/tracker-resources'))
  addLocation(hrId, async () => await import('@hcengineering/hr-resources'))
  addLocation(requestId, async () => await import('@hcengineering/request-resources'))
  addLocation(driveId, async () => await import('@hcengineering/drive-resources'))
  addLocation(supportId, async () => await import('@hcengineering/support-resources'))
  addLocation(diffviewId, async () => await import('@hcengineering/diffview-resources'))
  addLocation(documentId, async () => await import('@hcengineering/document-resources'))
  addLocation(timeId, async () => await import('@hcengineering/time-resources'))
  addLocation(questionsId, async () => await import('@hcengineering/questions-resources'))
  addLocation(trainingId, async () => await import('@hcengineering/training-resources'))
  addLocation(productsId, async () => await import('@hcengineering/products-resources'))
  addLocation(documentsId, async () => await import('@hcengineering/controlled-documents-resources'))
  addLocation(mediaId, async () => await import('@hcengineering/media-resources'))
  addLocation(uploaderId, async () => await import('@hcengineering/uploader-resources'))
  addLocation(recorderId, async () => await import('@hcengineering/recorder-resources'))
  addLocation(presenceId, async () => await import('@hcengineering/presence-resources'))
  addLocation(githubId, async () => await import(/* webpackChunkName: "github" */ '@hcengineering/github-resources'))
  addLocation(
    desktopPreferencesId,
    async () =>
      await import(/* webpackChunkName: "desktop-preferences" */ '@hcengineering/desktop-preferences-resources')
  )
  addLocation(
    desktopDownloadsId,
    async () => await import(/* webpackChunkName: "desktop-downloads" */ '@hcengineering/desktop-downloads-resources')
  )
  addLocation(guestId, () => import(/* webpackChunkName: "guest" */ '@hcengineering/guest-resources'))
  addLocation(
    globalProfileId,
    () => import(/* webpackChunkName: "global-profile" */ '@hcengineering/global-profile-resources')
  )
  addLocation(loveId, () => import(/* webpackChunkName: "love" */ '@hcengineering/love-resources'))
  addLocation(printId, () => import(/* webpackChunkName: "print" */ '@hcengineering/print-resources'))
  addLocation(exportId, () => import(/* webpackChunkName: "export" */ '@hcengineering/export-resources'))
  addLocation(textEditorId, () => import(/* webpackChunkName: "text-editor" */ '@hcengineering/text-editor-resources'))
  addLocation(workflowId, () => import(/* webpackChunkName: "workflow" */ '@hcengineering/workflow-resources'))
  addLocation(
    testManagementId,
    () => import(/* webpackChunkName: "test-management" */ '@hcengineering/test-management-resources')
  )
  addLocation(surveyId, () => import(/* webpackChunkName: "survey" */ '@hcengineering/survey-resources'))
  addLocation(cardId, () => import(/* webpackChunkName: "card" */ '@hcengineering/card-resources'))
  addLocation(processId, () => import(/* webpackChunkName: "process" */ '@hcengineering/process-resources'))
  addLocation(achievementId, () => import(/* webpackChunkName: "achievement" */ '@hcengineering/achievement-resources'))

  addLocation(emojiId, () => import(/* webpackChunkName: "achievement" */ '@hcengineering/emoji-resources'))
  if ((config.BILLING_URL ?? '') !== '') {
    addLocation(billingId, () => import(/* webpackChunkName: "billing" */ '@hcengineering/billing-resources'))
  }
  addLocation(hulyMailId, () => import(/* webpackChunkName: "huly-mail" */ '@hcengineering/huly-mail-resources'))
  addLocation(
    aiAssistantId,
    () => import(/* webpackChunkName: "ai-assistant" */ '@hcengineering/ai-assistant-resources')
  )
  addLocation(ratingId, async () => await import(/* webpackChunkName: "rating" */ '@hcengineering/rating-resources'))

  setMetadata(client.metadata.FilterModel, 'ui')
  setMetadata(client.metadata.ExtraFilter, disabledFeatures)
  setMetadata(client.metadata.ExtraPlugins, ['preference' as Plugin, pulseId])

  // msgpack+snappy by default, see connection.ts.
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
  setMetadata(setting.metadata.WebhookServiceUrl, config.WEBHOOK_SERVICE_URL ?? '')

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
