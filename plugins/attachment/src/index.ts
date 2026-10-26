//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2024 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
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

import type { AttachedDoc, Blob, BlobMetadata, Class, Doc, Ref } from '@hcengineering/core'
import type { Asset, Plugin } from '@hcengineering/platform'
import { IntlString, plugin, Resource } from '@hcengineering/platform'
import type { Preference } from '@hcengineering/preference'
import { AnyComponent } from '@hcengineering/ui'
import { Widget } from '@hcengineering/workbench'

export * from './analytics'
export * from './category'

/**
 * @public
 */
export interface Attachment extends AttachedDoc {
  name: string
  file: Ref<Blob>
  size: number
  type: string
  lastModified: number
  description?: string
  pinned?: boolean // If defined and true, will be shown in top of attachments collection

  readonly?: boolean // If readonly, user will not be able to remove or modify this attachment

  metadata?: AttachmentMetadata
}

/**
 * @public
 */
export interface DraftAttachment {
  _id?: Ref<Attachment>
  name?: string
  file: Ref<Blob>
  size?: number
  type?: string
}

/**
 * @public
 */
export type AttachmentValue = Ref<Blob> | Ref<Attachment> | DraftAttachment | Attachment

/**
 * @public
 */
export type Embedding = Attachment

/**
 * @public
 */
export type AttachmentMetadata = BlobMetadata

/**
 * @public
 */
export type Photo = Attachment

/**
 * @public
 */
export interface SavedAttachments extends Preference {
  attachedTo: Ref<Attachment>
}

/**
 * @public
 */
export interface Drawing extends Doc {
  parent: Ref<Doc>
  parentClass: Ref<Class<Doc>>
  content?: string
}

/**
 * @public
 */
export const attachmentId = 'attachment' as Plugin

export default plugin(attachmentId, {
  component: {
    Attachments: '' as AnyComponent,
    DraftAttachmentsEditor: '' as AnyComponent,
    Photos: '' as AnyComponent,
    AttachmentsPresenter: '' as AnyComponent,
    DrawingPresenter: '' as AnyComponent,
    PDFViewer: '' as AnyComponent
  },
  icon: {
    Attachment: '' as Asset,
    FileBrowser: '' as Asset,
    BrokenImage: '' as Asset
  },
  class: {
    Attachment: '' as Ref<Class<Attachment>>,
    Embedding: '' as Ref<Class<Embedding>>,
    Drawing: '' as Ref<Class<Drawing>>,
    Photo: '' as Ref<Class<Photo>>,
    SavedAttachments: '' as Ref<Class<SavedAttachments>>
  },
  helper: {
    UploadFile: '' as Resource<(file: File) => Promise<{ uuid: Ref<Blob>, metadata: Record<string, any> }>>,
    DeleteFile: '' as Resource<(id: string) => Promise<void>>
  },
  ids: {
    PreviewWidget: '' as Ref<Widget>
  },
  string: {
    UploadDropFilesHere: '' as IntlString,
    Files: '' as IntlString,
    NoFiles: '' as IntlString,
    NoParticipants: '' as IntlString,
    ShowMoreAttachments: '' as IntlString,
    FormatImage: '' as IntlString,
    FormatVideo: '' as IntlString,
    FormatGif: '' as IntlString,
    FormatVoice: '' as IntlString,
    VoiceMessage: '' as IntlString,
    FormatMusic: '' as IntlString,
    FormatPdf: '' as IntlString,
    FormatDocument: '' as IntlString,
    FormatSpreadsheet: '' as IntlString,
    FormatPresentation: '' as IntlString,
    FormatArchive: '' as IntlString,
    FormatText: '' as IntlString,
    FormatApplication: '' as IntlString,
    FormatOther: '' as IntlString,
    FormatLinkPreview: '' as IntlString,
    DeleteFile: '' as IntlString,
    Attachments: '' as IntlString,
    OpenInWindow: '' as IntlString,
    Embeddings: '' as IntlString,
    Transcribing: '' as IntlString
  },
  function: {
    AttachmentsApplier: '' as Resource<any>
  }
})
