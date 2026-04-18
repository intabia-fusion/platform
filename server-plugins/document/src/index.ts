//
// Copyright © 2023 Hardcore Engineering Inc.
//
//

import { Doc } from '@intabiafusion/core'
import type { Plugin, Resource } from '@intabiafusion/platform'
import { plugin } from '@intabiafusion/platform'
import { ObjectDDParticipantFunc } from '@intabiafusion/server-core'
import { Presenter } from '@intabiafusion/server-activity'

/**
 * @public
 */
export const serverDocumentId = 'server-document' as Plugin

/**
 * @public
 */
export default plugin(serverDocumentId, {
  function: {
    DocumentUrlPresenter: '' as Resource<Presenter>,
    DocumentLinkIdProvider: '' as Resource<(doc: Doc) => Promise<string>>,
    FindChildDocuments: '' as Resource<ObjectDDParticipantFunc>
  }
})
