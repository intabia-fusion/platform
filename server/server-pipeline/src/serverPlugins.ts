import { addLocation } from '@intabiafusion/platform'
import { serverActivityId } from '@intabiafusion/server-activity'
import { serverAttachmentId } from '@intabiafusion/server-attachment'
import { serverCardId } from '@intabiafusion/server-card'
import { serverCalendarId } from '@intabiafusion/server-calendar'
import { serverChunterId } from '@intabiafusion/server-chunter'
import { serverCollaborationId } from '@intabiafusion/server-collaboration'
import { serverContactId } from '@intabiafusion/server-contact'
import { serverDocumentsId } from '@intabiafusion/server-controlled-documents'
import { serverDocumentId } from '@intabiafusion/server-document'
import { serverDriveId } from '@intabiafusion/server-drive'
import { serverGithubId } from '@intabiafusion/server-github'
import { serverGmailId } from '@intabiafusion/server-gmail'
import { serverGuestId } from '@intabiafusion/server-guest'
import { serverHrId } from '@intabiafusion/server-hr'
import { serverInventoryId } from '@intabiafusion/server-inventory'
import { serverLeadId } from '@intabiafusion/server-lead'
import { serverLoveId } from '@intabiafusion/server-love'
import { serverNotificationId } from '@intabiafusion/server-notification'
import { serverRecruitId } from '@intabiafusion/server-recruit'
import { serverRequestId } from '@intabiafusion/server-request'
import { serverSettingId } from '@intabiafusion/server-setting'
import { serverTagsId } from '@intabiafusion/server-tags'
import { serverTaskId } from '@intabiafusion/server-task'
import { serverTelegramId } from '@intabiafusion/server-telegram'
import { serverTimeId } from '@intabiafusion/server-time'
import { serverTrackerId } from '@intabiafusion/server-tracker'
import { serverTrainingId } from '@intabiafusion/server-training'
import { serverViewId } from '@intabiafusion/server-view'
import { serverAiBotId } from '@intabiafusion/server-ai-bot'
import { serverProcessId } from '@intabiafusion/server-process'

export function registerServerPlugins (): void {
  addLocation(serverActivityId, () => import('@intabiafusion/server-activity-resources'))
  addLocation(serverAttachmentId, () => import('@intabiafusion/server-attachment-resources'))
  addLocation(serverCollaborationId, () => import('@intabiafusion/server-collaboration-resources'))
  addLocation(serverContactId, () => import('@intabiafusion/server-contact-resources'))
  addLocation(serverNotificationId, () => import('@intabiafusion/server-notification-resources'))
  addLocation(serverSettingId, () => import('@intabiafusion/server-setting-resources'))
  addLocation(serverChunterId, () => import('@intabiafusion/server-chunter-resources'))
  addLocation(serverInventoryId, () => import('@intabiafusion/server-inventory-resources'))
  addLocation(serverLeadId, () => import('@intabiafusion/server-lead-resources'))
  addLocation(serverRecruitId, () => import('@intabiafusion/server-recruit-resources'))
  addLocation(serverTaskId, () => import('@intabiafusion/server-task-resources'))
  addLocation(serverTrackerId, () => import('@intabiafusion/server-tracker-resources'))
  addLocation(serverTagsId, () => import('@intabiafusion/server-tags-resources'))
  addLocation(serverCardId, () => import('@intabiafusion/server-card-resources'))
  addLocation(serverCalendarId, () => import('@intabiafusion/server-calendar-resources'))
  addLocation(serverGmailId, () => import('@intabiafusion/server-gmail-resources'))
  addLocation(serverTelegramId, () => import('@intabiafusion/server-telegram-resources'))
  addLocation(serverRequestId, () => import('@intabiafusion/server-request-resources'))
  addLocation(serverViewId, () => import('@intabiafusion/server-view-resources'))
  addLocation(serverHrId, () => import('@intabiafusion/server-hr-resources'))
  addLocation(serverLoveId, () => import('@intabiafusion/server-love-resources'))
  addLocation(serverGuestId, () => import('@intabiafusion/server-guest-resources'))
  addLocation(serverDocumentId, () => import('@intabiafusion/server-document-resources'))
  addLocation(serverTimeId, () => import('@intabiafusion/server-time-resources'))
  addLocation(serverDriveId, () => import('@intabiafusion/server-drive-resources'))
  addLocation(serverDocumentsId, () => import('@intabiafusion/server-controlled-documents-resources'))
  addLocation(serverTrainingId, () => import('@intabiafusion/server-training-resources'))
  addLocation(serverGithubId, () => import('@intabiafusion/server-github-resources'))
  addLocation(serverAiBotId, () => import('@intabiafusion/server-ai-bot-resources'))
  addLocation(serverProcessId, () => import('@intabiafusion/server-process-resources'))
}
