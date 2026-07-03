//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { Analytics } from '@hcengineering/analytics'
import { MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import { type Request, type Response } from 'express'

import { type Datalake } from '../datalake'
import { type LimitsState } from '../limits'
import { type RequestWithAuth } from '../middleware'
import { type TemporaryDir } from '../tempdir'

export async function handleS3CreateBlobParams (
  ctx: MeasureContext,
  req: Request,
  res: Response,
  datalake: Datalake
): Promise<void> {
  const workspace = req.params.workspace as WorkspaceUuid
  const { location, bucket } = await datalake.selectStorage(ctx, workspace)
  res.status(200).json({ location, bucket: bucket.bucket })
}

export async function handleS3CreateBlob (
  ctx: MeasureContext,
  req: Request,
  res: Response,
  datalake: Datalake,
  _tempDir?: TemporaryDir,
  limitsState?: LimitsState
): Promise<void> {
  const { name } = req.params
  const workspace = req.params.workspace as WorkspaceUuid
  const filename = req.body.filename as string
  if (filename == null) {
    res.status(400).send('missing filename')
    return
  }

  // Block user uploads when workspace disk or payment limit is exhausted (service tokens bypass).
  const isServiceToken = (req as RequestWithAuth).token?.extra?.service !== undefined
  if (!isServiceToken && limitsState?.isExhausted(workspace) === true) {
    res.status(413).json({ message: 'Resource limit exceeded' })
    return
  }

  try {
    const head = await datalake.create(ctx, workspace, name, filename)
    if (head != null && !isServiceToken) {
      // etag is content-derived — stable ref for retry dedup in billing
      limitsState?.sendStorageDelta(ctx, workspace, head.size, head.etag)
    }
    res.status(200).send()
  } catch (err: any) {
    Analytics.handleError(err)
    const error = err instanceof Error ? err.message : String(err)
    ctx.error('failed to create blob', { workspace, name, error })
    res.status(500).send()
  }
}
