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

import { systemAccountUuid } from '@hcengineering/core'
import { extractToken } from '@hcengineering/server-client'
import { Router } from 'express'
import { validate } from 'uuid'
import { type PublicFileAccess } from '../datalake/publicFileAccess'
import { ApiError } from '../error'

/** Control API only: it does not enable guest downloads. */
export function publicFileAccessRouter (registry: PublicFileAccess): Router {
  const router = Router()
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    const token = extractToken(req.headers)
    if (
      token?.account !== systemAccountUuid ||
      token.extra?.service !== 'public-file-access' ||
      token.extra?.guest === 'true' ||
      token.extra?.readonly === 'true'
    ) {
      res.sendStatus(403)
      return
    }
    next()
  })
  router.use('/:workspace/:linkId', (req, _res, next) => {
    if (!validate(req.params.workspace) || !validName(req.params.linkId)) {
      next(new ApiError(400, 'Invalid workspace or link'))
      return
    }
    next()
  })
  router.put('/:workspace/:linkId', (req, res, next) => {
    const { revision, blobs } = req.body ?? {}
    if (!Array.isArray(blobs) || blobs.length > 10000 || !blobs.every(validName)) {
      next(new ApiError(400, 'Invalid blob list'))
      return
    }
    void registry
      .replace(req.params.workspace, req.params.linkId, revision, blobs)
      .then(() => res.sendStatus(204))
      .catch(next)
  })
  router.delete('/:workspace/:linkId', (req, res, next) => {
    void registry
      .revoke(req.params.workspace, req.params.linkId, req.body?.revision)
      .then(() => res.sendStatus(204))
      .catch(next)
  })
  router.get('/:workspace/:linkId/files/:blobId', (req, res, next) => {
    if (!validName(req.params.blobId)) {
      next(new ApiError(400, 'Invalid blob'))
      return
    }
    void registry
      .canRead(req.params.workspace, req.params.linkId, req.params.blobId)
      .then((allowed) => res.json({ allowed }))
      .catch(next)
  })
  return router
}

function validName (value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255
}
