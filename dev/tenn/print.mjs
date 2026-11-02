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

// Constructors of the arguments and properties of a command, and the printer. A command is
// { kind: item|use|at|replace|slot|slotfill|element|mount|styles|style|animation|keyframe, name, path, as, props: [{ name, args }], kids: [command] }.
const fnum = (v) => (v === 0 ? '0' : String(+v.toFixed(6)))
const A = (s, q = false) => ({ s: String(s), q })
export const num = (v) => A(fnum(v))
export const word = (s) => A(s)
export const str = (s) => A(String(s).replace(/\\"/g, '"').replace(/\\$/, ''), true)
export const P = (name, ...args) => ({ name, args })
// Names are path segments: everything but letters and digits becomes `_`
export const normalize = (name) => [...String(name)].map((c) => (/[\p{L}\p{M}\p{N}]/u.test(c) ? c : '_')).join('')

// Printer of the command tree in the compact form: tabs, packed lines, blocks of plain commands on one line (spec 9.5)
const bare = (s) => s !== '' && /^[\p{L}\p{N}_\-.#]+$/u.test(s) && !/^[-+]?(\d|\.\d)/.test(s) && !/^[\d.]+$/.test(s)
const quote = (s) => '"' + s.replace(/\\/g, '').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
const argText = (a) => (a.q ? (bare(a.s) ? a.s : quote(a.s)) : a.s)
export const nameArg = (s) => (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(s) ? s : quote(s))
const LIMIT = 160
const plainLine = (p) => [p.name, ...p.args.map(argText)].join(' ')
function toCmds (c) {
  // returns { head, plain: [lines], blocks: [cmd] } for a node
  const plain = (c.props ?? []).map(plainLine)
  let head
  let blocks = c.kids ?? []
  if (c.kind === 'item') head = `item ${nameArg(c.name)}`
  else if (c.kind === 'use') head = `use ${c.path} as ${nameArg(c.as)}`
  else if (c.kind === 'at') head = `at ${c.path}`
  else if (c.kind === 'replace') head = `replace ${c.path}`
  else if (c.kind === 'slot' || c.kind === 'slotfill') head = c.name ? `slot ${c.name}` : 'slot'
  else if (c.kind === 'element') head = `element ${nameArg(c.name)}`
  else if (c.kind === 'mount') head = `element ${nameArg(c.name)} --from-file ${quote(c.file)}`
  else if (c.kind === 'styles') head = 'styles'
  else if (c.kind === 'style' || c.kind === 'keyframe') head = c.name
  else if (c.kind === 'animation') head = `animation ${nameArg(c.name)}`
  else throw new Error(c.kind)
  return { head, plain, blocks }
}
export function printCmd (c, ind, out) {
  const tab = '\t'.repeat(ind)
  const { head, plain, blocks } = toCmds(c)
  if (c.kind === 'slotfill' && !c.name && blocks.length === 0) { out.push(`${tab}slot {}`); return }
  if (blocks.length === 0 && plain.length === 0) { out.push(tab + head + (c.kind === 'slotfill' ? ' {}' : '')); return }
  if (blocks.length === 0) {
    const one = `${tab}${head} { ${plain.join('; ')} }`
    if (one.length <= LIMIT) { out.push(one); return }
  }
  out.push(`${tab}${head} {`)
  let line = ''
  const flush = () => { if (line) { out.push('\t'.repeat(ind + 1) + line); line = '' } }
  for (const p of plain) {
    if (line && (ind + 1) + line.length + 2 + p.length > LIMIT) flush()
    line = line ? line + '; ' + p : p
  }
  flush()
  for (const b of blocks) printCmd(b, ind + 1, out)
  out.push(`${tab}}`)
}
