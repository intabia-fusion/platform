//
// Copyright © 2022, 2023, 2025 Hardcore Engineering Inc.
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

import platform, { type Plugin, addLocation, addStringsLoader, platformId } from '@intabiafusion/platform'

import { activityId } from '@intabiafusion/activity'
import aiBot, { aiBotId } from '@intabiafusion/ai-bot'
import analyticsCollector, { analyticsCollectorId } from '@intabiafusion/analytics-collector'
import { attachmentId } from '@intabiafusion/attachment'
import calendar, { calendarId } from '@intabiafusion/calendar'
import { cardId } from '@intabiafusion/card'
import { chunterId } from '@intabiafusion/chunter'
import client, { clientId } from '@intabiafusion/client'
import contactPlugin, { contactId } from '@intabiafusion/contact'
import { converterId } from '@intabiafusion/converter'
import { documentsId } from '@intabiafusion/controlled-documents'
import { desktopPreferencesId } from '@intabiafusion/desktop-preferences'
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
import love, { loveId } from '@intabiafusion/love'
import notification, { notificationId } from '@intabiafusion/notification'
import onboard, { onboardId } from '@intabiafusion/onboard'
import presence, { presenceId } from '@intabiafusion/presence'
import { pulseId } from '@intabiafusion/pulse'
import print, { printId } from '@intabiafusion/print'
import { processId } from '@intabiafusion/process'
import { productsId } from '@intabiafusion/products'
import { questionsId } from '@intabiafusion/questions'
import { recruitId } from '@intabiafusion/recruit'
import rekoni from '@intabiafusion/rekoni'
import { requestId } from '@intabiafusion/request'
import setting, { settingId } from '@intabiafusion/setting'
import sign from '@intabiafusion/sign'
import support, { supportId, supportLink, reportBugLink, privacyPolicyLink, defaultSupportEmail } from '@intabiafusion/support'
import { surveyId } from '@intabiafusion/survey'
import { tagsId } from '@intabiafusion/tags'
import { taskId } from '@intabiafusion/task'
import telegram, { telegramId } from '@intabiafusion/telegram'
import { templatesId } from '@intabiafusion/templates'
import { testManagementId } from '@intabiafusion/test-management'
import textEditor, { textEditorId } from '@intabiafusion/text-editor'
import { timeId } from '@intabiafusion/time'
import tracker, { trackerId } from '@intabiafusion/tracker'
import { trainingId } from '@intabiafusion/training'
import uiPlugin from '@intabiafusion/ui/src/plugin'
import { uploaderId } from '@intabiafusion/uploader'
import { mediaId } from '@intabiafusion/media/src/plugin'
import recorder, { recorderId } from '@intabiafusion/recorder'
import { viewId } from '@intabiafusion/view'
import workbench, { workbenchId } from '@intabiafusion/workbench'
import { mailId } from '@intabiafusion/mail'
import { chatId } from '@intabiafusion/chat'
import github, { githubId } from '@intabiafusion/github'
import { inboxId } from '@intabiafusion/inbox'
import { achievementId } from '@intabiafusion/achievement'
import communication, { communicationId } from '@intabiafusion/communication'
import { emojiId } from '@intabiafusion/emoji'
import billingPlugin, { billingId } from '@intabiafusion/billing'
import { hulyMailId } from '@intabiafusion/huly-mail'
import { aiAssistantId } from '@intabiafusion/ai-assistant'
import { ratingId } from '@intabiafusion/rating'
import { fetchMetadataLocalStorage } from '@intabiafusion/ui'

async function loadAssets(): Promise<void> {

  /* webpackChunkName: "contact" */

  await Promise.all([
    await import(/* webpackChunkName: "assets" */'@intabiafusion/activity-assets'),
    // await import(/* webpackChunkName: "assets" */'@intabiafusion/analytics-collector-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/attachment-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/calendar-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/card-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/chunter-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/contact-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/controlled-documents-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/desktop-preferences-assets'),
    // await import(/* webpackChunkName: "assets" */'@intabiafusion/diffview-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/document-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/drive-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/export-assets'),
    // await import(/* webpackChunkName: "assets" */'@intabiafusion/gmail-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/guest-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/global-profile-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/hr-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/inventory-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/lead-assets'),
    // await import(/* webpackChunkName: "assets" */'@intabiafusion/login-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/love-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/notification-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/preference-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/print-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/process-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/products-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/questions-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/recruit-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/request-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/setting-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/support-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/survey-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/tags-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/task-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/telegram-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/templates-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/test-management-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/text-editor-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/time-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/tracker-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/training-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/uploader-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/recorder-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/media-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/view-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/workbench-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/chat-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/inbox-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/mail-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/github-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/achievement-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/communication-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/emoji-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/billing-assets'),
    // await import(/* webpackChunkName: "assets" */'@intabiafusion/huly-mail-assets'),
    // await import(/* webpackChunkName: "assets" */'@intabiafusion/ai-assistant-assets'),
    await import(/* webpackChunkName: "assets" */'@intabiafusion/rating-assets')]
  )
}

import { concatLink, coreId } from '@intabiafusion/core'
import presentation, { loadServerConfig, createFileStorage, presentationId } from '@intabiafusion/presentation'

import { setMetadata } from '@intabiafusion/platform'
import { initThemeStore, setDefaultLanguage, setForceAccent, type AccentColorType } from '@intabiafusion/theme'

import { preferenceId } from '@intabiafusion/preference'
import { uiId } from '@intabiafusion/ui/src/plugin'
import { configureAnalytics } from './analytics'
import { Analytics } from '@intabiafusion/analytics'

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
  USE_BINARY_PROTOCOL?: boolean
  TRANSACTOR_OVERRIDE?: string
  BACKUP_URL?: string
  STREAM_URL?: string
  PUBLIC_SCHEDULE_URL?: string
  CALDAV_SERVER_URL?: string
  EXPORT_URL?: string
  USE_OTP?: string
  COMMUNICATION_API_ENABLED?: string
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

function configureI18n(): void {
  // Add localization
  addStringsLoader(
    platformId,
    async (lang: string) =>
      await import(
        `@intabiafusion/platform/lang/${lang}.json`
      )
  )
  addStringsLoader(
    coreId,
    async (lang: string) =>
      await import(
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
  addStringsLoader(uploaderId, async (lang: string) => await import(`@intabiafusion/uploader-assets/lang/${lang}.json`))
  addStringsLoader(recorderId, async (lang: string) => await import(`@intabiafusion/recorder-assets/lang/${lang}.json`))
  addStringsLoader(mediaId, async (lang: string) => await import(`@intabiafusion/media-assets/lang/${lang}.json`))
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
  addStringsLoader(processId, async (lang: string) => await import(`@intabiafusion/process-assets/lang/${lang}.json`))
  addStringsLoader(
    achievementId,
    async (lang: string) => await import(`@intabiafusion/achievement-assets/lang/${lang}.json`)
  )
  addStringsLoader(
    communicationId,
    async (lang: string) => await import(`@intabiafusion/communication-assets/lang/${lang}.json`)
  )
  addStringsLoader(inboxId, async (lang: string) => await import(`@intabiafusion/inbox-assets/lang/${lang}.json`))
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
      ['themes', workbench.component.Themes],
      ['meetings', love.component.GuestMeetingApp]
    ])
  )

  addLocation(coreId, async () => ({ default: async () => ({}) }))
  addLocation(presentationId, async () => ({ default: async () => ({}) }))

  addLocation(clientId, async () => await import(/* webpackChunkName: "client" */ '@intabiafusion/client-resources'))
  addLocation(loginId, async () => await import(/* webpackChunkName: "login" */ '@intabiafusion/login-resources'))
  addLocation(onboardId, async () => await import(/* webpackChunkName: "onboard" */ '@intabiafusion/onboard-resources'))
  addLocation(
    workbenchId,
    async () => await import(/* webpackChunkName: "workbench" */ '@intabiafusion/workbench-resources')
  )
  addLocation(viewId, async () => await import(/* webpackChunkName: "view" */ '@intabiafusion/view-resources'))
  addLocation(converterId, async () => await import(/* webpackChunkName: "converter" */ '@intabiafusion/converter-resources'))
  addLocation(taskId, async () => await import(/* webpackChunkName: "task" */ '@intabiafusion/task-resources'))
  addLocation(contactId, async () => await import(/* webpackChunkName: "contact" */ '@intabiafusion/contact-resources'))
  addLocation(chunterId, async () => await import(/* webpackChunkName: "chunter" */ '@intabiafusion/chunter-resources'))
  addLocation(recruitId, async () => await import(/* webpackChunkName: "recruit" */ '@intabiafusion/recruit-resources'))
  addLocation(
    activityId,
    async () => await import(/* webpackChunkName: "activity" */ '@intabiafusion/activity-resources')
  )
  addLocation(settingId, async () => await import(/* webpackChunkName: "setting" */ '@intabiafusion/setting-resources'))
  addLocation(leadId, async () => await import(/* webpackChunkName: "lead" */ '@intabiafusion/lead-resources'))
  addLocation(
    telegramId,
    async () => await import(/* webpackChunkName: "telegram" */ '@intabiafusion/telegram-resources')
  )
  addLocation(
    attachmentId,
    async () => await import(/* webpackChunkName: "attachment" */ '@intabiafusion/attachment-resources')
  )
  addLocation(gmailId, async () => await import(/* webpackChunkName: "gmail" */ '@intabiafusion/gmail-resources'))
  addLocation(
    imageCropperId,
    async () => await import(/* webpackChunkName: "image-cropper" */ '@intabiafusion/image-cropper-resources')
  )
  addLocation(
    inventoryId,
    async () => await import(/* webpackChunkName: "inventory" */ '@intabiafusion/inventory-resources')
  )
  addLocation(
    templatesId,
    async () => await import(/* webpackChunkName: "templates" */ '@intabiafusion/templates-resources')
  )
  addLocation(
    notificationId,
    async () => await import(/* webpackChunkName: "notification" */ '@intabiafusion/notification-resources')
  )
  addLocation(tagsId, async () => await import(/* webpackChunkName: "tags" */ '@intabiafusion/tags-resources'))
  addLocation(
    calendarId,
    async () => await import(/* webpackChunkName: "calendar" */ '@intabiafusion/calendar-resources')
  )
  addLocation(
    diffviewId,
    async () => await import(/* webpackChunkName: "diffview" */ '@intabiafusion/diffview-resources')
  )
  addLocation(timeId, async () => await import(/* webpackChunkName: "time" */ '@intabiafusion/time-resources'))
  addLocation(
    desktopPreferencesId,
    async () =>
      await import(/* webpackChunkName: "desktop-preferences" */ '@intabiafusion/desktop-preferences-resources')
  )
  addLocation(analyticsCollectorId, async () => await import('@intabiafusion/analytics-collector-resources'))
  addLocation(aiBotId, async () => await import('@intabiafusion/ai-bot-resources'))

  addLocation(trackerId, async () => await import(/* webpackChunkName: "tracker" */ '@intabiafusion/tracker-resources'))
  addLocation(hrId, async () => await import(/* webpackChunkName: "hr" */ '@intabiafusion/hr-resources'))
  addLocation(requestId, async () => await import(/* webpackChunkName: "request" */ '@intabiafusion/request-resources'))
  addLocation(driveId, async () => await import(/* webpackChunkName: "drive" */ '@intabiafusion/drive-resources'))
  addLocation(supportId, async () => await import(/* webpackChunkName: "support" */ '@intabiafusion/support-resources'))

  addLocation(
    documentId,
    async () => await import(/* webpackChunkName: "document" */ '@intabiafusion/document-resources')
  )
  addLocation(githubId, async () => await import(/* webpackChunkName: "github" */ '@intabiafusion/github-resources'))
  addLocation(
    questionsId,
    async () => await import(/* webpackChunkName: "training" */ '@intabiafusion/questions-resources')
  )
  addLocation(
    trainingId,
    async () => await import(/* webpackChunkName: "training" */ '@intabiafusion/training-resources')
  )
  addLocation(
    productsId,
    async () => await import(/* webpackChunkName: "products" */ '@intabiafusion/products-resources')
  )
  addLocation(
    documentsId,
    async () => await import(/* webpackChunkName: "documents" */ '@intabiafusion/controlled-documents-resources')
  )
  addLocation(guestId, async () => await import(/* webpackChunkName: "guest" */ '@intabiafusion/guest-resources'))
  addLocation(
    globalProfileId,
    async () => await import(/* webpackChunkName: "global-profile" */ '@intabiafusion/global-profile-resources')
  )
  addLocation(loveId, async () => await import(/* webpackChunkName: "love" */ '@intabiafusion/love-resources'))
  addLocation(printId, async () => await import(/* webpackChunkName: "print" */ '@intabiafusion/print-resources'))
  addLocation(exportId, async () => await import(/* webpackChunkName: "export" */ '@intabiafusion/export-resources'))
  addLocation(
    textEditorId,
    async () => await import(/* webpackChunkName: "text-editor" */ '@intabiafusion/text-editor-resources')
  )
  addLocation(
    uploaderId,
    async () => await import(/* webpackChunkName: "uploader" */ '@intabiafusion/uploader-resources')
  )
  addLocation(
    recorderId,
    async () => await import(/* webpackChunkName: "recorder" */ '@intabiafusion/recorder-resources')
  )
  addLocation(mediaId, async () => await import(/* webpackChunkName: "media" */ '@intabiafusion/media-resources'))

  addLocation(
    testManagementId,
    async () => await import(/* webpackChunkName: "test-management" */ '@intabiafusion/test-management-resources')
  )
  addLocation(surveyId, async () => await import(/* webpackChunkName: "survey" */ '@intabiafusion/survey-resources'))
  addLocation(
    presenceId,
    async () => await import(/* webpackChunkName: "presence" */ '@intabiafusion/presence-resources')
  )
  addLocation(cardId, async () => await import(/* webpackChunkName: "card" */ '@intabiafusion/card-resources'))
  addLocation(chatId, async () => await import(/* webpackChunkName: "chat" */ '@intabiafusion/chat-resources'))
  addLocation(processId, async () => await import(/* webpackChunkName: "process" */ '@intabiafusion/process-resources'))
  addLocation(
    achievementId,
    async () => await import(/* webpackChunkName: "achievement" */ '@intabiafusion/achievement-resources')
  )
  addLocation(
    communicationId,
    async () => await import(/* webpackChunkName: "communication" */ '@intabiafusion/communication-resources')
  )
  addLocation(emojiId, async () => await import(/* webpackChunkName: "emoji" */ '@intabiafusion/emoji-resources'))
  if ((config.BILLING_URL ?? '') !== '') {
    addLocation(
      billingId,
      async () => await import(/* webpackChunkName: "billing" */ '@intabiafusion/billing-resources')
    )
  }
  addLocation(
    hulyMailId,
    async () => await import(/* webpackChunkName: "hulyMail" */ '@intabiafusion/huly-mail-resources')
  )
  addLocation(
    aiAssistantId,
    async () => await import(/* webpackChunkName: "ai-assistant" */ '@intabiafusion/ai-assistant-resources')
  )
  addLocation(inboxId, async () => await import(/* webpackChunkName: "inbox" */ '@intabiafusion/inbox-resources'))
  addLocation(ratingId, async () => await import(/* webpackChunkName: "rating" */ '@intabiafusion/rating-resources'))

  setMetadata(client.metadata.FilterModel, 'ui')
  setMetadata(client.metadata.ExtraFilter, disabledFeatures)
  setMetadata(client.metadata.ExtraPlugins, ['preference' as Plugin, pulseId as Plugin])
  setMetadata(login.metadata.TransactorOverride, config.TRANSACTOR_OVERRIDE)

  // Use binary response transfer for faster performance and small transfer sizes.
  const binaryOverride = localStorage.getItem(client.metadata.UseBinaryProtocol)
  setMetadata(
    client.metadata.UseBinaryProtocol,
    binaryOverride != null ? binaryOverride === 'true' : (config.USE_BINARY_PROTOCOL ?? true)
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

  setMetadata(setting.metadata.BackupUrl, config.BACKUP_URL ?? '')

  await loadAssets()
  initThemeStore()
}
