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
export function publicFilePath (workspace: string, linkId: string): string {
  return `/files/public/${encodeURIComponent(workspace)}/${encodeURIComponent(linkId)}/`
}

export function setPublicFileCookie (cookieName: string, cookieValue: string, workspace: string, linkId: string): void {
  document.cookie = `${cookieName}=${cookieValue}; path=${publicFilePath(workspace, linkId)}; SameSite=Lax`
}
