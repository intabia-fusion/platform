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

/** The trailing slash keeps link paths disjoint even when one id is a prefix of another. */
export function publicFilePath (workspace: string, linkId: string, datalakeUrl = '/_datalake'): string {
  const base = datalakeUrl === '' ? '/_datalake' : datalakeUrl
  return `${base.replace(/\/+$/, '')}/blob/public/${encodeURIComponent(workspace)}/${encodeURIComponent(linkId)}/`
}

export function setPublicFileCookie (
  cookieValue: string,
  workspace: string,
  linkId: string,
  datalakeUrl = '/_datalake'
): void {
  const url = new URL(publicFilePath(workspace, linkId, datalakeUrl), window.location.href)
  if (url.hostname !== window.location.hostname || url.protocol !== window.location.protocol) {
    throw new Error('Public files require a Datalake URL on the frontend hostname and protocol')
  }
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `public-file-token=${cookieValue}; path=${url.pathname}; SameSite=Lax${secure}`
}
