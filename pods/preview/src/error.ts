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

function httpErrorMessage (code: number): string {
  switch (code) {
    case 400:
      return 'Bad Request'
    case 401:
      return 'Unauthorized'
    case 403:
      return 'Forbidden'
    case 404:
      return 'Not Found'
    case 500:
      return 'Internal Server Error'
    case 501:
      return 'Not Implemented'
    case 503:
      return 'Service Unavailable'
    default:
      return 'Unknown Error'
  }
}

export class HttpError extends Error {
  readonly code: number

  constructor (code: number, message?: string) {
    super(message ?? httpErrorMessage(code))
    this.name = 'HttpError'
    this.code = code
  }
}

export class BadRequestError extends HttpError {
  constructor (message?: string) {
    super(400, message)
    this.name = 'BadRequestError'
  }
}

export class NotFoundError extends HttpError {
  constructor (message?: string) {
    super(404, message)
    this.name = 'NotFoundError'
  }
}

// An external tool failed on a blob, so it fails the same way again. retryAfter (ms) is set
// when it ran out of time or was killed: the load may be to blame, so retry after that long.
export class ToolError extends Error {
  constructor (
    message: string,
    readonly retryAfter?: number
  ) {
    super(message)
    this.name = 'ToolError'
  }
}
