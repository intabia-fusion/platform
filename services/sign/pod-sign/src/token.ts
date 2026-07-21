//
// Copyright © 2024 Hardcore Engineering Inc.
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

import { IncomingHttpHeaders } from 'http'
import { decodeToken, extractCookieToken, Token } from '@hcengineering/server-token'

import { ApiError } from './error'

const extractRawAuthorizationToken = (authorization?: string): string | null => {
  if (authorization === undefined || authorization === null) {
    return null
  }

  return authorization.split(' ')[1]
}

const extractRawQueryToken = (queryParams: any): string | null => {
  if (queryParams == null) {
    return null
  }

  return queryParams.token
}

export const extractToken = (headers: IncomingHttpHeaders, queryParams: any): { token: Token, rawToken: string } => {
  try {
    const rawToken =
      extractRawAuthorizationToken(headers.authorization) ??
      extractRawQueryToken(queryParams) ??
      extractCookieToken(headers.cookie)

    if (rawToken == null) {
      throw new ApiError(401)
    }

    const token = decodeToken(rawToken)

    if (token === null) {
      throw new ApiError(401)
    }

    return { token, rawToken }
  } catch {
    throw new ApiError(401)
  }
}
