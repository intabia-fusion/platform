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

import { type MeasureContext } from '@hcengineering/core'
import { extractToken } from '@hcengineering/server-client'
import { decodeToken, type Token } from '@hcengineering/server-token'
import { Router } from 'express'
import { validate } from 'uuid'
import { type Datalake } from '../datalake'
import { type PublicFileAccess } from '../datalake/publicFileAccess'
import { handleBlobGet, handleBlobHead } from './blob'

/** Guest reads are isolated from ordinary blob, metadata and upload routes. */
export function publicBlobRouter (
  ctx: MeasureContext,
  datalake: Datalake,
  registry: Pick<PublicFileAccess, 'canRead'>
): Router {
  const router = Router()
  router.all('/:workspace/:linkId/:name/:filename?', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      res.sendStatus(405)
      return
    }
    let token: Token | undefined
    if (req.headers.authorization !== undefined) {
      token = extractToken({ authorization: req.headers.authorization })
    } else {
      const cookie = req.headers.cookie
        ?.split(';')
        .map((it) => it.trim())
        .find((it) => it.startsWith('public-file-token='))
        ?.slice('public-file-token='.length)
      try {
        if (cookie !== undefined) token = decodeToken(decodeURIComponent(cookie))
      } catch {
        // Malformed or expired credentials are ordinary authorization failures.
      }
    }
    if (token?.extra?.guest !== 'true') {
      res.sendStatus(401)
      return
    }
    const { workspace, linkId, name } = req.params
    if (
      !validate(workspace) ||
      token.workspace !== workspace ||
      token.extra.linkId !== linkId ||
      linkId.length > 255 ||
      name.length > 255
    ) {
      res.sendStatus(404)
      return
    }
    void (async () => {
      if (!(await registry.canRead(workspace, linkId, name))) {
        res.sendStatus(404)
        return
      }
      // The handlers apply private revalidation only after this authorization check.
      res.locals.publicFile = true
      if (req.method === 'HEAD') await handleBlobHead(ctx, req, res, datalake)
      else await handleBlobGet(ctx, req, res, datalake)
    })().catch(next)
  })
  return router
}
