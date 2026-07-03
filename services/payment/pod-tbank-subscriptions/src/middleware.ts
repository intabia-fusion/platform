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

import type { NextFunction, Request, Response } from 'express'
import { extractToken } from '@hcengineering/server-client'
import { systemAccountUuid } from '@hcengineering/core'

// The subscriptions API is internal: only pod-payment calls it, under its system service token.
// Request bodies carry accountUuid/workspaceUuid verbatim, so without this gate anyone reaching
// the pod could manage arbitrary subscriptions. The TBank webhook route stays open (Token-signed).
export const withServiceToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = extractToken(req.headers)
  if (token === undefined || (token.account !== systemAccountUuid && token.extra?.admin !== 'true')) {
    res.status(401).json({ error: 'Service token required' })
    return
  }
  next()
}
