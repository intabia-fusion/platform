//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { Analytics } from '@hcengineering/analytics'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import { type WorkspaceInfoWithStatus, MeasureContext, systemAccountUuid } from '@hcengineering/core'
import { extractToken, readToken } from '@hcengineering/server-client'
import { Token } from '@hcengineering/server-token'
import { type Response, type Request, type NextFunction, type RequestHandler, type ErrorRequestHandler } from 'express'
import { LRUCache } from 'lru-cache'
import { BadRequestError, HttpError, ToolError } from './error'

export interface KeepAliveOptions {
  timeout: number
  max: number
}

export interface RequestWithAuth extends Request {
  token?: Token
}

// How long a blob that ffmpeg or LibreOffice failed on is refused, and how many are kept.
const REFUSAL_TTL = 60 * 1000
const REFUSAL_MAX = 1000

export const keepAlive = (options: KeepAliveOptions): RequestHandler => {
  const { timeout, max } = options
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Keep-Alive', `timeout=${timeout}, max=${max}`)
    next()
  }
}

export const withAdminAuthorization = (req: RequestWithAuth, res: Response, next: NextFunction): void => {
  try {
    const token = extractToken(req.headers)
    if (token == null || !(token.account === systemAccountUuid || token.extra?.admin === 'true')) {
      throw new HttpError(401, 'Unauthorized')
    }
    req.token = token

    next()
  } catch (err: any) {
    next(err)
  }
}

export const withAuthorization = (req: RequestWithAuth, res: Response, next: NextFunction): void => {
  try {
    const token = extractToken(req.headers)
    if (token == null || token.extra?.guest === 'true' || token.extra?.readonly === 'true') {
      throw new HttpError(401, 'Unauthorized')
    }
    req.token = token

    next()
  } catch (err: any) {
    next(err)
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface WorkspaceAccessOptions {
  accountsUrl: string
  /** How long a positive membership answer stays cached. */
  allowTtlMs: number
  /** Shorter than the positive one: a deny may be a just-added member or an account hiccup. */
  denyTtlMs: number
}

/**
 * Gates a route by the workspace in its url. A token carrying a workspace (Bearer, or the workspace
 * cookie the front and desktop set) is checked locally; the account cookie the browser sends to
 * /_preview has no workspace, so its membership is asked from account and cached.
 */
export const createWorkspaceAccess = (options: WorkspaceAccessOptions): RequestHandler => {
  const cache = new LRUCache<string, boolean>({ max: REFUSAL_MAX, ttl: REFUSAL_TTL })

  return (req: RequestWithAuth, _res: Response, next: NextFunction) => {
    const workspace: string | undefined = req.params.workspace
    const token = req.token
    if (token === undefined || workspace === undefined) {
      next(new HttpError(401, 'Unauthorized'))
      return
    }

    if (token.account === systemAccountUuid || token.extra?.admin === 'true') {
      next()
      return
    }

    if (token.workspace !== undefined) {
      if (token.workspace === workspace) {
        next()
      } else {
        next(new HttpError(401, 'Unauthorized'))
      }
      return
    }

    const key = `${token.account}:${workspace}`
    const cached = cache.get(key)
    if (cached !== undefined) {
      if (cached) {
        next()
      } else {
        next(new HttpError(401, 'Unauthorized'))
      }
      return
    }

    const raw = readToken(req.headers)
    if (raw === undefined) {
      next(new HttpError(401, 'Unauthorized'))
      return
    }

    void getAccountClient(options.accountsUrl, raw)
      .getUserWorkspaces()
      .then((workspaces: WorkspaceInfoWithStatus[]) => {
        const allowed = workspaces.some((it) => it.uuid === workspace)
        cache.set(key, allowed, { ttl: allowed ? options.allowTtlMs : options.denyTtlMs })
        if (allowed) {
          next()
        } else {
          next(new HttpError(401, 'Unauthorized'))
        }
      })
      .catch((err: any) => {
        // Fail closed: an unreachable account must not turn into an open blob.
        cache.set(key, false, { ttl: options.denyTtlMs })
        Analytics.handleError(err)
        next(new HttpError(401, 'Unauthorized'))
      })
  }
}

// The storage client puts the workspace into the url as it is: fetch turns "./<uuid>" into
// the same blob under another key. A name of "." or ".." is resolved the same way.
export const withBlob = (req: Request, _res: Response, next: NextFunction): void => {
  const { workspace, name } = req.params
  if (!UUID.test(workspace)) {
    next(new BadRequestError('Invalid workspace'))
    return
  }
  if (name === '.' || name === '..') {
    next(new BadRequestError('Invalid blob name'))
    return
  }
  next()
}

export interface ErrorHandlerOptions {
  ctx: MeasureContext
}

export const errorHandler = (options: ErrorHandlerOptions): ErrorRequestHandler => {
  const { ctx } = options

  return (err: any, req: Request, res: Response, _next: NextFunction): void => {
    // logged once where the tool failed: a refusal serves the same error again and again
    if (err instanceof ToolError) {
      res.status(500).json({ message: 'Internal Server Error' })
      return
    }

    ctx.error(err.message, { code: err.code, message: err.message })

    if (err instanceof HttpError) {
      res.status(err.code).json({ message: err.message })
      return
    }

    Analytics.handleError(err)

    res.status(500).json({ message: 'Internal Server Error' })
  }
}
