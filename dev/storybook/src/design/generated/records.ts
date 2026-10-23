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

import design from '../../../../design/design.json?raw'
import tokens from '../../../../design/kit/00-tokens.generated.js?raw'
import { demo } from '../demo'
import { screenFiles } from './entries'
import { createRecorder, type RPage } from './recorder'

const raw = import.meta.glob<string>('../../../../design/screens/**/*.js', {
  query: '?raw',
  import: 'default',
  eager: true
})
const sources = new Map(
  Object.entries(raw).map(([file, source]) => [file.slice(file.indexOf('design/') + 'design/'.length), source])
)

let cache: Promise<Map<string, RPage[]>> | undefined

// Runs the screen scripts once per page load and returns the recorded pages by section title
export async function records (): Promise<Map<string, RPage[]>> {
  cache ??= (async () => {
    const out = new Map<string, RPage[]>()
    for (const file of screenFiles(design)) {
      const rec = createRecorder(tokens)
      for (const entry of file.build) {
        await rec.run({ tokens, demo, scripts: entry.map((path) => ({ path, source: sources.get(path) ?? '' })) })
      }
      out.set(file.title, rec.pages)
    }
    return out
  })()
  return await cache
}
