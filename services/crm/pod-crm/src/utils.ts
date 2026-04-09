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

/**
 * Parses a Cookie header string into a key-value record.
 * Handles URL decoding and skips malformed entries.
 */
export function parseCookies (cookieString: string | undefined): Record<string, string> {
  if (cookieString == null || cookieString === '') {
    return {}
  }
  const cookies: Record<string, string> = {}
  cookieString.split(';').forEach((cookie) => {
    const parts = cookie.split('=')
    if (parts.length >= 2) {
      const key = parts.shift()?.trim() ?? ''
      const value = parts.join('=').trim()
      if (key !== '') {
        cookies[key] = decodeURIComponent(value)
      }
    }
  })
  return cookies
}
