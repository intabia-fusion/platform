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
 * The page loads `page.js` by a relative path, so the directory URL needs its trailing slash. Without it
 * the script resolves one level up, and express's own redirect drops the `/_love` prefix the ingress strips.
 */
export function normalizeTemplateUrl (raw: string | undefined): string {
  const url = (raw ?? '').trim()
  if (url === '') return ''
  const path = url.split(/[?#]/)[0]
  if (path.endsWith('/') || path.endsWith('.html')) return url
  const rest = url.slice(path.length)
  return `${path}/${rest}`
}
