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

// Source text of a screen script: values with code inside, pretty printing, names of variables.

// An expression; `pre` are the statements it needs first (a container is built in steps)
export class Code {
  constructor (src, pre = []) {
    this.src = src
    this.pre = pre
  }
}

const IDENT = /^[A-Za-z_$][\w$]*$/
export const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

// Statements of the codes inside a value, in order
const plain = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

export function collect (v, into = []) {
  if (v instanceof Code) into.push(...v.pre)
  else if (Array.isArray(v)) v.forEach((x) => collect(x, into))
  else if (plain(v)) Object.values(v).forEach((x) => collect(x, into))
  return into
}

const LIMIT = 110
// Value as source; breaks into lines when it does not fit
export function js (v, indent = '') {
  if (v instanceof Code) return v.src.split('\n').join('\n' + indent)
  const flat = inline(v)
  if (flat !== null && flat.length + indent.length <= LIMIT && !flat.includes('\n')) return flat
  const next = indent + '  '
  if (Array.isArray(v)) return `[\n${v.map((x) => next + js(x, next)).join(',\n')}\n${indent}]`
  if (plain(v)) {
    const lines = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${next}${IDENT.test(k) ? k : quote(k)}: ${js(x, next)}`)
    return `{\n${lines.join(',\n')}\n${indent}}`
  }
  return flat ?? 'undefined'
}

function inline (v) {
  if (v instanceof Code) return v.src
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v === 'string') return quote(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    const parts = v.map(inline)
    return parts.includes(null) ? null : `[${parts.join(', ')}]`
  }
  if (plain(v)) {
    const parts = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, inline(x)])
    if (parts.some(([, x]) => x === null)) return null
    return parts.length === 0 ? '{}' : `{ ${parts.map(([k, x]) => `${IDENT.test(k) ? k : quote(k)}: ${x}`).join(', ')} }`
  }
  return null
}

// kit.Name(arg, ...) as one expression; trailing undefined arguments are dropped
export function callOf (fn, args, indent = '') {
  const a = [...args]
  while (a.length > 0 && (a.at(-1) === undefined || a.at(-1) === null || (isEmpty(a.at(-1))))) a.pop()
  const flat = a.map(inline)
  const one = `${fn}(${flat.join(', ')})`
  if (!flat.includes(null) && one.length + indent.length <= LIMIT && !one.includes('\n')) return one
  // The last argument is the big one: it opens on the line of the call
  const last = a.at(-1)
  const head = a.slice(0, -1).map(inline)
  if (a.length > 0 && (Array.isArray(last) || plain(last)) && !head.includes(null) && !head.some((h) => h.includes('\n'))) {
    const open = `${fn}(${head.map((h) => h + ', ').join('')}`
    const body = js(last, indent)
    if ((open + body.split('\n')[0]).length + indent.length <= LIMIT) return `${open}${body})`
  }
  const next = indent + '  '
  return `${fn}(\n${a.map((x) => next + js(x, next)).join(',\n')}\n${indent})`
}
const isEmpty = (v) => plain(v) && Object.values(v).every((x) => x === undefined)

// Variable names: the node name as a word, numbered when taken
export function namer () {
  const used = new Map()
  return (base) => {
    let w = String(base).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean)
      .map((p, i) => (i === 0 ? p[0].toLowerCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1))).join('')
    if (!/^[A-Za-z_]/.test(w)) w = 'n' + w
    if (/^(const|let|var|new|delete|default|class|function|return|if|else|in|of|for|while|do|switch|case|break|continue|this|null|true|false|void|with|yield|await|async|static|enum|import|export|super|try|catch|finally|throw|typeof|instanceof|debugger|main|panel|frame|kit|content)$/.test(w)) w += 'Box'
    const n = (used.get(w) ?? 0) + 1
    used.set(w, n)
    return n === 1 ? w : w + n
  }
}
