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

// Reads a .pen file together with the libraries it imports (`imports: { alias: relative path }`).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { idAddrs, viewOfInstance } from './inverse.mjs'

function indexLib (doc) {
  const byId = new Map()
  const walk = (n) => {
    if (n.id !== undefined) byId.set(n.id, n)
    for (const c of n.children ?? []) walk(c)
  }
  doc.children.forEach(walk)
  const memo = new Map()
  return { doc, byId, addrs: (comp) => memo.get(comp.id) ?? (memo.set(comp.id, idAddrs(comp)), memo.get(comp.id)) }
}

export function readPen (file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const libs = {}
  for (const [alias, rel] of Object.entries(doc.imports ?? {})) libs[alias] = indexLib(JSON.parse(readFileSync(resolve(dirname(file), rel), 'utf8')))
  const local = indexLib(doc)
  // The component of a ref: "alias:id" is a library, a bare id is a component of this file
  const split = (ref) => {
    const i = ref.indexOf(':')
    return i < 0 ? { lib: local, id: ref, own: true } : { lib: libs[ref.slice(0, i)], id: ref.slice(i + 1) }
  }
  const viewOf = (node) => {
    const { lib, id, own } = split(node.ref)
    const comp = lib?.byId.get(id)
    return comp === undefined || own ? null : viewOfInstance(node, lib, comp)
  }
  const compName = (node) => split(node.ref).lib?.byId.get(split(node.ref).id)?.name
  return { doc, libs, viewOf, compName, local }
}
