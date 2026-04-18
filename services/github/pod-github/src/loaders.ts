import { coreId } from '@intabiafusion/core'

import { activityId } from '@intabiafusion/activity'
import { attachmentId } from '@intabiafusion/attachment'
import { calendarId } from '@intabiafusion/calendar'
import { chunterId } from '@intabiafusion/chunter'
import { contactId } from '@intabiafusion/contact'
import { driveId } from '@intabiafusion/drive'
import { gmailId } from '@intabiafusion/gmail'
import { hrId } from '@intabiafusion/hr'
import { inventoryId } from '@intabiafusion/inventory'
import { leadId } from '@intabiafusion/lead'
import { loginId } from '@intabiafusion/login'
import { notificationId } from '@intabiafusion/notification'
import { preferenceId } from '@intabiafusion/preference'
import { recruitId } from '@intabiafusion/recruit'
import { requestId } from '@intabiafusion/request'
import { settingId } from '@intabiafusion/setting'
import { supportId } from '@intabiafusion/support'
import { tagsId } from '@intabiafusion/tags'
import { taskId } from '@intabiafusion/task'
import { telegramId } from '@intabiafusion/telegram'
import { templatesId } from '@intabiafusion/templates'
import { trackerId } from '@intabiafusion/tracker'
import { viewId } from '@intabiafusion/view'
import { workbenchId } from '@intabiafusion/workbench'
import { documentId } from '@intabiafusion/document'
import { githubId } from '@intabiafusion/github'

import activityEn from '@intabiafusion/activity-assets/lang/en.json'
import attachmentEn from '@intabiafusion/attachment-assets/lang/en.json'
import calendarEn from '@intabiafusion/calendar-assets/lang/en.json'
import chunterEn from '@intabiafusion/chunter-assets/lang/en.json'
import contactEn from '@intabiafusion/contact-assets/lang/en.json'
import coreEng from '@intabiafusion/core/lang/en.json'
import driveEn from '@intabiafusion/drive-assets/lang/en.json'
import gmailEn from '@intabiafusion/gmail-assets/lang/en.json'
import hrEn from '@intabiafusion/hr-assets/lang/en.json'
import inventoryEn from '@intabiafusion/inventory-assets/lang/en.json'
import leadEn from '@intabiafusion/lead-assets/lang/en.json'
import loginEng from '@intabiafusion/login-assets/lang/en.json'
import platformEng from '@intabiafusion/platform/lang/en.json'
import notificationEn from '@intabiafusion/notification-assets/lang/en.json'
import { addStringsLoader, platformId } from '@intabiafusion/platform'
import preferenceEn from '@intabiafusion/preference-assets/lang/en.json'
import recruitEn from '@intabiafusion/recruit-assets/lang/en.json'
import requestEn from '@intabiafusion/request-assets/lang/en.json'
import settingEn from '@intabiafusion/setting-assets/lang/en.json'
import supportEn from '@intabiafusion/support-assets/lang/en.json'
import tagsEn from '@intabiafusion/tags-assets/lang/en.json'
import taskEn from '@intabiafusion/task-assets/lang/en.json'
import telegramEn from '@intabiafusion/telegram-assets/lang/en.json'
import templatesEn from '@intabiafusion/templates-assets/lang/en.json'
import trackerEn from '@intabiafusion/tracker-assets/lang/en.json'
import viewEn from '@intabiafusion/view-assets/lang/en.json'
import workbenchEn from '@intabiafusion/workbench-assets/lang/en.json'
import documentEn from '@intabiafusion/document-assets/lang/en.json'
import githubEn from '@intabiafusion/github-assets/lang/en.json'

export function registerLoaders (): void {
  addStringsLoader(coreId, async (lang: string) => coreEng)
  addStringsLoader(loginId, async (lang: string) => loginEng)
  addStringsLoader(platformId, async (lang: string) => platformEng)

  addStringsLoader(taskId, async (lang: string) => taskEn)
  addStringsLoader(viewId, async (lang: string) => viewEn)
  addStringsLoader(chunterId, async (lang: string) => chunterEn)
  addStringsLoader(attachmentId, async (lang: string) => attachmentEn)
  addStringsLoader(contactId, async (lang: string) => contactEn)
  addStringsLoader(recruitId, async (lang: string) => recruitEn)
  addStringsLoader(activityId, async (lang: string) => activityEn)
  addStringsLoader(settingId, async (lang: string) => settingEn)
  addStringsLoader(telegramId, async (lang: string) => telegramEn)
  addStringsLoader(leadId, async (lang: string) => leadEn)
  addStringsLoader(gmailId, async (lang: string) => gmailEn)
  addStringsLoader(workbenchId, async (lang: string) => workbenchEn)
  addStringsLoader(inventoryId, async (lang: string) => inventoryEn)
  addStringsLoader(templatesId, async (lang: string) => templatesEn)
  addStringsLoader(notificationId, async (lang: string) => notificationEn)
  addStringsLoader(tagsId, async (lang: string) => tagsEn)
  addStringsLoader(calendarId, async (lang: string) => calendarEn)
  addStringsLoader(trackerId, async (lang: string) => trackerEn)
  addStringsLoader(preferenceId, async (lang: string) => preferenceEn)
  addStringsLoader(hrId, async (lang: string) => hrEn)
  addStringsLoader(documentId, async (lang: string) => documentEn)
  addStringsLoader(requestId, async (lang: string) => requestEn)
  addStringsLoader(supportId, async (lang: string) => supportEn)
  addStringsLoader(githubId, async (lang: string) => githubEn)
  addStringsLoader(driveId, async (lang: string) => driveEn)
}
