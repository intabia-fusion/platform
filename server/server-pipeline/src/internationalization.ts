import { coreId } from '@hcengineering/core'
import { addStringsLoader, platformId } from '@hcengineering/platform'
import loginStrings from '@hcengineering/login-assets/lang'
import activityStrings from '@hcengineering/activity-assets/lang'
import attachmentStrings from '@hcengineering/attachment-assets/lang'
import calendarStrings from '@hcengineering/calendar-assets/lang'
import chunterStrings from '@hcengineering/chunter-assets/lang'
import contactStrings from '@hcengineering/contact-assets/lang'
import controlledDocumentsStrings from '@hcengineering/controlled-documents-assets/lang'
import documentStrings from '@hcengineering/document-assets/lang'
import exportStrings from '@hcengineering/export-assets/lang'
import driveStrings from '@hcengineering/drive-assets/lang'
import githubStrings from '@hcengineering/github-assets/lang'
import gmailStrings from '@hcengineering/gmail-assets/lang'
import hrStrings from '@hcengineering/hr-assets/lang'
import inventoryStrings from '@hcengineering/inventory-assets/lang'
import leadStrings from '@hcengineering/lead-assets/lang'
import loveStrings from '@hcengineering/love-assets/lang'
import notificationStrings from '@hcengineering/notification-assets/lang'
import onboardStrings from '@hcengineering/onboard-assets/lang'
import preferenceStrings from '@hcengineering/preference-assets/lang'
import productsStrings from '@hcengineering/products-assets/lang'
import recruitStrings from '@hcengineering/recruit-assets/lang'
import requestStrings from '@hcengineering/request-assets/lang'
import settingStrings from '@hcengineering/setting-assets/lang'
import supportStrings from '@hcengineering/support-assets/lang'
import tagsStrings from '@hcengineering/tags-assets/lang'
import taskStrings from '@hcengineering/task-assets/lang'
import telegramStrings from '@hcengineering/telegram-assets/lang'
import templatesStrings from '@hcengineering/templates-assets/lang'
import trackerStrings from '@hcengineering/tracker-assets/lang'
import trainingStrings from '@hcengineering/training-assets/lang'
import viewStrings from '@hcengineering/view-assets/lang'
import workbenchStrings from '@hcengineering/workbench-assets/lang'
import timeStrings from '@hcengineering/time-assets/lang'
import surveyStrings from '@hcengineering/survey-assets/lang'
import cardStrings from '@hcengineering/card-assets/lang'
import mailStrings from '@hcengineering/mail-assets/lang'
import workflowStrings from '@hcengineering/workflow-assets/lang'

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

export function registerStringLoaders (): void {
  addStringsLoader(coreId, async (lang: string) => await (coreLangs[lang] ?? coreLangs.en)())
  addStringsLoader(platformId, async (lang: string) => await (platformLangs[lang] ?? platformLangs.en)())
  loginStrings()
  activityStrings()
  attachmentStrings()
  calendarStrings()
  chunterStrings()
  contactStrings()
  controlledDocumentsStrings()
  documentStrings()
  exportStrings()
  driveStrings()
  githubStrings()
  gmailStrings()
  hrStrings()
  inventoryStrings()
  leadStrings()
  loveStrings()
  notificationStrings()
  onboardStrings()
  preferenceStrings()
  productsStrings()
  recruitStrings()
  requestStrings()
  settingStrings()
  supportStrings()
  tagsStrings()
  taskStrings()
  telegramStrings()
  templatesStrings()
  trackerStrings()
  trainingStrings()
  viewStrings()
  workbenchStrings()
  timeStrings()
  surveyStrings()
  cardStrings()
  mailStrings()
  workflowStrings()
}
