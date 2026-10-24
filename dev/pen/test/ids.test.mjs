// Ids of library components must not depend on their position, or refs from hand-made .pen files break.
// Run: node dev/pen/test/ids.test.mjs (needs a built ../foundation-tasks/design/ui-kit.lib.pen)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const lib = join(dirname(fileURLToPath(import.meta.url)), '../../../../foundation-tasks/design/ui-kit.lib.pen')
const doc = JSON.parse(readFileSync(lib, 'utf8'))
const prefix = createHash('sha1').update('ui-kit.lib.pen').digest('hex').slice(0, 2)
let count = 0
const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk)
  if (o === null || typeof o !== 'object') return
  if (o.reusable === true) {
    count++
    assert.equal(o.id, prefix + createHash('sha1').update('component:' + o.name).digest('hex').slice(0, 8), o.name)
  }
  Object.values(o).forEach(walk)
}
walk(doc.children)
assert.ok(count > 0, 'no components in the library')
console.log(`ok: ${count} component ids follow their names`)
