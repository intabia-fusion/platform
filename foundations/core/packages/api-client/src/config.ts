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

import { concatLink } from '@hcengineering/core'

export interface ServerConfig {
  ACCOUNTS_URL: string
  FILES_URL: string
  UPLOAD_URL: string
}

export async function loadServerConfig (url: string): Promise<ServerConfig> {
  const configUrl = concatLink(url, '/config.json')
  const res = await fetch(configUrl, { keepalive: true })
  if (res.ok) {
    const config = (await res.json()) as ServerConfig
    // A dev-server config.json rewrites service URLs relative to the front origin -
    // Node callers (sanity API helpers) cannot fetch relative URLs, absolutize them.
    for (const key of ['ACCOUNTS_URL', 'FILES_URL', 'UPLOAD_URL'] as const) {
      const value = config[key]
      if (typeof value === 'string' && value.startsWith('/')) {
        config[key] = new URL(value, url).toString()
      }
    }
    return config
  }
  throw new Error('Failed to fetch config')
}
