//
// Copyright © 2020 Anticrm Platform Contributors.
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

import activity, { type ActivityMessage, type DocUpdateMessage } from '@hcengineering/activity'
import attachment, { type Attachment } from '@hcengineering/attachment'
import core, { type Markup } from '@hcengineering/core'
import { type IntlString, type Resources } from '@hcengineering/platform'
import { PDFViewer, deleteFile, getClient, uploadFile } from '@hcengineering/presentation'

import AccordionEditor from './components/AccordionEditor.svelte'
import AddAttachment from './components/AddAttachment.svelte'
import AttachmentDocList from './components/AttachmentDocList.svelte'
import AttachmentDroppable from './components/AttachmentDroppable.svelte'
import AttachmentList from './components/AttachmentList.svelte'
import AttachmentGroup from './components/AttachmentGroup.svelte'
import AttachmentPreview from './components/AttachmentPreview.svelte'
import AttachmentRefInput from './components/AttachmentRefInput.svelte'
import AttachmentStyleBoxCollabEditor from './components/AttachmentStyleBoxCollabEditor.svelte'
import AttachmentStyleBoxEditor from './components/AttachmentStyleBoxEditor.svelte'
import AttachmentStyledBox from './components/AttachmentStyledBox.svelte'
import Attachments from './components/Attachments.svelte'
import AttachmentsGrid from './components/AttachmentsGrid.svelte'
import AttachmentsPresenter from './components/AttachmentsPresenter.svelte'
import AttachmentsTooltip from './components/AttachmentsTooltip.svelte'
import Photos from './components/Photos.svelte'
import PreviewWidget from './components/PreviewWidget.svelte'
import PreviewPopupActions from './components/PreviewPopupActions.svelte'
import DrawingPresenter from './components/DrawingPresenter.svelte'
import AttachmentSimplePreview from './components/AttachmentSimplePreview.svelte'
import DraftAttachmentsEditor from './components/DraftAttachmentsEditor.svelte'
import AttachmentLabel from './components/file/AttachmentLabel.svelte'
import AttachmentTile from './components/file/AttachmentTile.svelte'
import AttachmentTiles from './components/AttachmentTiles.svelte'
import LinkCard from './components/file/LinkCard.svelte'
import AudioAttachment from './components/file/AudioAttachment.svelte'
import FileCard from './components/file/FileCard.svelte'
import AttachmentMiniPreview from './components/file/MiniPreview.svelte'
import VoiceAttachment from './components/file/VoiceAttachment.svelte'
import { attachmentsApplier } from './utils'

export type * from './types'
export type { UploadQueue } from './components/file/uploads'
export * from './stores'
export * from './utils'
export * from './format'
export { pageImage, pictureImage } from './components/file/blob'

export {
  AccordionEditor,
  AddAttachment,
  AttachmentDocList,
  DraftAttachmentsEditor,
  AttachmentDroppable,
  AttachmentList,
  AttachmentGroup,
  AttachmentPreview,
  AttachmentRefInput,
  AttachmentStyleBoxCollabEditor,
  AttachmentStyleBoxEditor,
  AttachmentStyledBox,
  Attachments,
  AttachmentsGrid,
  AttachmentsPresenter,
  AttachmentsTooltip,
  AttachmentLabel,
  AttachmentTile,
  AttachmentTiles,
  LinkCard,
  AudioAttachment,
  FileCard,
  VoiceAttachment,
  AttachmentSimplePreview,
  AttachmentMiniPreview
}

export async function AddAttachmentToSaved (attach: Attachment): Promise<void> {
  const client = getClient()

  // A menu that missed the saved state must not save the file twice.
  const current = await client.findOne(attachment.class.SavedAttachments, { attachedTo: attach._id })
  if (current !== undefined) return
  await client.createDoc(attachment.class.SavedAttachments, core.space.Workspace, {
    attachedTo: attach._id
  })
}

export async function DeleteAttachmentFromSaved (attach: Attachment): Promise<void> {
  const client = getClient()

  // Every copy: a file saved twice before must leave the list at once.
  const saved = await client.findAll(attachment.class.SavedAttachments, { attachedTo: attach._id })
  for (const it of saved) {
    await client.remove(it)
  }
}

export async function DeleteAttachment (attach: Attachment): Promise<void> {
  const client = getClient()

  await client.removeCollection(
    attach._class,
    attach.space,
    attach._id,
    attach.attachedTo,
    attach.attachedToClass,
    'attachments'
  )
}

export function attachmentsFilter (message: ActivityMessage): boolean {
  if (message._class === activity.class.DocUpdateMessage) {
    return (message as DocUpdateMessage).objectClass === attachment.class.Attachment
  }

  return false
}

export default async (): Promise<Resources> => ({
  filter: {
    AttachmentsFilter: attachmentsFilter
  },
  component: {
    AttachmentsPresenter,
    AttachmentPresenter: AttachmentLabel,
    // The model keeps the old id: changing it would need a model upgrade of every workspace.
    VoiceAttachmentPresenter: VoiceAttachment,
    Attachments,
    DraftAttachmentsEditor,
    DrawingPresenter,
    Photos,
    PDFViewer,
    PreviewWidget,
    PreviewPopupActions
  },
  helper: {
    UploadFile: uploadFile,
    DeleteFile: deleteFile
  },
  actionImpl: {
    AddAttachmentToSaved,
    DeleteAttachmentFromSaved,
    DeleteAttachment
  },
  function: {
    AttachmentsApplier: attachmentsApplier
  }
})

export interface AccordionItem {
  id: string
  label: IntlString
  tooltip: IntlString
  content: Markup
  state: 'opened' | 'closed'
  placeholder?: IntlString
}
