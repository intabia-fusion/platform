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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import { safeIndexRe, type IndexesFile } from '../indexes'

describe('safeIndexRe', () => {
  // Dumped from production by dump-indexes; sync-indexes must accept every definition it produces.
  const file = yaml.load(readFileSync(join(__dirname, '../../../../tests/indexes.yaml'), 'utf8')) as IndexesFile

  it('accepts every index definition from tests/indexes.yaml', () => {
    const rejected: string[] = []
    for (const [domain, list] of Object.entries(file.domains)) {
      for (const r of list) {
        const match = safeIndexRe.exec(r.definition.trim())
        const ok = match?.[3] === r.name && match[4] === domain
        if (!ok) rejected.push(r.definition)
      }
    }
    expect(rejected).toEqual([])
  })

  it.each([
    'CREATE INDEX x ON task (a); DROP TABLE task',
    'CREATE INDEX x ON task ((a)) INCLUDE (b); DROP TABLE task',
    'CREATE INDEX x ON task (a) WHERE b = 1; DROP TABLE task',
    'CREATE INDEX x ON task ((((a))))'
  ])('rejects %s', (def) => {
    expect(safeIndexRe.test(def)).toBe(false)
  })
})
