import { coreId } from '@hcengineering/core'
import { addStringsLoader, platformId } from '@hcengineering/platform'
import { activityId } from '@hcengineering/activity'
import { attachmentId } from '@hcengineering/attachment'
import { calendarId } from '@hcengineering/calendar'
import { chunterId } from '@hcengineering/chunter'
import { contactId } from '@hcengineering/contact'
import { documentsId } from '@hcengineering/controlled-documents'
import { documentId } from '@hcengineering/document'
import { exportId } from '@hcengineering/export'
import { driveId } from '@hcengineering/drive'
import { githubId } from '@hcengineering/github'
import { gmailId } from '@hcengineering/gmail'
import { hrId } from '@hcengineering/hr'
import { inventoryId } from '@hcengineering/inventory'
import { leadId } from '@hcengineering/lead'
import { loginId } from '@hcengineering/login'
import { loveId } from '@hcengineering/love'
import { notificationId } from '@hcengineering/notification'
import { onboardId } from '@hcengineering/onboard'
import { preferenceId } from '@hcengineering/preference'
import { productsId } from '@hcengineering/products'
import { recruitId } from '@hcengineering/recruit'
import { requestId } from '@hcengineering/request'
import { settingId } from '@hcengineering/setting'
import { supportId } from '@hcengineering/support'
import { tagsId } from '@hcengineering/tags'
import { taskId } from '@hcengineering/task'
import { telegramId } from '@hcengineering/telegram'
import { templatesId } from '@hcengineering/templates'
import { trackerId } from '@hcengineering/tracker'
import { trainingId } from '@hcengineering/training'
import { viewId } from '@hcengineering/view'
import { workbenchId } from '@hcengineering/workbench'
import { timeId } from '@hcengineering/time'
import { surveyId } from '@hcengineering/survey'
import { cardId } from '@hcengineering/card'
import { mailId } from '@hcengineering/mail'
import { workflowId } from '@hcengineering/workflow'

import type { Plugin } from '@hcengineering/platform'

/** EN */
import coreEn from '@hcengineering/core/lang/en.json'
import loginEn from '@hcengineering/login-assets/lang/en.json'
import platformEn from '@hcengineering/platform/lang/en.json'
import activityEn from '@hcengineering/activity-assets/lang/en.json'
import attachmentEn from '@hcengineering/attachment-assets/lang/en.json'
import calendarEn from '@hcengineering/calendar-assets/lang/en.json'
import chunterEn from '@hcengineering/chunter-assets/lang/en.json'
import contactEn from '@hcengineering/contact-assets/lang/en.json'
import documentsEn from '@hcengineering/controlled-documents-assets/lang/en.json'
import documentEn from '@hcengineering/document-assets/lang/en.json'
import exportEn from '@hcengineering/export-assets/lang/en.json'
import driveEn from '@hcengineering/drive-assets/lang/en.json'
import githubEn from '@hcengineering/github-assets/lang/en.json'
import gmailEn from '@hcengineering/gmail-assets/lang/en.json'
import hrEn from '@hcengineering/hr-assets/lang/en.json'
import inventoryEn from '@hcengineering/inventory-assets/lang/en.json'
import leadEn from '@hcengineering/lead-assets/lang/en.json'
import loveEn from '@hcengineering/love-assets/lang/en.json'
import notificationEn from '@hcengineering/notification-assets/lang/en.json'
import onboardEn from '@hcengineering/onboard-assets/lang/en.json'
import preferenceEn from '@hcengineering/preference-assets/lang/en.json'
import productsEn from '@hcengineering/products-assets/lang/en.json'
import recruitEn from '@hcengineering/recruit-assets/lang/en.json'
import requestEn from '@hcengineering/request-assets/lang/en.json'
import settingEn from '@hcengineering/setting-assets/lang/en.json'
import supportEn from '@hcengineering/support-assets/lang/en.json'
import tagsEn from '@hcengineering/tags-assets/lang/en.json'
import taskEn from '@hcengineering/task-assets/lang/en.json'
import telegramEn from '@hcengineering/telegram-assets/lang/en.json'
import templatesEn from '@hcengineering/templates-assets/lang/en.json'
import trackerEn from '@hcengineering/tracker-assets/lang/en.json'
import trainingEn from '@hcengineering/training-assets/lang/en.json'
import viewEn from '@hcengineering/view-assets/lang/en.json'
import workbenchEn from '@hcengineering/workbench-assets/lang/en.json'
import timeEn from '@hcengineering/time-assets/lang/en.json'
import surveyEn from '@hcengineering/survey-assets/lang/en.json'
import cardEn from '@hcengineering/card-assets/lang/en.json'
import mailEn from '@hcengineering/mail-assets/lang/en.json'
import workflowEn from '@hcengineering/workflow-assets/lang/en.json'

/** RU */
import coreRu from '@hcengineering/core/lang/ru.json'
import loginRu from '@hcengineering/login-assets/lang/ru.json'
import platformRu from '@hcengineering/platform/lang/ru.json'
import activityRu from '@hcengineering/activity-assets/lang/ru.json'
import attachmentRu from '@hcengineering/attachment-assets/lang/ru.json'
import calendarRu from '@hcengineering/calendar-assets/lang/ru.json'
import chunterRu from '@hcengineering/chunter-assets/lang/ru.json'
import contactRu from '@hcengineering/contact-assets/lang/ru.json'
import documentsRu from '@hcengineering/controlled-documents-assets/lang/ru.json'
import documentRu from '@hcengineering/document-assets/lang/ru.json'
import exportRu from '@hcengineering/export-assets/lang/ru.json'
import driveRu from '@hcengineering/drive-assets/lang/ru.json'
import githubRu from '@hcengineering/github-assets/lang/ru.json'
import gmailRu from '@hcengineering/gmail-assets/lang/ru.json'
import hrRu from '@hcengineering/hr-assets/lang/ru.json'
import inventoryRu from '@hcengineering/inventory-assets/lang/ru.json'
import leadRu from '@hcengineering/lead-assets/lang/ru.json'
import loveRu from '@hcengineering/love-assets/lang/ru.json'
import notificationRu from '@hcengineering/notification-assets/lang/ru.json'
import onboardRu from '@hcengineering/onboard-assets/lang/ru.json'
import preferenceRu from '@hcengineering/preference-assets/lang/ru.json'
import productsRu from '@hcengineering/products-assets/lang/ru.json'
import recruitRu from '@hcengineering/recruit-assets/lang/ru.json'
import requestRu from '@hcengineering/request-assets/lang/ru.json'
import settingRu from '@hcengineering/setting-assets/lang/ru.json'
import supportRu from '@hcengineering/support-assets/lang/ru.json'
import tagsRu from '@hcengineering/tags-assets/lang/ru.json'
import taskRu from '@hcengineering/task-assets/lang/ru.json'
import telegramRu from '@hcengineering/telegram-assets/lang/ru.json'
import templatesRu from '@hcengineering/templates-assets/lang/ru.json'
import trackerRu from '@hcengineering/tracker-assets/lang/ru.json'
import trainingRu from '@hcengineering/training-assets/lang/ru.json'
import viewRu from '@hcengineering/view-assets/lang/ru.json'
import workbenchRu from '@hcengineering/workbench-assets/lang/ru.json'
import timeRu from '@hcengineering/time-assets/lang/ru.json'
import surveyRu from '@hcengineering/survey-assets/lang/ru.json'
import cardRu from '@hcengineering/card-assets/lang/ru.json'
import mailRu from '@hcengineering/mail-assets/lang/ru.json'
import workflowRu from '@hcengineering/workflow-assets/lang/ru.json'

/** CS */
import coreCs from '@hcengineering/core/lang/cs.json'
import loginCs from '@hcengineering/login-assets/lang/cs.json'
import platformCs from '@hcengineering/platform/lang/cs.json'
import activityCs from '@hcengineering/activity-assets/lang/cs.json'
import attachmentCs from '@hcengineering/attachment-assets/lang/cs.json'
import calendarCs from '@hcengineering/calendar-assets/lang/cs.json'
import chunterCs from '@hcengineering/chunter-assets/lang/cs.json'
import contactCs from '@hcengineering/contact-assets/lang/cs.json'
import documentsCs from '@hcengineering/controlled-documents-assets/lang/cs.json'
import documentCs from '@hcengineering/document-assets/lang/cs.json'
import exportCs from '@hcengineering/export-assets/lang/cs.json'
import driveCs from '@hcengineering/drive-assets/lang/cs.json'
import githubCs from '@hcengineering/github-assets/lang/cs.json'
import gmailCs from '@hcengineering/gmail-assets/lang/cs.json'
import hrCs from '@hcengineering/hr-assets/lang/cs.json'
import inventoryCs from '@hcengineering/inventory-assets/lang/cs.json'
import leadCs from '@hcengineering/lead-assets/lang/cs.json'
import loveCs from '@hcengineering/love-assets/lang/cs.json'
import notificationCs from '@hcengineering/notification-assets/lang/cs.json'
import onboardCs from '@hcengineering/onboard-assets/lang/cs.json'
import preferenceCs from '@hcengineering/preference-assets/lang/cs.json'
import productsCs from '@hcengineering/products-assets/lang/cs.json'
import recruitCs from '@hcengineering/recruit-assets/lang/cs.json'
import requestCs from '@hcengineering/request-assets/lang/cs.json'
import settingCs from '@hcengineering/setting-assets/lang/cs.json'
import supportCs from '@hcengineering/support-assets/lang/cs.json'
import tagsCs from '@hcengineering/tags-assets/lang/cs.json'
import taskCs from '@hcengineering/task-assets/lang/cs.json'
import telegramCs from '@hcengineering/telegram-assets/lang/cs.json'
import templatesCs from '@hcengineering/templates-assets/lang/cs.json'
import trackerCs from '@hcengineering/tracker-assets/lang/cs.json'
import trainingCs from '@hcengineering/training-assets/lang/cs.json'
import viewCs from '@hcengineering/view-assets/lang/cs.json'
import workbenchCs from '@hcengineering/workbench-assets/lang/cs.json'
import timeCs from '@hcengineering/time-assets/lang/cs.json'
import surveyCs from '@hcengineering/survey-assets/lang/cs.json'
import cardCs from '@hcengineering/card-assets/lang/cs.json'
import mailCs from '@hcengineering/mail-assets/lang/cs.json'
import workflowCs from '@hcengineering/workflow-assets/lang/cs.json'

/** DE */
import coreDe from '@hcengineering/core/lang/de.json'
import loginDe from '@hcengineering/login-assets/lang/de.json'
import platformDe from '@hcengineering/platform/lang/de.json'
import activityDe from '@hcengineering/activity-assets/lang/de.json'
import attachmentDe from '@hcengineering/attachment-assets/lang/de.json'
import calendarDe from '@hcengineering/calendar-assets/lang/de.json'
import chunterDe from '@hcengineering/chunter-assets/lang/de.json'
import contactDe from '@hcengineering/contact-assets/lang/de.json'
import documentsDe from '@hcengineering/controlled-documents-assets/lang/de.json'
import documentDe from '@hcengineering/document-assets/lang/de.json'
import exportDe from '@hcengineering/export-assets/lang/de.json'
import driveDe from '@hcengineering/drive-assets/lang/de.json'
import githubDe from '@hcengineering/github-assets/lang/de.json'
import gmailDe from '@hcengineering/gmail-assets/lang/de.json'
import hrDe from '@hcengineering/hr-assets/lang/de.json'
import inventoryDe from '@hcengineering/inventory-assets/lang/de.json'
import leadDe from '@hcengineering/lead-assets/lang/de.json'
import loveDe from '@hcengineering/love-assets/lang/de.json'
import notificationDe from '@hcengineering/notification-assets/lang/de.json'
import onboardDe from '@hcengineering/onboard-assets/lang/de.json'
import preferenceDe from '@hcengineering/preference-assets/lang/de.json'
import productsDe from '@hcengineering/products-assets/lang/de.json'
import recruitDe from '@hcengineering/recruit-assets/lang/de.json'
import requestDe from '@hcengineering/request-assets/lang/de.json'
import settingDe from '@hcengineering/setting-assets/lang/de.json'
import supportDe from '@hcengineering/support-assets/lang/de.json'
import tagsDe from '@hcengineering/tags-assets/lang/de.json'
import taskDe from '@hcengineering/task-assets/lang/de.json'
import telegramDe from '@hcengineering/telegram-assets/lang/de.json'
import templatesDe from '@hcengineering/templates-assets/lang/de.json'
import trackerDe from '@hcengineering/tracker-assets/lang/de.json'
import trainingDe from '@hcengineering/training-assets/lang/de.json'
import viewDe from '@hcengineering/view-assets/lang/de.json'
import workbenchDe from '@hcengineering/workbench-assets/lang/de.json'
import timeDe from '@hcengineering/time-assets/lang/de.json'
import surveyDe from '@hcengineering/survey-assets/lang/de.json'
import cardDe from '@hcengineering/card-assets/lang/de.json'
import mailDe from '@hcengineering/mail-assets/lang/de.json'
import workflowDe from '@hcengineering/workflow-assets/lang/de.json'

/** ES */
import coreEs from '@hcengineering/core/lang/es.json'
import loginEs from '@hcengineering/login-assets/lang/es.json'
import platformEs from '@hcengineering/platform/lang/es.json'
import activityEs from '@hcengineering/activity-assets/lang/es.json'
import attachmentEs from '@hcengineering/attachment-assets/lang/es.json'
import calendarEs from '@hcengineering/calendar-assets/lang/es.json'
import chunterEs from '@hcengineering/chunter-assets/lang/es.json'
import contactEs from '@hcengineering/contact-assets/lang/es.json'
import documentsEs from '@hcengineering/controlled-documents-assets/lang/es.json'
import documentEs from '@hcengineering/document-assets/lang/es.json'
import exportEs from '@hcengineering/export-assets/lang/es.json'
import driveEs from '@hcengineering/drive-assets/lang/es.json'
import githubEs from '@hcengineering/github-assets/lang/es.json'
import gmailEs from '@hcengineering/gmail-assets/lang/es.json'
import hrEs from '@hcengineering/hr-assets/lang/es.json'
import inventoryEs from '@hcengineering/inventory-assets/lang/es.json'
import leadEs from '@hcengineering/lead-assets/lang/es.json'
import loveEs from '@hcengineering/love-assets/lang/es.json'
import notificationEs from '@hcengineering/notification-assets/lang/es.json'
import onboardEs from '@hcengineering/onboard-assets/lang/es.json'
import preferenceEs from '@hcengineering/preference-assets/lang/es.json'
import productsEs from '@hcengineering/products-assets/lang/es.json'
import recruitEs from '@hcengineering/recruit-assets/lang/es.json'
import requestEs from '@hcengineering/request-assets/lang/es.json'
import settingEs from '@hcengineering/setting-assets/lang/es.json'
import supportEs from '@hcengineering/support-assets/lang/es.json'
import tagsEs from '@hcengineering/tags-assets/lang/es.json'
import taskEs from '@hcengineering/task-assets/lang/es.json'
import telegramEs from '@hcengineering/telegram-assets/lang/es.json'
import templatesEs from '@hcengineering/templates-assets/lang/es.json'
import trackerEs from '@hcengineering/tracker-assets/lang/es.json'
import trainingEs from '@hcengineering/training-assets/lang/es.json'
import viewEs from '@hcengineering/view-assets/lang/es.json'
import workbenchEs from '@hcengineering/workbench-assets/lang/es.json'
import timeEs from '@hcengineering/time-assets/lang/es.json'
import surveyEs from '@hcengineering/survey-assets/lang/es.json'
import cardEs from '@hcengineering/card-assets/lang/es.json'
import mailEs from '@hcengineering/mail-assets/lang/es.json'
import workflowEs from '@hcengineering/workflow-assets/lang/es.json'

/** FR */
import coreFr from '@hcengineering/core/lang/fr.json'
import loginFr from '@hcengineering/login-assets/lang/fr.json'
import platformFr from '@hcengineering/platform/lang/fr.json'
import activityFr from '@hcengineering/activity-assets/lang/fr.json'
import attachmentFr from '@hcengineering/attachment-assets/lang/fr.json'
import calendarFr from '@hcengineering/calendar-assets/lang/fr.json'
import chunterFr from '@hcengineering/chunter-assets/lang/fr.json'
import contactFr from '@hcengineering/contact-assets/lang/fr.json'
import documentsFr from '@hcengineering/controlled-documents-assets/lang/fr.json'
import documentFr from '@hcengineering/document-assets/lang/fr.json'
import exportFr from '@hcengineering/export-assets/lang/fr.json'
import driveFr from '@hcengineering/drive-assets/lang/fr.json'
import githubFr from '@hcengineering/github-assets/lang/fr.json'
import gmailFr from '@hcengineering/gmail-assets/lang/fr.json'
import hrFr from '@hcengineering/hr-assets/lang/fr.json'
import inventoryFr from '@hcengineering/inventory-assets/lang/fr.json'
import leadFr from '@hcengineering/lead-assets/lang/fr.json'
import loveFr from '@hcengineering/love-assets/lang/fr.json'
import notificationFr from '@hcengineering/notification-assets/lang/fr.json'
import onboardFr from '@hcengineering/onboard-assets/lang/fr.json'
import preferenceFr from '@hcengineering/preference-assets/lang/fr.json'
import productsFr from '@hcengineering/products-assets/lang/fr.json'
import recruitFr from '@hcengineering/recruit-assets/lang/fr.json'
import requestFr from '@hcengineering/request-assets/lang/fr.json'
import settingFr from '@hcengineering/setting-assets/lang/fr.json'
import supportFr from '@hcengineering/support-assets/lang/fr.json'
import tagsFr from '@hcengineering/tags-assets/lang/fr.json'
import taskFr from '@hcengineering/task-assets/lang/fr.json'
import telegramFr from '@hcengineering/telegram-assets/lang/fr.json'
import templatesFr from '@hcengineering/templates-assets/lang/fr.json'
import trackerFr from '@hcengineering/tracker-assets/lang/fr.json'
import trainingFr from '@hcengineering/training-assets/lang/fr.json'
import viewFr from '@hcengineering/view-assets/lang/fr.json'
import workbenchFr from '@hcengineering/workbench-assets/lang/fr.json'
import timeFr from '@hcengineering/time-assets/lang/fr.json'
import surveyFr from '@hcengineering/survey-assets/lang/fr.json'
import cardFr from '@hcengineering/card-assets/lang/fr.json'
import mailFr from '@hcengineering/mail-assets/lang/fr.json'
import workflowFr from '@hcengineering/workflow-assets/lang/fr.json'

/** IT */
import coreIt from '@hcengineering/core/lang/it.json'
import loginIt from '@hcengineering/login-assets/lang/it.json'
import platformIt from '@hcengineering/platform/lang/it.json'
import activityIt from '@hcengineering/activity-assets/lang/it.json'
import attachmentIt from '@hcengineering/attachment-assets/lang/it.json'
import calendarIt from '@hcengineering/calendar-assets/lang/it.json'
import chunterIt from '@hcengineering/chunter-assets/lang/it.json'
import contactIt from '@hcengineering/contact-assets/lang/it.json'
import documentsIt from '@hcengineering/controlled-documents-assets/lang/it.json'
import documentIt from '@hcengineering/document-assets/lang/it.json'
import exportIt from '@hcengineering/export-assets/lang/it.json'
import driveIt from '@hcengineering/drive-assets/lang/it.json'
import githubIt from '@hcengineering/github-assets/lang/it.json'
import gmailIt from '@hcengineering/gmail-assets/lang/it.json'
import hrIt from '@hcengineering/hr-assets/lang/it.json'
import inventoryIt from '@hcengineering/inventory-assets/lang/it.json'
import leadIt from '@hcengineering/lead-assets/lang/it.json'
import loveIt from '@hcengineering/love-assets/lang/it.json'
import notificationIt from '@hcengineering/notification-assets/lang/it.json'
import onboardIt from '@hcengineering/onboard-assets/lang/it.json'
import preferenceIt from '@hcengineering/preference-assets/lang/it.json'
import productsIt from '@hcengineering/products-assets/lang/it.json'
import recruitIt from '@hcengineering/recruit-assets/lang/it.json'
import requestIt from '@hcengineering/request-assets/lang/it.json'
import settingIt from '@hcengineering/setting-assets/lang/it.json'
import supportIt from '@hcengineering/support-assets/lang/it.json'
import tagsIt from '@hcengineering/tags-assets/lang/it.json'
import taskIt from '@hcengineering/task-assets/lang/it.json'
import telegramIt from '@hcengineering/telegram-assets/lang/it.json'
import templatesIt from '@hcengineering/templates-assets/lang/it.json'
import trackerIt from '@hcengineering/tracker-assets/lang/it.json'
import trainingIt from '@hcengineering/training-assets/lang/it.json'
import viewIt from '@hcengineering/view-assets/lang/it.json'
import workbenchIt from '@hcengineering/workbench-assets/lang/it.json'
import timeIt from '@hcengineering/time-assets/lang/it.json'
import surveyIt from '@hcengineering/survey-assets/lang/it.json'
import cardIt from '@hcengineering/card-assets/lang/it.json'
import mailIt from '@hcengineering/mail-assets/lang/it.json'
import workflowIt from '@hcengineering/workflow-assets/lang/it.json'

/** JA */
import coreJa from '@hcengineering/core/lang/ja.json'
import loginJa from '@hcengineering/login-assets/lang/ja.json'
import platformJa from '@hcengineering/platform/lang/ja.json'
import activityJa from '@hcengineering/activity-assets/lang/ja.json'
import attachmentJa from '@hcengineering/attachment-assets/lang/ja.json'
import calendarJa from '@hcengineering/calendar-assets/lang/ja.json'
import chunterJa from '@hcengineering/chunter-assets/lang/ja.json'
import contactJa from '@hcengineering/contact-assets/lang/ja.json'
import documentsJa from '@hcengineering/controlled-documents-assets/lang/ja.json'
import documentJa from '@hcengineering/document-assets/lang/ja.json'
import exportJa from '@hcengineering/export-assets/lang/ja.json'
import driveJa from '@hcengineering/drive-assets/lang/ja.json'
import gmailJa from '@hcengineering/gmail-assets/lang/ja.json'
import hrJa from '@hcengineering/hr-assets/lang/ja.json'
import inventoryJa from '@hcengineering/inventory-assets/lang/ja.json'
import leadJa from '@hcengineering/lead-assets/lang/ja.json'
import loveJa from '@hcengineering/love-assets/lang/ja.json'
import notificationJa from '@hcengineering/notification-assets/lang/ja.json'
import onboardJa from '@hcengineering/onboard-assets/lang/ja.json'
import preferenceJa from '@hcengineering/preference-assets/lang/ja.json'
import productsJa from '@hcengineering/products-assets/lang/ja.json'
import recruitJa from '@hcengineering/recruit-assets/lang/ja.json'
import requestJa from '@hcengineering/request-assets/lang/ja.json'
import settingJa from '@hcengineering/setting-assets/lang/ja.json'
import supportJa from '@hcengineering/support-assets/lang/ja.json'
import tagsJa from '@hcengineering/tags-assets/lang/ja.json'
import taskJa from '@hcengineering/task-assets/lang/ja.json'
import telegramJa from '@hcengineering/telegram-assets/lang/ja.json'
import templatesJa from '@hcengineering/templates-assets/lang/ja.json'
import trackerJa from '@hcengineering/tracker-assets/lang/ja.json'
import trainingJa from '@hcengineering/training-assets/lang/ja.json'
import viewJa from '@hcengineering/view-assets/lang/ja.json'
import workbenchJa from '@hcengineering/workbench-assets/lang/ja.json'
import timeJa from '@hcengineering/time-assets/lang/ja.json'
import surveyJa from '@hcengineering/survey-assets/lang/ja.json'
import cardJa from '@hcengineering/card-assets/lang/ja.json'
import mailJa from '@hcengineering/mail-assets/lang/ja.json'
import workflowJa from '@hcengineering/workflow-assets/lang/ja.json'

/** PT */
import corePt from '@hcengineering/core/lang/pt.json'
import loginPt from '@hcengineering/login-assets/lang/pt.json'
import platformPt from '@hcengineering/platform/lang/pt.json'
import activityPt from '@hcengineering/activity-assets/lang/pt.json'
import attachmentPt from '@hcengineering/attachment-assets/lang/pt.json'
import calendarPt from '@hcengineering/calendar-assets/lang/pt.json'
import chunterPt from '@hcengineering/chunter-assets/lang/pt.json'
import contactPt from '@hcengineering/contact-assets/lang/pt.json'
import documentsPt from '@hcengineering/controlled-documents-assets/lang/pt.json'
import documentPt from '@hcengineering/document-assets/lang/pt.json'
import exportPt from '@hcengineering/export-assets/lang/pt.json'
import drivePt from '@hcengineering/drive-assets/lang/pt.json'
import githubPt from '@hcengineering/github-assets/lang/pt.json'
import gmailPt from '@hcengineering/gmail-assets/lang/pt.json'
import hrPt from '@hcengineering/hr-assets/lang/pt.json'
import inventoryPt from '@hcengineering/inventory-assets/lang/pt.json'
import leadPt from '@hcengineering/lead-assets/lang/pt.json'
import lovePt from '@hcengineering/love-assets/lang/pt.json'
import notificationPt from '@hcengineering/notification-assets/lang/pt.json'
import onboardPt from '@hcengineering/onboard-assets/lang/pt.json'
import preferencePt from '@hcengineering/preference-assets/lang/pt.json'
import productsPt from '@hcengineering/products-assets/lang/pt.json'
import recruitPt from '@hcengineering/recruit-assets/lang/pt.json'
import requestPt from '@hcengineering/request-assets/lang/pt.json'
import settingPt from '@hcengineering/setting-assets/lang/pt.json'
import supportPt from '@hcengineering/support-assets/lang/pt.json'
import tagsPt from '@hcengineering/tags-assets/lang/pt.json'
import taskPt from '@hcengineering/task-assets/lang/pt.json'
import telegramPt from '@hcengineering/telegram-assets/lang/pt.json'
import templatesPt from '@hcengineering/templates-assets/lang/pt.json'
import trackerPt from '@hcengineering/tracker-assets/lang/pt.json'
import trainingPt from '@hcengineering/training-assets/lang/pt.json'
import viewPt from '@hcengineering/view-assets/lang/pt.json'
import workbenchPt from '@hcengineering/workbench-assets/lang/pt.json'
import timePt from '@hcengineering/time-assets/lang/pt.json'
import surveyPt from '@hcengineering/survey-assets/lang/pt.json'
import cardPt from '@hcengineering/card-assets/lang/pt.json'
import mailPt from '@hcengineering/mail-assets/lang/pt.json'
import workflowPt from '@hcengineering/workflow-assets/lang/pt.json'

/** PT-BR */
import corePtBr from '@hcengineering/core/lang/pt-br.json'
import loginPtBr from '@hcengineering/login-assets/lang/pt-br.json'
import platformPtBr from '@hcengineering/platform/lang/pt-br.json'
import activityPtBr from '@hcengineering/activity-assets/lang/pt-br.json'
import attachmentPtBr from '@hcengineering/attachment-assets/lang/pt-br.json'
import calendarPtBr from '@hcengineering/calendar-assets/lang/pt-br.json'
import chunterPtBr from '@hcengineering/chunter-assets/lang/pt-br.json'
import contactPtBr from '@hcengineering/contact-assets/lang/pt-br.json'
import documentsPtBr from '@hcengineering/controlled-documents-assets/lang/pt-br.json'
import documentPtBr from '@hcengineering/document-assets/lang/pt-br.json'
import exportPtBr from '@hcengineering/export-assets/lang/pt-br.json'
import drivePtBr from '@hcengineering/drive-assets/lang/pt-br.json'
import githubPtBr from '@hcengineering/github-assets/lang/pt-br.json'
import gmailPtBr from '@hcengineering/gmail-assets/lang/pt-br.json'
import hrPtBr from '@hcengineering/hr-assets/lang/pt-br.json'
import inventoryPtBr from '@hcengineering/inventory-assets/lang/pt-br.json'
import leadPtBr from '@hcengineering/lead-assets/lang/pt-br.json'
import lovePtBr from '@hcengineering/love-assets/lang/pt-br.json'
import notificationPtBr from '@hcengineering/notification-assets/lang/pt-br.json'
import onboardPtBr from '@hcengineering/onboard-assets/lang/pt-br.json'
import preferencePtBr from '@hcengineering/preference-assets/lang/pt-br.json'
import productsPtBr from '@hcengineering/products-assets/lang/pt-br.json'
import recruitPtBr from '@hcengineering/recruit-assets/lang/pt-br.json'
import requestPtBr from '@hcengineering/request-assets/lang/pt-br.json'
import settingPtBr from '@hcengineering/setting-assets/lang/pt-br.json'
import supportPtBr from '@hcengineering/support-assets/lang/pt-br.json'
import tagsPtBr from '@hcengineering/tags-assets/lang/pt-br.json'
import taskPtBr from '@hcengineering/task-assets/lang/pt-br.json'
import telegramPtBr from '@hcengineering/telegram-assets/lang/pt-br.json'
import templatesPtBr from '@hcengineering/templates-assets/lang/pt-br.json'
import trackerPtBr from '@hcengineering/tracker-assets/lang/pt-br.json'
import trainingPtBr from '@hcengineering/training-assets/lang/pt-br.json'
import viewPtBr from '@hcengineering/view-assets/lang/pt-br.json'
import workbenchPtBr from '@hcengineering/workbench-assets/lang/pt-br.json'
import timePtBr from '@hcengineering/time-assets/lang/pt-br.json'
import surveyPtBr from '@hcengineering/survey-assets/lang/pt-br.json'
import cardPtBr from '@hcengineering/card-assets/lang/pt-br.json'
import mailPtBr from '@hcengineering/mail-assets/lang/pt-br.json'
import workflowPtBr from '@hcengineering/workflow-assets/lang/pt-br.json'

/** TR */
import coreTr from '@hcengineering/core/lang/tr.json'
import loginTr from '@hcengineering/login-assets/lang/tr.json'
import platformTr from '@hcengineering/platform/lang/tr.json'
import activityTr from '@hcengineering/activity-assets/lang/tr.json'
import attachmentTr from '@hcengineering/attachment-assets/lang/tr.json'
import calendarTr from '@hcengineering/calendar-assets/lang/tr.json'
import chunterTr from '@hcengineering/chunter-assets/lang/tr.json'
import contactTr from '@hcengineering/contact-assets/lang/tr.json'
import documentsTr from '@hcengineering/controlled-documents-assets/lang/tr.json'
import documentTr from '@hcengineering/document-assets/lang/tr.json'
import exportTr from '@hcengineering/export-assets/lang/tr.json'
import driveTr from '@hcengineering/drive-assets/lang/tr.json'
import githubTr from '@hcengineering/github-assets/lang/tr.json'
import gmailTr from '@hcengineering/gmail-assets/lang/tr.json'
import hrTr from '@hcengineering/hr-assets/lang/tr.json'
import inventoryTr from '@hcengineering/inventory-assets/lang/tr.json'
import leadTr from '@hcengineering/lead-assets/lang/tr.json'
import loveTr from '@hcengineering/love-assets/lang/tr.json'
import notificationTr from '@hcengineering/notification-assets/lang/tr.json'
import onboardTr from '@hcengineering/onboard-assets/lang/tr.json'
import preferenceTr from '@hcengineering/preference-assets/lang/tr.json'
import productsTr from '@hcengineering/products-assets/lang/tr.json'
import recruitTr from '@hcengineering/recruit-assets/lang/tr.json'
import requestTr from '@hcengineering/request-assets/lang/tr.json'
import settingTr from '@hcengineering/setting-assets/lang/tr.json'
import supportTr from '@hcengineering/support-assets/lang/tr.json'
import tagsTr from '@hcengineering/tags-assets/lang/tr.json'
import taskTr from '@hcengineering/task-assets/lang/tr.json'
import telegramTr from '@hcengineering/telegram-assets/lang/tr.json'
import templatesTr from '@hcengineering/templates-assets/lang/tr.json'
import trackerTr from '@hcengineering/tracker-assets/lang/tr.json'
import trainingTr from '@hcengineering/training-assets/lang/tr.json'
import viewTr from '@hcengineering/view-assets/lang/tr.json'
import workbenchTr from '@hcengineering/workbench-assets/lang/tr.json'
import timeTr from '@hcengineering/time-assets/lang/tr.json'
import surveyTr from '@hcengineering/survey-assets/lang/tr.json'
import cardTr from '@hcengineering/card-assets/lang/tr.json'
import mailTr from '@hcengineering/mail-assets/lang/tr.json'
import workflowTr from '@hcengineering/workflow-assets/lang/tr.json'

/** ZH */
import coreZh from '@hcengineering/core/lang/zh.json'
import loginZh from '@hcengineering/login-assets/lang/zh.json'
import platformZh from '@hcengineering/platform/lang/zh.json'
import activityZh from '@hcengineering/activity-assets/lang/zh.json'
import attachmentZh from '@hcengineering/attachment-assets/lang/zh.json'
import calendarZh from '@hcengineering/calendar-assets/lang/zh.json'
import chunterZh from '@hcengineering/chunter-assets/lang/zh.json'
import contactZh from '@hcengineering/contact-assets/lang/zh.json'
import documentsZh from '@hcengineering/controlled-documents-assets/lang/zh.json'
import documentZh from '@hcengineering/document-assets/lang/zh.json'
import exportZh from '@hcengineering/export-assets/lang/zh.json'
import driveZh from '@hcengineering/drive-assets/lang/zh.json'
import githubZh from '@hcengineering/github-assets/lang/zh.json'
import gmailZh from '@hcengineering/gmail-assets/lang/zh.json'
import hrZh from '@hcengineering/hr-assets/lang/zh.json'
import inventoryZh from '@hcengineering/inventory-assets/lang/zh.json'
import leadZh from '@hcengineering/lead-assets/lang/zh.json'
import loveZh from '@hcengineering/love-assets/lang/zh.json'
import notificationZh from '@hcengineering/notification-assets/lang/zh.json'
import onboardZh from '@hcengineering/onboard-assets/lang/zh.json'
import preferenceZh from '@hcengineering/preference-assets/lang/zh.json'
import productsZh from '@hcengineering/products-assets/lang/zh.json'
import recruitZh from '@hcengineering/recruit-assets/lang/zh.json'
import requestZh from '@hcengineering/request-assets/lang/zh.json'
import settingZh from '@hcengineering/setting-assets/lang/zh.json'
import supportZh from '@hcengineering/support-assets/lang/zh.json'
import tagsZh from '@hcengineering/tags-assets/lang/zh.json'
import taskZh from '@hcengineering/task-assets/lang/zh.json'
import telegramZh from '@hcengineering/telegram-assets/lang/zh.json'
import templatesZh from '@hcengineering/templates-assets/lang/zh.json'
import trackerZh from '@hcengineering/tracker-assets/lang/zh.json'
import trainingZh from '@hcengineering/training-assets/lang/zh.json'
import viewZh from '@hcengineering/view-assets/lang/zh.json'
import workbenchZh from '@hcengineering/workbench-assets/lang/zh.json'
import timeZh from '@hcengineering/time-assets/lang/zh.json'
import surveyZh from '@hcengineering/survey-assets/lang/zh.json'
import cardZh from '@hcengineering/card-assets/lang/zh.json'
import mailZh from '@hcengineering/mail-assets/lang/zh.json'
import workflowZh from '@hcengineering/workflow-assets/lang/zh.json'

function createLoader (pluginId: Plugin): (lang: string) => Promise<any> {
  const translations = translationsMap.get(pluginId) ?? {}
  return async (lang: string) => {
    return translations[lang] ?? translations.en ?? {}
  }
}

export function registerStringLoaders (): void {
  for (const [pluginId] of translationsMap) {
    addStringsLoader(pluginId, createLoader(pluginId))
  }
}

const translationsMap = new Map<Plugin, Record<string, any>>([
  [
    coreId,
    {
      en: coreEn,
      ru: coreRu,
      cs: coreCs,
      de: coreDe,
      es: coreEs,
      fr: coreFr,
      it: coreIt,
      ja: coreJa,
      pt: corePt,
      'pt-br': corePtBr,
      tr: coreTr,
      zh: coreZh
    }
  ],
  [
    loginId,
    {
      en: loginEn,
      ru: loginRu,
      cs: loginCs,
      de: loginDe,
      es: loginEs,
      fr: loginFr,
      it: loginIt,
      ja: loginJa,
      pt: loginPt,
      'pt-br': loginPtBr,
      tr: loginTr,
      zh: loginZh
    }
  ],
  [
    platformId,
    {
      en: platformEn,
      ru: platformRu,
      cs: platformCs,
      de: platformDe,
      es: platformEs,
      fr: platformFr,
      it: platformIt,
      ja: platformJa,
      pt: platformPt,
      'pt-br': platformPtBr,
      tr: platformTr,
      zh: platformZh
    }
  ],
  [
    activityId,
    {
      en: activityEn,
      ru: activityRu,
      cs: activityCs,
      de: activityDe,
      es: activityEs,
      fr: activityFr,
      it: activityIt,
      ja: activityJa,
      pt: activityPt,
      'pt-br': activityPtBr,
      tr: activityTr,
      zh: activityZh
    }
  ],
  [
    attachmentId,
    {
      en: attachmentEn,
      ru: attachmentRu,
      cs: attachmentCs,
      de: attachmentDe,
      es: attachmentEs,
      fr: attachmentFr,
      it: attachmentIt,
      ja: attachmentJa,
      pt: attachmentPt,
      'pt-br': attachmentPtBr,
      tr: attachmentTr,
      zh: attachmentZh
    }
  ],
  [
    calendarId,
    {
      en: calendarEn,
      ru: calendarRu,
      cs: calendarCs,
      de: calendarDe,
      es: calendarEs,
      fr: calendarFr,
      it: calendarIt,
      ja: calendarJa,
      pt: calendarPt,
      'pt-br': calendarPtBr,
      tr: calendarTr,
      zh: calendarZh
    }
  ],
  [
    chunterId,
    {
      en: chunterEn,
      ru: chunterRu,
      cs: chunterCs,
      de: chunterDe,
      es: chunterEs,
      fr: chunterFr,
      it: chunterIt,
      ja: chunterJa,
      pt: chunterPt,
      'pt-br': chunterPtBr,
      tr: chunterTr,
      zh: chunterZh
    }
  ],
  [
    contactId,
    {
      en: contactEn,
      ru: contactRu,
      cs: contactCs,
      de: contactDe,
      es: contactEs,
      fr: contactFr,
      it: contactIt,
      ja: contactJa,
      pt: contactPt,
      'pt-br': contactPtBr,
      tr: contactTr,
      zh: contactZh
    }
  ],
  [
    documentsId,
    {
      en: documentsEn,
      ru: documentsRu,
      cs: documentsCs,
      de: documentsDe,
      es: documentsEs,
      fr: documentsFr,
      it: documentsIt,
      ja: documentsJa,
      pt: documentsPt,
      'pt-br': documentsPtBr,
      tr: documentsTr,
      zh: documentsZh
    }
  ],
  [
    documentId,
    {
      en: documentEn,
      ru: documentRu,
      cs: documentCs,
      de: documentDe,
      es: documentEs,
      fr: documentFr,
      it: documentIt,
      ja: documentJa,
      pt: documentPt,
      'pt-br': documentPtBr,
      tr: documentTr,
      zh: documentZh
    }
  ],
  [
    exportId,
    {
      en: exportEn,
      ru: exportRu,
      cs: exportCs,
      de: exportDe,
      es: exportEs,
      fr: exportFr,
      it: exportIt,
      ja: exportJa,
      pt: exportPt,
      'pt-br': exportPtBr,
      tr: exportTr,
      zh: exportZh
    }
  ],
  [
    driveId,
    {
      en: driveEn,
      ru: driveRu,
      cs: driveCs,
      de: driveDe,
      es: driveEs,
      fr: driveFr,
      it: driveIt,
      ja: driveJa,
      pt: drivePt,
      'pt-br': drivePtBr,
      tr: driveTr,
      zh: driveZh
    }
  ],
  [
    githubId,
    {
      en: githubEn,
      ru: githubRu,
      cs: githubCs,
      de: githubDe,
      es: githubEs,
      fr: githubFr,
      it: githubIt,
      pt: githubPt,
      'pt-br': githubPtBr,
      tr: githubTr,
      zh: githubZh
    }
  ],
  [
    gmailId,
    {
      en: gmailEn,
      ru: gmailRu,
      cs: gmailCs,
      de: gmailDe,
      es: gmailEs,
      fr: gmailFr,
      it: gmailIt,
      ja: gmailJa,
      pt: gmailPt,
      'pt-br': gmailPtBr,
      tr: gmailTr,
      zh: gmailZh
    }
  ],
  [
    hrId,
    {
      en: hrEn,
      ru: hrRu,
      cs: hrCs,
      de: hrDe,
      es: hrEs,
      fr: hrFr,
      it: hrIt,
      ja: hrJa,
      pt: hrPt,
      'pt-br': hrPtBr,
      tr: hrTr,
      zh: hrZh
    }
  ],
  [
    inventoryId,
    {
      en: inventoryEn,
      ru: inventoryRu,
      cs: inventoryCs,
      de: inventoryDe,
      es: inventoryEs,
      fr: inventoryFr,
      it: inventoryIt,
      ja: inventoryJa,
      pt: inventoryPt,
      'pt-br': inventoryPtBr,
      tr: inventoryTr,
      zh: inventoryZh
    }
  ],
  [
    leadId,
    {
      en: leadEn,
      ru: leadRu,
      cs: leadCs,
      de: leadDe,
      es: leadEs,
      fr: leadFr,
      it: leadIt,
      ja: leadJa,
      pt: leadPt,
      'pt-br': leadPtBr,
      tr: leadTr,
      zh: leadZh
    }
  ],
  [
    loveId,
    {
      en: loveEn,
      ru: loveRu,
      cs: loveCs,
      de: loveDe,
      es: loveEs,
      fr: loveFr,
      it: loveIt,
      ja: loveJa,
      pt: lovePt,
      'pt-br': lovePtBr,
      tr: loveTr,
      zh: loveZh
    }
  ],
  [
    notificationId,
    {
      en: notificationEn,
      ru: notificationRu,
      cs: notificationCs,
      de: notificationDe,
      es: notificationEs,
      fr: notificationFr,
      it: notificationIt,
      ja: notificationJa,
      pt: notificationPt,
      'pt-br': notificationPtBr,
      tr: notificationTr,
      zh: notificationZh
    }
  ],
  [
    onboardId,
    {
      en: onboardEn,
      ru: onboardRu,
      cs: onboardCs,
      de: onboardDe,
      es: onboardEs,
      fr: onboardFr,
      it: onboardIt,
      ja: onboardJa,
      pt: onboardPt,
      'pt-br': onboardPtBr,
      tr: onboardTr,
      zh: onboardZh
    }
  ],
  [
    preferenceId,
    {
      en: preferenceEn,
      ru: preferenceRu,
      cs: preferenceCs,
      de: preferenceDe,
      es: preferenceEs,
      fr: preferenceFr,
      it: preferenceIt,
      ja: preferenceJa,
      pt: preferencePt,
      'pt-br': preferencePtBr,
      tr: preferenceTr,
      zh: preferenceZh
    }
  ],
  [
    productsId,
    {
      en: productsEn,
      ru: productsRu,
      cs: productsCs,
      de: productsDe,
      es: productsEs,
      fr: productsFr,
      it: productsIt,
      ja: productsJa,
      pt: productsPt,
      'pt-br': productsPtBr,
      tr: productsTr,
      zh: productsZh
    }
  ],
  [
    recruitId,
    {
      en: recruitEn,
      ru: recruitRu,
      cs: recruitCs,
      de: recruitDe,
      es: recruitEs,
      fr: recruitFr,
      it: recruitIt,
      ja: recruitJa,
      pt: recruitPt,
      'pt-br': recruitPtBr,
      tr: recruitTr,
      zh: recruitZh
    }
  ],
  [
    requestId,
    {
      en: requestEn,
      ru: requestRu,
      cs: requestCs,
      de: requestDe,
      es: requestEs,
      fr: requestFr,
      it: requestIt,
      ja: requestJa,
      pt: requestPt,
      'pt-br': requestPtBr,
      tr: requestTr,
      zh: requestZh
    }
  ],
  [
    settingId,
    {
      en: settingEn,
      ru: settingRu,
      cs: settingCs,
      de: settingDe,
      es: settingEs,
      fr: settingFr,
      it: settingIt,
      ja: settingJa,
      pt: settingPt,
      'pt-br': settingPtBr,
      tr: settingTr,
      zh: settingZh
    }
  ],
  [
    supportId,
    {
      en: supportEn,
      ru: supportRu,
      cs: supportCs,
      de: supportDe,
      es: supportEs,
      fr: supportFr,
      it: supportIt,
      ja: supportJa,
      pt: supportPt,
      'pt-br': supportPtBr,
      tr: supportTr,
      zh: supportZh
    }
  ],
  [
    tagsId,
    {
      en: tagsEn,
      ru: tagsRu,
      cs: tagsCs,
      de: tagsDe,
      es: tagsEs,
      fr: tagsFr,
      it: tagsIt,
      ja: tagsJa,
      pt: tagsPt,
      'pt-br': tagsPtBr,
      tr: tagsTr,
      zh: tagsZh
    }
  ],
  [
    taskId,
    {
      en: taskEn,
      ru: taskRu,
      cs: taskCs,
      de: taskDe,
      es: taskEs,
      fr: taskFr,
      it: taskIt,
      ja: taskJa,
      pt: taskPt,
      'pt-br': taskPtBr,
      tr: taskTr,
      zh: taskZh
    }
  ],
  [
    telegramId,
    {
      en: telegramEn,
      ru: telegramRu,
      cs: telegramCs,
      de: telegramDe,
      es: telegramEs,
      fr: telegramFr,
      it: telegramIt,
      ja: telegramJa,
      pt: telegramPt,
      'pt-br': telegramPtBr,
      tr: telegramTr,
      zh: telegramZh
    }
  ],
  [
    templatesId,
    {
      en: templatesEn,
      ru: templatesRu,
      cs: templatesCs,
      de: templatesDe,
      es: templatesEs,
      fr: templatesFr,
      it: templatesIt,
      ja: templatesJa,
      pt: templatesPt,
      'pt-br': templatesPtBr,
      tr: templatesTr,
      zh: templatesZh
    }
  ],
  [
    trackerId,
    {
      en: trackerEn,
      ru: trackerRu,
      cs: trackerCs,
      de: trackerDe,
      es: trackerEs,
      fr: trackerFr,
      it: trackerIt,
      ja: trackerJa,
      pt: trackerPt,
      'pt-br': trackerPtBr,
      tr: trackerTr,
      zh: trackerZh
    }
  ],
  [
    trainingId,
    {
      en: trainingEn,
      ru: trainingRu,
      cs: trainingCs,
      de: trainingDe,
      es: trainingEs,
      fr: trainingFr,
      it: trainingIt,
      ja: trainingJa,
      pt: trainingPt,
      'pt-br': trainingPtBr,
      tr: trainingTr,
      zh: trainingZh
    }
  ],
  [
    viewId,
    {
      en: viewEn,
      ru: viewRu,
      cs: viewCs,
      de: viewDe,
      es: viewEs,
      fr: viewFr,
      it: viewIt,
      ja: viewJa,
      pt: viewPt,
      'pt-br': viewPtBr,
      tr: viewTr,
      zh: viewZh
    }
  ],
  [
    workbenchId,
    {
      en: workbenchEn,
      ru: workbenchRu,
      cs: workbenchCs,
      de: workbenchDe,
      es: workbenchEs,
      fr: workbenchFr,
      it: workbenchIt,
      ja: workbenchJa,
      pt: workbenchPt,
      'pt-br': workbenchPtBr,
      tr: workbenchTr,
      zh: workbenchZh
    }
  ],
  [
    timeId,
    {
      en: timeEn,
      ru: timeRu,
      cs: timeCs,
      de: timeDe,
      es: timeEs,
      fr: timeFr,
      it: timeIt,
      ja: timeJa,
      pt: timePt,
      'pt-br': timePtBr,
      tr: timeTr,
      zh: timeZh
    }
  ],
  [
    surveyId,
    {
      en: surveyEn,
      ru: surveyRu,
      cs: surveyCs,
      de: surveyDe,
      es: surveyEs,
      fr: surveyFr,
      it: surveyIt,
      ja: surveyJa,
      pt: surveyPt,
      'pt-br': surveyPtBr,
      tr: surveyTr,
      zh: surveyZh
    }
  ],
  [
    cardId,
    {
      en: cardEn,
      ru: cardRu,
      cs: cardCs,
      de: cardDe,
      es: cardEs,
      fr: cardFr,
      it: cardIt,
      ja: cardJa,
      pt: cardPt,
      'pt-br': cardPtBr,
      tr: cardTr,
      zh: cardZh
    }
  ],
  [
    mailId,
    {
      en: mailEn,
      ru: mailRu,
      cs: mailCs,
      de: mailDe,
      es: mailEs,
      fr: mailFr,
      it: mailIt,
      ja: mailJa,
      pt: mailPt,
      'pt-br': mailPtBr,
      tr: mailTr,
      zh: mailZh
    }
  ],
  [
    workflowId,
    {
      en: workflowEn,
      ru: workflowRu,
      cs: workflowCs,
      de: workflowDe,
      es: workflowEs,
      fr: workflowFr,
      it: workflowIt,
      ja: workflowJa,
      pt: workflowPt,
      'pt-br': workflowPtBr,
      tr: workflowTr,
      zh: workflowZh
    }
  ]
])
