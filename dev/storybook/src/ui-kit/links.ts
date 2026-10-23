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

import { createLinkFixtures } from '../attachments/fixtures'

const fixtures = createLinkFixtures()

function parts (key: string): { preview: Record<string, any>, details: Record<string, any> } {
  const { title, description, image, imageWidth, imageHeight, url, hostname, icon } = fixtures[key].details
  return { preview: { title, description, image, imageWidth, imageHeight }, details: { url, hostname, icon } }
}

export const article = parts('article')
export const repo = parts('square')
export const textOnly = parts('noImage')
