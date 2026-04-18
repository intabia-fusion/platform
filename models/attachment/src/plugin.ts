//
// Copyright © 2020 Anticrm Platform Contributors.
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

import type { ActivityMessage, ActivityMessagesFilter } from '@intabiafusion/activity'
import { attachmentId } from '@intabiafusion/attachment'
import attachment from '@intabiafusion/attachment-resources/src/plugin'
import type { Ref, Doc } from '@intabiafusion/core'
import type { IntlString, Resource } from '@intabiafusion/platform'
import { mergeIds } from '@intabiafusion/platform'
import type { AnyComponent } from '@intabiafusion/ui/src/types'
import type { ActionCategory } from '@intabiafusion/view'

export default mergeIds(attachmentId, attachment, {
  component: {
    AttachmentPresenter: '' as AnyComponent,
    PreviewWidget: '' as AnyComponent,
    PreviewPopupActions: '' as AnyComponent
  },
  string: {
    AddAttachment: '' as IntlString,
    File: '' as IntlString,
    Name: '' as IntlString,
    Size: '' as IntlString,
    Type: '' as IntlString,
    Photo: '' as IntlString,
    Date: '' as IntlString,
    LastModified: '' as IntlString,
    SavedAttachments: '' as IntlString,
    Description: '' as IntlString,
    PinAttachment: '' as IntlString,
    UnPinAttachment: '' as IntlString,
    FilterAttachments: '' as IntlString,
    RemovedAttachment: '' as IntlString,
    ContentType: '' as IntlString
  },
  ids: {
    AttachmentsActivityFilter: '' as Ref<ActivityMessagesFilter>
  },
  category: {
    Attachments: '' as Ref<ActionCategory>
  },
  filter: {
    AttachmentsFilter: '' as Resource<(message: ActivityMessage, _class?: Ref<Doc>) => boolean>
  }
})
