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
 * The paths the presentation token cookie has to cover: the storage path scripts ask through, and
 * the preview origin a thumbnail is loaded from. A thumbnail is an `<img>`, an `<img>` carries no
 * Authorization header, and a guest of a public link has no account cookie at all - without the
 * preview path every such image would be a 401.
 */
export const presentationCookiePaths = (
  storagePath: string | undefined,
  previewUrl: string | undefined,
  origin: string
): string[] => {
  const paths: string[] = []

  if (storagePath !== undefined) {
    paths.push(storagePath.startsWith('/') ? storagePath : `/${storagePath}`)
  }

  if (previewUrl !== undefined && previewUrl !== '') {
    try {
      paths.push(new URL(previewUrl, origin).pathname)
    } catch {
      // A malformed url is not worth a broken session: the storage cookie still works.
    }
  }

  return paths
}
