//
// Copyright © 2023 Hardcore Engineering Inc.
//
//

import { type Builder } from '@intabiafusion/model'

import core, { type Class, type Doc } from '@intabiafusion/core'
import document from '@intabiafusion/document'
import serverCore, { type ObjectDDParticipant } from '@intabiafusion/server-core'
import serverDocument from '@intabiafusion/server-document'
import serverActivity from '@intabiafusion/server-activity'
import serverView from '@intabiafusion/server-view'

export { serverDocumentId } from '@intabiafusion/server-document'

export function createModel (builder: Builder): void {
  builder.mixin(document.class.Document, core.class.Class, serverActivity.mixin.UrlPresenter, {
    presenter: serverDocument.function.DocumentUrlPresenter
  })

  builder.mixin(document.class.Document, core.class.Class, serverView.mixin.ServerLinkIdProvider, {
    encode: serverDocument.function.DocumentLinkIdProvider
  })

  builder.mixin(document.class.Document, core.class.Class, serverCore.mixin.SearchPresenter, {
    iconConfig: {
      component: document.component.DocumentSearchIcon,
      fields: [['icon'], ['color']]
    },
    title: [['title']]
  })

  builder.mixin<Class<Doc>, ObjectDDParticipant>(
    document.class.Document,
    core.class.Class,
    serverCore.mixin.ObjectDDParticipant,
    {
      collectDocs: serverDocument.function.FindChildDocuments
    }
  )
}
