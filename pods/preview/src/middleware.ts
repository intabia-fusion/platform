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
import { extractToken, extractTokenWithRaw } from '@hcengineering/server-client'
import { Token } from '@hcengineering/server-token'
import { type Response, type Request, type NextFunction, type RequestHandler, type ErrorRequestHandler } from 'express'
import { LRUCache } from 'lru-cache'
import { BadRequestError, HttpError, ToolError } from './error'
import { SingleFlight } from './singleflight'

export interface KeepAliveOptions {
  timeout: number
  max: number
}

export interface RequestWithAuth extends Request {
  token?: Token
  /** The exact string `token` was decoded from: account is asked with it, never with another one. */
  tokenRaw?: string
}

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

// Preview only reads, so a guest of a public link and a readonly account are served too: both
// bring a token, and `createWorkspaceAccess` decides whether its workspace is the requested one.
export const withAuthorization = (req: RequestWithAuth, res: Response, next: NextFunction): void => {
  try {
    // The raw string is kept next to the decoded token: a request carries cookies of several
    // accounts, and asking account with a token picked another way would answer for the wrong one.
    const extracted = extractTokenWithRaw(req.headers)
    if (extracted == null) {
      throw new HttpError(401, 'Unauthorized')
    }
    req.token = extracted.token
    req.tokenRaw = extracted.raw

    next()
  } catch (err: any) {
    next(err)
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// One entry per account, not per account and workspace: `getUserWorkspaces` answers with the
// whole list, so opening a file in a second workspace costs nothing and a probe of a foreign
// uuid does not evict the answer of somebody else.
const MEMBERSHIP_CACHE_MAX = 1000

// A thumbnail is not worth a half-minute wait: an account that does not answer within this is
// treated as down, and the image is refused instead of holding the request.
const ACCOUNT_ATTEMPT_TIMEOUT_MS = 5 * 1000

export interface WorkspaceAccessOptions {
  accountsUrl: string
  /** How long the workspace list of an account is trusted. */
  allowTtlMs: number
  /** How long a refusal from that list is trusted: a member added a moment ago must not wait for `allowTtlMs`. */
  denyTtlMs: number
}

interface Membership {
  workspaces: Set<string>
  fetchedAt: number
}

export const createWorkspaceAccess = (options: WorkspaceAccessOptions): RequestHandler => {
  const memberships = new LRUCache<string, Membership>({ max: MEMBERSHIP_CACHE_MAX })
  const requests = new SingleFlight<Set<string>>()

  // A feed of 40 images asks for the same list 120 times over (three srcset steps each), and a
  // restarted pod has no cache at all, so every burst collapses into one call to account.
  const workspacesOf = async (account: string, raw: string): Promise<Set<string>> => {
    return await requests.execute(account, async () => {
      try {
        const answer: WorkspaceInfoWithStatus[] = await getAccountClient(
          options.accountsUrl,
          raw,
          undefined,
          undefined,
          ACCOUNT_ATTEMPT_TIMEOUT_MS
        ).getUserWorkspaces()
        const workspaces = new Set<string>(answer.map((it) => it.uuid))
        memberships.set(account, { workspaces, fetchedAt: Date.now() }, { ttl: options.allowTtlMs })
        return workspaces
      } catch (err: any) {
        // Reported once for the whole burst: every request of it lands in the catch below.
        Analytics.handleError(err)
        throw err
      }
    })
  }

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

    // A workspace token names its workspace, a guest token among them, so account is not asked.
    // A guest token of another workspace is refused outright; a regular one falls through to the
    // membership check, so an account that is a member survives a stale cookie of a second tab.
    if (token.workspace === workspace) {
      next()
      return
    }
    if (token.workspace !== undefined && token.extra?.guest === 'true') {
      next(new HttpError(401, 'Unauthorized'))
      return
    }

    const cached = memberships.get(token.account)
    if (cached !== undefined) {
      if (cached.workspaces.has(workspace)) {
        next()
        return
      }
      // A deny is trusted only for a moment: the account may have been added to the workspace
      // after the list was fetched.
      if (Date.now() - cached.fetchedAt < options.denyTtlMs) {
        next(new HttpError(401, 'Unauthorized'))
        return
      }
    }

    const raw = req.tokenRaw
    if (raw === undefined) {
      next(new HttpError(401, 'Unauthorized'))
      return
    }

    void workspacesOf(token.account, raw)
      .then((workspaces) => {
        if (workspaces.has(workspace)) {
          next()
        } else {
          next(new HttpError(401, 'Unauthorized'))
        }
      })
      .catch(() => {
        // Fail closed: an unreachable account must not turn into an open blob. The failure itself
        // is reported once in `workspacesOf`, not by every request of the burst.
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
