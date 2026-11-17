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

// Run: node dev/design/generate.test.mjs
import assert from 'node:assert/strict'
import { colorOf } from './generate.mjs'

const vars = { primary: '#6B3AD3', hover: 'rgba(21, 48, 114, 0.1)', tint: 'color-mix(in srgb, var(--primary) 10%, transparent)' }
assert.equal(colorOf(vars, 'var(--tint)'), '#6B3AD31A')
assert.equal(colorOf(vars, 'color-mix(in srgb, var(--primary) 45%, white)'), '#BCA6EB')
assert.equal(colorOf(vars, 'color-mix(in srgb, var(--hover) 50%, transparent)'), '#1530720D')
assert.equal(colorOf(vars, 'var(--missing)'), undefined)
console.log('ok: color-mix tokens')
