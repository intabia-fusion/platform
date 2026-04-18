//
// Copyright © 2022, 2023 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import type { Doc, Ref } from '@intabiafusion/core'
import {} from '@intabiafusion/core'
import { documentId } from '@intabiafusion/document'
import document from '@intabiafusion/document-resources/src/plugin'
import { type ObjectSearchCategory, type ObjectSearchFactory } from '@intabiafusion/model-presentation'
import { type IntlString, mergeIds, type Resource } from '@intabiafusion/platform'
import { type TagCategory } from '@intabiafusion/tags'
import { type AnyComponent } from '@intabiafusion/ui/src/types'
import type { Action, ActionCategory, ViewAction, Viewlet } from '@intabiafusion/view'

export default mergeIds(documentId, document, {
  component: {
    Documents: '' as AnyComponent,
    DocumentPresenter: '' as AnyComponent,
    DocumentInlineEditor: '' as AnyComponent,
    NotificationDocumentPresenter: '' as AnyComponent,
    TeamspaceSpacePresenter: '' as AnyComponent,
    Move: '' as AnyComponent,
    DocumentToDoPresenter: '' as AnyComponent,
    DocumentIcon: '' as AnyComponent
  },
  completion: {
    DocumentQuery: '' as Resource<ObjectSearchFactory>,
    DocumentQueryCategory: '' as Ref<ObjectSearchCategory>
  },
  actionImpl: {
    CreateChildDocument: '' as ViewAction,
    CreateDocument: '' as ViewAction,
    EditTeamspace: '' as ViewAction,
    LockContent: '' as ViewAction,
    UnlockContent: '' as ViewAction
  },
  action: {
    PublicLink: '' as Ref<Action<Doc, any>>,
    LockContent: '' as Ref<Action<Doc, any>>,
    UnlockContent: '' as Ref<Action<Doc, any>>
  },
  function: {
    CanLockDocument: '' as Resource<(doc?: Doc | Doc[]) => Promise<boolean>>,
    CanUnlockDocument: '' as Resource<(doc?: Doc | Doc[]) => Promise<boolean>>
  },
  viewlet: {
    TeamspaceTable: '' as Ref<Viewlet>
  },
  category: {
    Document: '' as Ref<ActionCategory>,
    Other: '' as Ref<TagCategory>
  },
  string: {
    ConfigDescription: '' as IntlString,
    ParentDocument: '' as IntlString,
    ChildDocument: '' as IntlString,
    LockedBy: '' as IntlString
  }
})
