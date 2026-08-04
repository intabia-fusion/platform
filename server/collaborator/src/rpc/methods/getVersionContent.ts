//
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

import {
  type GetVersionContentRequest,
  type GetVersionContentResponse,
  decodeDocumentId
} from '@hcengineering/collaborator-client'
import { loadCollabJson } from '@hcengineering/collaboration'
import { MeasureContext } from '@hcengineering/core'
import { Context } from '../../context'
import { RpcMethodParams } from '../rpc'

// reads a stored json snapshot directly, unlike getContent which returns the live document
export async function getVersionContent (
  ctx: MeasureContext,
  context: Context,
  documentName: string,
  payload: GetVersionContentRequest,
  params: RpcMethodParams
): Promise<GetVersionContentResponse> {
  const { storageAdapter } = params
  const { blobId } = payload
  const { documentId } = decodeDocumentId(documentName)

  // the blob must belong to the requested document
  const prefix = `${documentId.objectId}-${documentId.objectAttr}-`
  if (!blobId.startsWith(prefix)) {
    throw new Error('Blob does not belong to the document')
  }

  const markup = await loadCollabJson(ctx, storageAdapter, context.wsIds, blobId)
  if (markup === undefined) {
    throw new Error('Version not found')
  }

  return { content: markup }
}
