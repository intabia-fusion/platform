import { coreId } from '@intabiafusion/core'
import { addStringsLoader, platformId } from '@intabiafusion/platform'
import { activityId } from '@intabiafusion/activity'
import { attachmentId } from '@intabiafusion/attachment'
import { calendarId } from '@intabiafusion/calendar'
import { chunterId } from '@intabiafusion/chunter'
import { contactId } from '@intabiafusion/contact'
import { documentsId } from '@intabiafusion/controlled-documents'
import { documentId } from '@intabiafusion/document'
import { exportId } from '@intabiafusion/export'
import { driveId } from '@intabiafusion/drive'
import { githubId } from '@intabiafusion/github'
import { gmailId } from '@intabiafusion/gmail'
import { hrId } from '@intabiafusion/hr'
import { inventoryId } from '@intabiafusion/inventory'
import { leadId } from '@intabiafusion/lead'
import { loginId } from '@intabiafusion/login'
import { loveId } from '@intabiafusion/love'
import { notificationId } from '@intabiafusion/notification'
import { onboardId } from '@intabiafusion/onboard'
import { preferenceId } from '@intabiafusion/preference'
import { productsId } from '@intabiafusion/products'
import { recruitId } from '@intabiafusion/recruit'
import { requestId } from '@intabiafusion/request'
import { settingId } from '@intabiafusion/setting'
import { supportId } from '@intabiafusion/support'
import { tagsId } from '@intabiafusion/tags'
import { taskId } from '@intabiafusion/task'
import { telegramId } from '@intabiafusion/telegram'
import { templatesId } from '@intabiafusion/templates'
import { trackerId } from '@intabiafusion/tracker'
import { trainingId } from '@intabiafusion/training'
import { viewId } from '@intabiafusion/view'
import { workbenchId } from '@intabiafusion/workbench'
import { timeId } from '@intabiafusion/time'
import { surveyId } from '@intabiafusion/survey'
import { chatId } from '@intabiafusion/chat'
import { cardId } from '@intabiafusion/card'
import { mailId } from '@intabiafusion/mail'
import { communicationId } from '@intabiafusion/communication'

import coreEng from '@intabiafusion/core/lang/en.json'
import loginEng from '@intabiafusion/login-assets/lang/en.json'
import platformEng from '@intabiafusion/platform/lang/en.json'
import activityEn from '@intabiafusion/activity-assets/lang/en.json'
import attachmentEn from '@intabiafusion/attachment-assets/lang/en.json'
import calendarEn from '@intabiafusion/calendar-assets/lang/en.json'
import chunterEn from '@intabiafusion/chunter-assets/lang/en.json'
import contactEn from '@intabiafusion/contact-assets/lang/en.json'
import documentsEn from '@intabiafusion/controlled-documents-assets/lang/en.json'
import documentEn from '@intabiafusion/document-assets/lang/en.json'
import exportEn from '@intabiafusion/export-assets/lang/en.json'
import driveEn from '@intabiafusion/drive-assets/lang/en.json'
import githubEn from '@intabiafusion/github-assets/lang/en.json'
import gmailEn from '@intabiafusion/gmail-assets/lang/en.json'
import hrEn from '@intabiafusion/hr-assets/lang/en.json'
import inventoryEn from '@intabiafusion/inventory-assets/lang/en.json'
import leadEn from '@intabiafusion/lead-assets/lang/en.json'
import loveEn from '@intabiafusion/love-assets/lang/en.json'
import notificationEn from '@intabiafusion/notification-assets/lang/en.json'
import onboardEn from '@intabiafusion/onboard-assets/lang/en.json'
import preferenceEn from '@intabiafusion/preference-assets/lang/en.json'
import productsEn from '@intabiafusion/products-assets/lang/en.json'
import recruitEn from '@intabiafusion/recruit-assets/lang/en.json'
import requestEn from '@intabiafusion/request-assets/lang/en.json'
import settingEn from '@intabiafusion/setting-assets/lang/en.json'
import supportEn from '@intabiafusion/support-assets/lang/en.json'
import tagsEn from '@intabiafusion/tags-assets/lang/en.json'
import taskEn from '@intabiafusion/task-assets/lang/en.json'
import telegramEn from '@intabiafusion/telegram-assets/lang/en.json'
import templatesEn from '@intabiafusion/templates-assets/lang/en.json'
import trackerEn from '@intabiafusion/tracker-assets/lang/en.json'
import trainingEn from '@intabiafusion/training-assets/lang/en.json'
import viewEn from '@intabiafusion/view-assets/lang/en.json'
import workbenchEn from '@intabiafusion/workbench-assets/lang/en.json'
import timeEn from '@intabiafusion/time-assets/lang/en.json'
import surveyEn from '@intabiafusion/survey-assets/lang/en.json'
import chatEn from '@intabiafusion/chat-assets/lang/en.json'
import cardEn from '@intabiafusion/card-assets/lang/en.json'
import mailEn from '@intabiafusion/mail-assets/lang/en.json'
import communicationEn from '@intabiafusion/communication-assets/lang/en.json'

import coreRu from '@intabiafusion/core/lang/ru.json'
import loginRu from '@intabiafusion/login-assets/lang/ru.json'
import platformRu from '@intabiafusion/platform/lang/ru.json'
import activityRu from '@intabiafusion/activity-assets/lang/ru.json'
import attachmentRu from '@intabiafusion/attachment-assets/lang/ru.json'
import calendarRu from '@intabiafusion/calendar-assets/lang/ru.json'
import chunterRu from '@intabiafusion/chunter-assets/lang/ru.json'
import contactRu from '@intabiafusion/contact-assets/lang/ru.json'
import documentsRu from '@intabiafusion/controlled-documents-assets/lang/ru.json'
import documentRu from '@intabiafusion/document-assets/lang/ru.json'
import exportRu from '@intabiafusion/export-assets/lang/ru.json'
import driveRu from '@intabiafusion/drive-assets/lang/ru.json'
import githubRu from '@intabiafusion/github-assets/lang/ru.json'
import gmailRu from '@intabiafusion/gmail-assets/lang/ru.json'
import hrRu from '@intabiafusion/hr-assets/lang/ru.json'
import inventoryRu from '@intabiafusion/inventory-assets/lang/ru.json'
import leadRu from '@intabiafusion/lead-assets/lang/ru.json'
import loveRu from '@intabiafusion/love-assets/lang/ru.json'
import notificationRu from '@intabiafusion/notification-assets/lang/ru.json'
import onboardRu from '@intabiafusion/onboard-assets/lang/ru.json'
import preferenceRu from '@intabiafusion/preference-assets/lang/ru.json'
import productsRu from '@intabiafusion/products-assets/lang/ru.json'
import recruitRu from '@intabiafusion/recruit-assets/lang/ru.json'
import requestRu from '@intabiafusion/request-assets/lang/ru.json'
import settingRu from '@intabiafusion/setting-assets/lang/ru.json'
import supportRu from '@intabiafusion/support-assets/lang/ru.json'
import tagsRu from '@intabiafusion/tags-assets/lang/ru.json'
import taskRu from '@intabiafusion/task-assets/lang/ru.json'
import telegramRu from '@intabiafusion/telegram-assets/lang/ru.json'
import templatesRu from '@intabiafusion/templates-assets/lang/ru.json'
import trackerRu from '@intabiafusion/tracker-assets/lang/ru.json'
import trainingRu from '@intabiafusion/training-assets/lang/ru.json'
import viewRu from '@intabiafusion/view-assets/lang/ru.json'
import workbenchRu from '@intabiafusion/workbench-assets/lang/ru.json'
import timeRu from '@intabiafusion/time-assets/lang/ru.json'
import surveyRu from '@intabiafusion/survey-assets/lang/ru.json'
import chatRu from '@intabiafusion/chat-assets/lang/ru.json'
import cardRu from '@intabiafusion/card-assets/lang/ru.json'
import mailRu from '@intabiafusion/mail-assets/lang/ru.json'
import communicationRu from '@intabiafusion/communication-assets/lang/ru.json'

function createLoader (en: any, ru: any): (lang: string) => Promise<any> {
  return async (lang: string) => {
    switch (lang) {
      case 'en':
        return en
      case 'ru':
        return ru
      default:
        return en
    }
  }
}

export function registerStringLoaders (): void {
  addStringsLoader(coreId, createLoader(coreEng, coreRu))
  addStringsLoader(loginId, createLoader(loginEng, loginRu))
  addStringsLoader(onboardId, createLoader(onboardEn, onboardRu))
  addStringsLoader(platformId, createLoader(platformEng, platformRu))
  addStringsLoader(taskId, createLoader(taskEn, taskRu))
  addStringsLoader(viewId, createLoader(viewEn, viewRu))
  addStringsLoader(chunterId, createLoader(chunterEn, chunterRu))
  addStringsLoader(attachmentId, createLoader(attachmentEn, attachmentRu))
  addStringsLoader(contactId, createLoader(contactEn, contactRu))
  addStringsLoader(recruitId, createLoader(recruitEn, recruitRu))
  addStringsLoader(activityId, createLoader(activityEn, activityRu))
  addStringsLoader(settingId, createLoader(settingEn, settingRu))
  addStringsLoader(supportId, createLoader(supportEn, supportRu))
  addStringsLoader(telegramId, createLoader(telegramEn, telegramRu))
  addStringsLoader(leadId, createLoader(leadEn, leadRu))
  addStringsLoader(gmailId, createLoader(gmailEn, gmailRu))
  addStringsLoader(workbenchId, createLoader(workbenchEn, workbenchRu))
  addStringsLoader(inventoryId, createLoader(inventoryEn, inventoryRu))
  addStringsLoader(templatesId, createLoader(templatesEn, templatesRu))
  addStringsLoader(notificationId, createLoader(notificationEn, notificationRu))
  addStringsLoader(tagsId, createLoader(tagsEn, tagsRu))
  addStringsLoader(calendarId, createLoader(calendarEn, calendarRu))
  addStringsLoader(trackerId, createLoader(trackerEn, trackerRu))
  addStringsLoader(preferenceId, createLoader(preferenceEn, preferenceRu))
  addStringsLoader(hrId, createLoader(hrEn, hrRu))
  addStringsLoader(documentId, createLoader(documentEn, documentRu))
  addStringsLoader(exportId, createLoader(exportEn, exportRu))
  addStringsLoader(requestId, createLoader(requestEn, requestRu))
  addStringsLoader(loveId, createLoader(loveEn, loveRu))
  addStringsLoader(driveId, createLoader(driveEn, driveRu))
  addStringsLoader(documentsId, createLoader(documentsEn, documentsRu))
  addStringsLoader(productsId, createLoader(productsEn, productsRu))
  addStringsLoader(trainingId, createLoader(trainingEn, trainingRu))
  addStringsLoader(githubId, createLoader(githubEn, githubRu))
  addStringsLoader(timeId, createLoader(timeEn, timeRu))
  addStringsLoader(surveyId, createLoader(surveyEn, surveyRu))
  addStringsLoader(chatId, createLoader(chatEn, chatRu))
  addStringsLoader(cardId, createLoader(cardEn, cardRu))
  addStringsLoader(mailId, createLoader(mailEn, mailRu))
  addStringsLoader(communicationId, createLoader(communicationEn, communicationRu))
}
