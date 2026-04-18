//
// Copyright © 2023 Hardcore Engineering Inc.
//
//

import type { Plugin, Resource } from '@intabiafusion/platform'
import { plugin } from '@intabiafusion/platform'
import { TriggerFunc } from '@intabiafusion/server-core'
import { TypeMatchFuncResource } from '@intabiafusion/server-notification'
import { Presenter } from '@intabiafusion/server-activity'

/**
 * @public
 */
export const serverDocumentsId = 'server-documents' as Plugin

/**
 * @public
 */
export default plugin(serverDocumentsId, {
  trigger: {
    OnDocEnteredNonActionableState: '' as Resource<TriggerFunc>,
    OnDocPlannedEffectiveDateChanged: '' as Resource<TriggerFunc>,
    OnDocApprovalRequestApproved: '' as Resource<TriggerFunc>,
    OnDocHasBecomeEffective: '' as Resource<TriggerFunc>,
    OnDocTitleChanged: '' as Resource<TriggerFunc>
  },
  function: {
    ControlledDocumentUrlPresenter: '' as Resource<Presenter>,
    CoAuthorsTypeMatch: '' as TypeMatchFuncResource
  }
})
