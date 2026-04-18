//
// Copyright © 2023 Hardcore Engineering Inc.
//
import { type Builder } from '@intabiafusion/model'
import core from '@intabiafusion/core'
import serverCore from '@intabiafusion/server-core'
import { RequestStatus } from '@intabiafusion/request'
import documents, { DocumentState } from '@intabiafusion/controlled-documents'
import serverDocuments from '@intabiafusion/server-controlled-documents'
import serverNotification from '@intabiafusion/server-notification'
import notification from '@intabiafusion/notification'
import serverActivity from '@intabiafusion/server-activity'

export { serverDocumentsId } from '@intabiafusion/server-controlled-documents/src/index'

export function createModel (builder: Builder): void {
  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverDocuments.trigger.OnDocEnteredNonActionableState,
    txMatch: {
      _class: core.class.TxUpdateDoc,
      objectClass: documents.class.ControlledDocument,
      'operations.state': { $in: [DocumentState.Deleted, DocumentState.Obsolete, DocumentState.Archived] }
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverDocuments.trigger.OnDocPlannedEffectiveDateChanged,
    txMatch: {
      _class: core.class.TxUpdateDoc,
      objectClass: documents.class.ControlledDocument
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverDocuments.trigger.OnDocApprovalRequestApproved,
    txMatch: {
      _class: core.class.TxUpdateDoc,
      attachedToClass: documents.class.ControlledDocument,
      objectClass: documents.class.DocumentApprovalRequest,
      'operations.status': RequestStatus.Completed
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverDocuments.trigger.OnDocHasBecomeEffective,
    txMatch: {
      _class: core.class.TxUpdateDoc,
      objectClass: documents.class.ControlledDocument,
      'operations.state': DocumentState.Effective
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverDocuments.trigger.OnDocTitleChanged,
    txMatch: {
      _class: core.class.TxUpdateDoc,
      objectClass: documents.class.ControlledDocument
    }
  })

  builder.mixin(documents.class.DocumentMeta, core.class.Class, serverCore.mixin.SearchPresenter, {
    iconConfig: {
      component: documents.component.DocumentIcon
    },
    title: [['title']]
  })

  builder.mixin(documents.class.ControlledDocument, core.class.Class, serverActivity.mixin.UrlPresenter, {
    presenter: serverDocuments.function.ControlledDocumentUrlPresenter
  })

  builder.mixin(
    documents.notification.CoAuthorsNotification,
    notification.class.NotificationType,
    serverNotification.mixin.TypeMatch,
    {
      match: serverDocuments.function.CoAuthorsTypeMatch
    }
  )
}
