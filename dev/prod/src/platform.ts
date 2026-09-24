//
// Copyright © 2022, 2023, 2025 Hardcore Engineering Inc.
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

import platform, { type Plugin, addLocation, addStringsLoader, platformId } from '@hcengineering/platform'

import { activityId } from '@hcengineering/activity'
import aiBot, { aiBotId } from '@hcengineering/ai-bot'
import analyticsCollector, { analyticsCollectorId } from '@hcengineering/analytics-collector'
import { attachmentId } from '@hcengineering/attachment'
import calendar, { calendarId } from '@hcengineering/calendar'
import { cardId } from '@hcengineering/card'
import { chunterId } from '@hcengineering/chunter'
import client, { clientId } from '@hcengineering/client'
import contactPlugin, { contactId } from '@hcengineering/contact'
import { converterId } from '@hcengineering/converter'
import { documentsId } from '@hcengineering/controlled-documents'
import { desktopPreferencesId } from '@hcengineering/desktop-preferences'
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
import love, { loveId } from '@hcengineering/love'
import notification, { notificationId } from '@hcengineering/notification'
import onboard, { onboardId } from '@hcengineering/onboard'
import presence, { presenceId } from '@hcengineering/presence'
import { pulseId } from '@hcengineering/pulse'
import print, { printId } from '@hcengineering/print'
import { processId } from '@hcengineering/process'
import { productsId } from '@hcengineering/products'
import { questionsId } from '@hcengineering/questions'
import { recruitId } from '@hcengineering/recruit'
import rekoni from '@hcengineering/rekoni'
import { requestId } from '@hcengineering/request'
import setting, { settingId } from '@hcengineering/setting'
import sign from '@hcengineering/sign'
import support, { supportId, supportLink, reportBugLink, privacyPolicyLink, defaultSupportEmail } from '@hcengineering/support'
import { surveyId } from '@hcengineering/survey'
import { tagsId } from '@hcengineering/tags'
import { taskId } from '@hcengineering/task'
import telegram, { telegramId } from '@hcengineering/telegram'
import { templatesId } from '@hcengineering/templates'
import { testManagementId } from '@hcengineering/test-management'
import textEditor, { textEditorId } from '@hcengineering/text-editor'
import { timeId } from '@hcengineering/time'
import tracker, { trackerId } from '@hcengineering/tracker'
import { trainingId } from '@hcengineering/training'
import uiPlugin from '@hcengineering/ui/src/plugin'
import { uploaderId } from '@hcengineering/uploader'
import { mediaId } from '@hcengineering/media/src/plugin'
import recorder, { recorderId } from '@hcengineering/recorder'
import { viewId } from '@hcengineering/view'
import workbench, { workbenchId } from '@hcengineering/workbench'
import github, { githubId } from '@hcengineering/github'

import { achievementId } from '@hcengineering/achievement'
import { emojiId } from '@hcengineering/emoji'
import billingPlugin, { billingId } from '@hcengineering/billing'
import admin, { adminId } from '@hcengineering/admin'
import { hulyMailId } from '@hcengineering/huly-mail'
import { aiAssistantId } from '@hcengineering/ai-assistant'
import { ratingId } from '@hcengineering/rating'
import { workflowId } from '@hcengineering/workflow'
import { fetchMetadataLocalStorage } from '@hcengineering/ui'

async function loadAssets(): Promise<void> {

  /* webpackChunkName: "contact" */

  await Promise.all([
    await import(/* webpackChunkName: "assets" */'@hcengineering/activity-assets'),
    // await import(/* webpackChunkName: "assets" */'@hcengineering/analytics-collector-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/attachment-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/calendar-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/card-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/chunter-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/contact-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/controlled-documents-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/desktop-preferences-assets'),
    // await import(/* webpackChunkName: "assets" */'@hcengineering/diffview-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/document-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/drive-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/export-assets'),
    // await import(/* webpackChunkName: "assets" */'@hcengineering/gmail-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/guest-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/global-profile-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/hr-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/inventory-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/lead-assets'),
    // await import(/* webpackChunkName: "assets" */'@hcengineering/login-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/love-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/notification-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/preference-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/print-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/process-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/products-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/questions-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/recruit-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/request-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/setting-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/support-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/survey-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/tags-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/task-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/telegram-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/templates-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/test-management-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/text-editor-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/time-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/tracker-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/training-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/uploader-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/recorder-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/media-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/view-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/workbench-assets'),

    await import(/* webpackChunkName: "assets" */'@hcengineering/mail-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/github-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/achievement-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/emoji-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/billing-assets'),
    // await import(/* webpackChunkName: "assets" */'@hcengineering/huly-mail-assets'),
    // await import(/* webpackChunkName: "assets" */'@hcengineering/ai-assistant-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/rating-assets'),
    await import(/* webpackChunkName: "assets" */'@hcengineering/workflow-assets')]
  )
}

import { concatLink, coreId } from '@hcengineering/core'
import presentation, { loadServerConfig, createFileStorage, presentationId } from '@hcengineering/presentation'

import { setMetadata } from '@hcengineering/platform'
import { initThemeStore, setDefaultLanguage, setForceAccent, type AccentColorType } from '@hcengineering/theme'

import { configureAnalytics } from './analytics'
import { Analytics } from '@hcengineering/analytics'

export interface Config {
  ACCOUNTS_URL: string
  UPLOAD_URL: string
  FILES_URL: string
  DATALAKE_URL?: string
  MODEL_VERSION: string
  VERSION: string
  COLLABORATOR?: string
  REKONI_URL: string
  TELEGRAM_URL: string
  GMAIL_URL: string
  CALENDAR_URL: string
  PUSH_PUBLIC_KEY: string
  APP_PROTOCOL?: string
  GITHUB_APP?: string
  GITHUB_CLIENTID?: string
  GITHUB_URL: string
  LOVE_ENDPOINT?: string
  LIVEKIT_WS?: string
  SIGN_URL?: string
  PRINT_URL?: string
  ANALYTICS_COLLECTOR_URL?: string
  BRANDING_URL?: string
  TELEGRAM_BOT_URL?: string
  AI_URL?: string
  DISABLE_SIGNUP?: string
  HIDE_LOCAL_LOGIN?: string
  LINK_PREVIEW_URL?: string
  PASSWORD_STRICTNESS?: 'very_strict' | 'strict' | 'normal' | 'none'
  // Could be defined for dev environment
  FRONT_URL?: string
  PREVIEW_URL?: string
  STATS_URL?: string
  PRESENCE_URL?: string
  LANDING_URL?: string
  USE_BINARY_PROTOCOL?: boolean | string
  TRANSACTOR_OVERRIDE?: string
  BACKUP_URL?: string
  WEBHOOK_SERVICE_URL?: string
  STREAM_URL?: string
  PUBLIC_SCHEDULE_URL?: string
  CALDAV_SERVER_URL?: string
  EXPORT_URL?: string
  USE_OTP?: string
  BILLING_URL?: string
  PAYMENT_URL?: string
  EXCLUDED_APPLICATIONS_FOR_ANONYMOUS?: string
  HULYLAKE_URL?: string
  DISABLED_FEATURES?: string
  SIGNUP_URL?: string

  DESKTOP_UPDATES_URL?: string
  DESKTOP_UPDATES_CHANNEL?: string
  DESKTOP_UPDATES_CHANNELS?: string

  ACCENT_THEME?: string
  LOGIN_THEME?: string
  COPYRIGHT?: string
  USAGE_URL?: string
  SUPPORT_URL?: string
  LICENSE_URL?: string
  USERAGREEMENT_URL?: string
  CONFIDENTIAL_URL?: string
  SUPPORT_EMAIL?: string
  PERSONAL_DATA_URL?: string
}

export interface Branding {
  title?: string
  links?: Array<{
    rel: string
    href: string
    type?: string
    sizes?: string
  }>
  support?: {
    supportLink?: string
    reportBugLink?: string
    docsLink?: string
    privacyPolicyLink?: string
  }
  languages?: string
  lastNameFirst?: string
  defaultLanguage?: string
  defaultApplication?: string
  defaultSpace?: string
  defaultSpecial?: string
  initWorkspace?: string
}

export type BrandingMap = Record<string, Branding>

const clientType = process.env.CLIENT_TYPE
const configs: Record<string, string> = {
  'dev-production': '/config-dev.json',
  'dev-huly': '/config-huly.json',
  'dev-bold': '/config.json',
  'dev-server': '/config.json',
  'dev-server-test': '/config-test.json',
  'dev-worker': '/config-worker.json',
  'dev-worker-local': '/config-worker-local.json'
}

const PASSWORD_REQUIREMENTS: Record<NonNullable<Config['PASSWORD_STRICTNESS']>, Record<string, number>> = {
  very_strict: {
    MinDigits: 4,
    MinLength: 32,
    MinLowerChars: 4,
    MinSpecialChars: 4,
    MinUpperChars: 4
  },
  strict: {
    MinDigits: 2,
    MinLength: 16,
    MinLowerChars: 2,
    MinSpecialChars: 2,
    MinUpperChars: 2
  },
  normal: {
    MinDigits: 1,
    MinLength: 8,
    MinLowerChars: 1,
    MinSpecialChars: 1,
    MinUpperChars: 1
  },
  none: {
    MinDigits: 0,
    MinLength: 0,
    MinLowerChars: 0,
    MinSpecialChars: 0,
    MinUpperChars: 0
  }
}

import presentationStrings from '@hcengineering/presentation/src/lang'
import textEditorStrings from '@hcengineering/text-editor-assets/lang'
import uiStrings from '@hcengineering/ui/src/lang'
import uploaderStrings from '@hcengineering/uploader-assets/lang'
import recorderStrings from '@hcengineering/recorder-assets/lang'
import mediaStrings from '@hcengineering/media-assets/lang'
import activityStrings from '@hcengineering/activity-assets/lang'
import attachmentStrings from '@hcengineering/attachment-assets/lang'
import aiBotResourcesStrings from '@hcengineering/ai-bot-resources/src/lang'
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
import diffviewStrings from '@hcengineering/diffview-assets/lang'
import documentStrings from '@hcengineering/document-assets/lang'
import timeStrings from '@hcengineering/time-assets/lang'
import githubStrings from '@hcengineering/github-assets/lang'
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

function configureI18n(): void {
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
  uploaderStrings()
  recorderStrings()
  mediaStrings()
  activityStrings()
  attachmentStrings()
  aiBotResourcesStrings()
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
  diffviewStrings()
  documentStrings()
  timeStrings()
  githubStrings()
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

export async function configurePlatform() {
  const config: Config = await loadServerConfig(configs[clientType ?? ''] ?? '/config.json')
  console.log('loading configuration', config)

  if (window.location.pathname === '/') {
    const landingUrl = config.LANDING_URL
    if (landingUrl !== undefined && landingUrl !== '') {
      const lastAccount = fetchMetadataLocalStorage(login.metadata.LastAccount)
      if (lastAccount == null) {
        window.location.href = landingUrl
        await new Promise(() => {})
      }
    }
  }


  setMetadata(platform.metadata.LoadHelper, async (loader) => {
    for (let i = 0; i < 5; i++) {
      try {
        return await loader()
      } catch (err: any) {
        if (err.message.includes('Loading chunk') && i != 4) {
          continue
        }
        Analytics.handleError(err)
        console.error(err)
        location.reload()
      }
    }
  })
  configureI18n()

  const branding: BrandingMap =
    config.BRANDING_URL !== undefined ? await (await fetch(config.BRANDING_URL, { keepalive: true })).json() : {}
  const myBranding = branding[window.location.host] ?? {}

  console.log('loaded branding', myBranding)

  const title = myBranding.title ?? 'Platform'

  // apply branding
  window.document.title = title

  const links = myBranding.links ?? []
  if (links.length > 0) {
    // remove the default favicon
    // it's only needed for Safari which cannot use dynamically added links for favicons
    document.getElementById('default-favicon')?.remove()

    for (const link of links) {
      const htmlLink = document.createElement('link')
      htmlLink.rel = link.rel
      htmlLink.href = link.href

      if (link.type !== undefined) {
        htmlLink.type = link.type
      }

      if (link.sizes !== undefined) {
        htmlLink.setAttribute('sizes', link.sizes)
      }

      document.head.appendChild(htmlLink)
    }
  }

  configureAnalytics(config)
  // tryOpenInDesktopApp(config.APP_PROTOCOL ?? 'huly://')

  setMetadata(login.metadata.AccountsUrl, config.ACCOUNTS_URL)
  setMetadata(login.metadata.DisableSignUp, config.DISABLE_SIGNUP === 'true')
  setMetadata(login.metadata.HideLocalLogin, config.HIDE_LOCAL_LOGIN === 'true')
  setMetadata(login.metadata.LoginTheme, config.LOGIN_THEME ?? 'intabia')


  const updatesUrl = config.DESKTOP_UPDATES_URL
  // NOTE: env format is: default_value;key1:value1;key2:value2...
  const updatesChannels = (config.DESKTOP_UPDATES_CHANNELS ?? config.DESKTOP_UPDATES_CHANNEL ?? 'latest').split(';').map(c => c.trim().split(':'))

  setMetadata(login.metadata.DesktopUpdatesUrl, updatesUrl)
  setMetadata(login.metadata.DesktopUpdatesChannel, updatesChannels)

  setMetadata(login.metadata.Copyright, config.COPYRIGHT ?? login.string.IntabiaFusion)
  setMetadata(login.metadata.UsageUrl, config.USAGE_URL)
  setMetadata(login.metadata.SupportUrl, config.SUPPORT_URL)

  setMetadata(login.metadata.PasswordValidations, PASSWORD_REQUIREMENTS[config.PASSWORD_STRICTNESS ?? 'none'])

  setMetadata(presentation.metadata.UploadURL, config.UPLOAD_URL)
  setMetadata(presentation.metadata.DatalakeUrl, config.DATALAKE_URL)
  setMetadata(
    presentation.metadata.FileStorage,
    createFileStorage(config.UPLOAD_URL, config.DATALAKE_URL, config.HULYLAKE_URL)
  )

  const testingAccentTheme = localStorage.getItem('#testing.accent.theme')

  if (testingAccentTheme != null) {
    setForceAccent(testingAccentTheme as AccentColorType)
  } else if (config.ACCENT_THEME != null && config.ACCENT_THEME.trim() !== '') {
    setForceAccent(config.ACCENT_THEME as AccentColorType)
  }

  setMetadata(platform.metadata.DevModel, false)

  setMetadata(presentation.metadata.FrontUrl, config.FRONT_URL)
  setMetadata(presentation.metadata.PreviewUrl, config.PREVIEW_URL)
  setMetadata(presentation.metadata.StatsUrl, config.STATS_URL)
  setMetadata(presentation.metadata.LinkPreviewUrl, config.LINK_PREVIEW_URL)
  setMetadata(presentation.metadata.UseOTP, config.USE_OTP !== 'false')
  setMetadata(presentation.metadata.SignupUrl, config.SIGNUP_URL ?? 'https://platform.intabia.ru/signup')

  const disabledFeatures = (config.DISABLED_FEATURES ??'').split(',').map(it => it.trim()).filter(it => it.length > 0)
  setMetadata(presentation.metadata.DisabledFeatures, new Set(disabledFeatures))

  setMetadata(recorder.metadata.StreamUrl, config.STREAM_URL)
  setMetadata(textEditor.metadata.Collaborator, config.COLLABORATOR)

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
  setMetadata(analyticsCollector.metadata.EndpointURL, config.ANALYTICS_COLLECTOR_URL)
  setMetadata(aiBot.metadata.EndpointURL, config.AI_URL)

  setMetadata(github.metadata.GithubApplication, config.GITHUB_APP ?? '')
  setMetadata(github.metadata.GithubClientID, config.GITHUB_CLIENTID ?? '')
  setMetadata(github.metadata.GithubURL, config.GITHUB_URL)

  setMetadata(rekoni.metadata.RekoniUrl, config.REKONI_URL)

  setMetadata(uiPlugin.metadata.DefaultApplication, login.component.LoginApp)
  setMetadata(contactPlugin.metadata.LastNameFirst, myBranding.lastNameFirst === 'true')
  setMetadata(love.metadata.ServiceEndpoint, config.LOVE_ENDPOINT)
  setMetadata(love.metadata.WebSocketURL, config.LIVEKIT_WS)
  setMetadata(print.metadata.PrintURL, config.PRINT_URL)
  setMetadata(sign.metadata.SignURL, config.SIGN_URL)
  setMetadata(presence.metadata.PresenceUrl, config.PRESENCE_URL ?? '')
  setMetadata(exportPlugin.metadata.ExportUrl, config.EXPORT_URL ?? '')

  setMetadata(billingPlugin.metadata.BillingURL, config.BILLING_URL ?? '')
  setMetadata(presentation.metadata.PaymentUrl, config.PAYMENT_URL ?? '')

  setMetadata(presentation.metadata.HulylakeUrl, config.HULYLAKE_URL ?? '')

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

  const languages = myBranding.languages
    ? myBranding.languages.split(',').map((l) => l.trim())
    : ['en', 'ru', 'es', 'pt', 'pt-br', 'zh', 'fr', 'cs', 'it', 'de', 'ja', 'tr']

  setMetadata(uiPlugin.metadata.Languages, languages)

  setMetadata(
    uiPlugin.metadata.Routes,
    new Map([
      [workbenchId, workbench.component.WorkbenchApp],
      [loginId, login.component.LoginApp],
      [onboardId, onboard.component.OnboardApp],
      [githubId, github.component.ConnectApp],
      [calendarId, calendar.component.ConnectApp],
      [guestId, guest.component.GuestApp],
      [globalProfileRoute, globalProfile.component.GlobalProfileApp],
      [adminId, admin.component.AdminApp],
      ['themes', workbench.component.Themes],
      ['meetings', love.component.GuestMeetingApp]
    ])
  )

  addLocation(coreId, async () => ({ default: async () => ({}) }))
  addLocation(presentationId, async () => ({ default: async () => ({}) }))

  addLocation(clientId, async () => await import(/* webpackChunkName: "client" */ '@hcengineering/client-resources'))
  addLocation(loginId, async () => await import(/* webpackChunkName: "login" */ '@hcengineering/login-resources'))
  addLocation(adminId, async () => await import(/* webpackChunkName: "admin" */ '@hcengineering/admin-resources'))
  addLocation(onboardId, async () => await import(/* webpackChunkName: "onboard" */ '@hcengineering/onboard-resources'))
  addLocation(
    workbenchId,
    async () => await import(/* webpackChunkName: "workbench" */ '@hcengineering/workbench-resources')
  )
  addLocation(viewId, async () => await import(/* webpackChunkName: "view" */ '@hcengineering/view-resources'))
  addLocation(converterId, async () => await import(/* webpackChunkName: "converter" */ '@hcengineering/converter-resources'))
  addLocation(taskId, async () => await import(/* webpackChunkName: "task" */ '@hcengineering/task-resources'))
  addLocation(contactId, async () => await import(/* webpackChunkName: "contact" */ '@hcengineering/contact-resources'))
  addLocation(chunterId, async () => await import(/* webpackChunkName: "chunter" */ '@hcengineering/chunter-resources'))
  addLocation(recruitId, async () => await import(/* webpackChunkName: "recruit" */ '@hcengineering/recruit-resources'))
  addLocation(
    activityId,
    async () => await import(/* webpackChunkName: "activity" */ '@hcengineering/activity-resources')
  )
  addLocation(settingId, async () => await import(/* webpackChunkName: "setting" */ '@hcengineering/setting-resources'))
  addLocation(leadId, async () => await import(/* webpackChunkName: "lead" */ '@hcengineering/lead-resources'))
  addLocation(
    telegramId,
    async () => await import(/* webpackChunkName: "telegram" */ '@hcengineering/telegram-resources')
  )
  addLocation(
    attachmentId,
    async () => await import(/* webpackChunkName: "attachment" */ '@hcengineering/attachment-resources')
  )
  addLocation(gmailId, async () => await import(/* webpackChunkName: "gmail" */ '@hcengineering/gmail-resources'))
  addLocation(
    imageCropperId,
    async () => await import(/* webpackChunkName: "image-cropper" */ '@hcengineering/image-cropper-resources')
  )
  addLocation(
    inventoryId,
    async () => await import(/* webpackChunkName: "inventory" */ '@hcengineering/inventory-resources')
  )
  addLocation(
    templatesId,
    async () => await import(/* webpackChunkName: "templates" */ '@hcengineering/templates-resources')
  )
  addLocation(
    notificationId,
    async () => await import(/* webpackChunkName: "notification" */ '@hcengineering/notification-resources')
  )
  addLocation(tagsId, async () => await import(/* webpackChunkName: "tags" */ '@hcengineering/tags-resources'))
  addLocation(
    calendarId,
    async () => await import(/* webpackChunkName: "calendar" */ '@hcengineering/calendar-resources')
  )
  addLocation(
    diffviewId,
    async () => await import(/* webpackChunkName: "diffview" */ '@hcengineering/diffview-resources')
  )
  addLocation(timeId, async () => await import(/* webpackChunkName: "time" */ '@hcengineering/time-resources'))
  addLocation(
    desktopPreferencesId,
    async () =>
      await import(/* webpackChunkName: "desktop-preferences" */ '@hcengineering/desktop-preferences-resources')
  )
  addLocation(analyticsCollectorId, async () => await import('@hcengineering/analytics-collector-resources'))
  addLocation(aiBotId, async () => await import('@hcengineering/ai-bot-resources'))

  addLocation(trackerId, async () => await import(/* webpackChunkName: "tracker" */ '@hcengineering/tracker-resources'))
  addLocation(hrId, async () => await import(/* webpackChunkName: "hr" */ '@hcengineering/hr-resources'))
  addLocation(requestId, async () => await import(/* webpackChunkName: "request" */ '@hcengineering/request-resources'))
  addLocation(driveId, async () => await import(/* webpackChunkName: "drive" */ '@hcengineering/drive-resources'))
  addLocation(supportId, async () => await import(/* webpackChunkName: "support" */ '@hcengineering/support-resources'))

  addLocation(
    documentId,
    async () => await import(/* webpackChunkName: "document" */ '@hcengineering/document-resources')
  )
  addLocation(githubId, async () => await import(/* webpackChunkName: "github" */ '@hcengineering/github-resources'))
  addLocation(
    questionsId,
    async () => await import(/* webpackChunkName: "training" */ '@hcengineering/questions-resources')
  )
  addLocation(
    trainingId,
    async () => await import(/* webpackChunkName: "training" */ '@hcengineering/training-resources')
  )
  addLocation(
    productsId,
    async () => await import(/* webpackChunkName: "products" */ '@hcengineering/products-resources')
  )
  addLocation(
    documentsId,
    async () => await import(/* webpackChunkName: "documents" */ '@hcengineering/controlled-documents-resources')
  )
  addLocation(guestId, async () => await import(/* webpackChunkName: "guest" */ '@hcengineering/guest-resources'))
  addLocation(
    globalProfileId,
    async () => await import(/* webpackChunkName: "global-profile" */ '@hcengineering/global-profile-resources')
  )
  addLocation(loveId, async () => await import(/* webpackChunkName: "love" */ '@hcengineering/love-resources'))
  addLocation(printId, async () => await import(/* webpackChunkName: "print" */ '@hcengineering/print-resources'))
  addLocation(exportId, async () => await import(/* webpackChunkName: "export" */ '@hcengineering/export-resources'))
  addLocation(
    textEditorId,
    async () => await import(/* webpackChunkName: "text-editor" */ '@hcengineering/text-editor-resources')
  )
  addLocation(
    uploaderId,
    async () => await import(/* webpackChunkName: "uploader" */ '@hcengineering/uploader-resources')
  )
  addLocation(
    recorderId,
    async () => await import(/* webpackChunkName: "recorder" */ '@hcengineering/recorder-resources')
  )
  addLocation(mediaId, async () => await import(/* webpackChunkName: "media" */ '@hcengineering/media-resources'))

  addLocation(
    testManagementId,
    async () => await import(/* webpackChunkName: "test-management" */ '@hcengineering/test-management-resources')
  )
  addLocation(surveyId, async () => await import(/* webpackChunkName: "survey" */ '@hcengineering/survey-resources'))
  addLocation(
    presenceId,
    async () => await import(/* webpackChunkName: "presence" */ '@hcengineering/presence-resources')
  )
  addLocation(cardId, async () => await import(/* webpackChunkName: "card" */ '@hcengineering/card-resources'))

  addLocation(processId, async () => await import(/* webpackChunkName: "process" */ '@hcengineering/process-resources'))
  addLocation(workflowId, async () => await import(/* webpackChunkName: "workflow" */ '@hcengineering/workflow-resources'))
  addLocation(
    achievementId,
    async () => await import(/* webpackChunkName: "achievement" */ '@hcengineering/achievement-resources')
  )
  addLocation(emojiId, async () => await import(/* webpackChunkName: "emoji" */ '@hcengineering/emoji-resources'))
  if ((config.BILLING_URL ?? '') !== '') {
    addLocation(
      billingId,
      async () => await import(/* webpackChunkName: "billing" */ '@hcengineering/billing-resources')
    )
  }
  addLocation(
    hulyMailId,
    async () => await import(/* webpackChunkName: "hulyMail" */ '@hcengineering/huly-mail-resources')
  )
  addLocation(
    aiAssistantId,
    async () => await import(/* webpackChunkName: "ai-assistant" */ '@hcengineering/ai-assistant-resources')
  )
  addLocation(ratingId, async () => await import(/* webpackChunkName: "rating" */ '@hcengineering/rating-resources'))

  setMetadata(client.metadata.FilterModel, 'ui')
  setMetadata(client.metadata.ExtraFilter, disabledFeatures)
  setMetadata(client.metadata.ExtraPlugins, ['preference' as Plugin, pulseId as Plugin])
  setMetadata(login.metadata.TransactorOverride, config.TRANSACTOR_OVERRIDE)

  // msgpack+snappy by default; localStorage or USE_BINARY_PROTOCOL=false switches json on.
  const binaryOverride = localStorage.getItem(client.metadata.UseBinaryProtocol)
  setMetadata(
    client.metadata.UseBinaryProtocol,
    binaryOverride != null ? binaryOverride === 'true' : String(config.USE_BINARY_PROTOCOL ?? true) !== 'false'
  )

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

  setMetadata(workbench.metadata.DefaultHiddenApplications, ['contact', 'drive'])

  setMetadata(setting.metadata.BackupUrl, config.BACKUP_URL ?? '')
  setMetadata(setting.metadata.WebhookServiceUrl, config.WEBHOOK_SERVICE_URL ?? '')

  await loadAssets()
  initThemeStore()
}
