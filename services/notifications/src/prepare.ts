import { addLocation } from '@hcengineering/platform'
import { serverNotificationId } from '@hcengineering/server-notification'
import { serverChunterId } from '@hcengineering/server-chunter'
import { serverDocumentsId as serverControlledDocumentsId } from '@hcengineering/server-controlled-documents'
import { serverGmailId } from '@hcengineering/server-gmail'
import { serverTelegramId } from '@hcengineering/server-telegram'
import { serverTrainingId } from '@hcengineering/server-training'
import { serverTimeId } from '@hcengineering/server-time'
import { serverRequestId } from '@hcengineering/server-request'

export function prepare (): void {
  addLocation(serverNotificationId, () => import('@hcengineering/server-notification-resources'))
  addLocation(serverChunterId, () => import('@hcengineering/server-chunter-resources'))
  addLocation(serverControlledDocumentsId, () => import('@hcengineering/server-controlled-documents-resources'))
  addLocation(serverGmailId, () => import('@hcengineering/server-gmail-resources'))
  addLocation(serverTelegramId, () => import('@hcengineering/server-telegram-resources'))
  addLocation(serverTrainingId, () => import('@hcengineering/server-training-resources'))
  addLocation(serverTimeId, () => import('@hcengineering/server-time-resources'))
  addLocation(serverRequestId, () => import('@hcengineering/server-request-resources'))
}
