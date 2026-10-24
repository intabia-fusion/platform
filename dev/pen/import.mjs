#!/usr/bin/env node
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

// A hand-made .pen file (built from library instances) back to a screen script of dev/design/screens.
// Usage: node dev/pen/import.mjs <file.pen> [--out <script.js>] [--page <name>]. See README.md.
import { writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Code, callOf, collect, js, namer, quote } from './emit.mjs'
import { invertView, isPlain, loadKit, nodeCall, slotKids } from './inverse.mjs'
import './lifts.mjs'
import { tokenOf } from './lifts.mjs'
import { readPen } from './penfile.mjs'

const HOSTED = new Set(['SpaceHeader', 'SettingsLayout', 'PanelHeader', 'Modal'])
const PALETTE = { 'pal-': 'P', 'palbg-': 'PB', 'palt-': 'PT' }

export async function importPen (file, { page } = {}) {
  const kitEnv = await loadKit()
  const pen = readPen(file)
  const todos = []
  const name = namer()
  const env = { ...kitEnv, viewOf: pen.viewOf }
  const todo = (msg, node) => {
    todos.push({ msg, node: node?.name ?? '' })
    return `// TODO(import): ${msg}, node ${quote(node?.name ?? '')}`
  }

  // ---- Values ----
  function color (c, node) {
    if (c === undefined || c === null) return undefined
    if (typeof c !== 'string') {
      env.pre.push(todo('fill that is not a color', node))
      return undefined
    }
    const v = tokenOf(c)
    if (v === undefined) return c
    const pal = Object.keys(PALETTE).find((p) => v.startsWith(p))
    if (pal === undefined) return new Code(`T(${quote(v)})`)
    const n = v.slice(pal.length)
    return new Code(`${PALETTE[pal]}(${quote(n)})`)
  }
  const pad4 = (p) => (p === undefined ? undefined : !Array.isArray(p) ? [p, p, p, p] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p)

  function boxOptions (n) {
    const o = {}
    const row = n.layout === undefined || n.layout === 'horizontal'
    const flow = n.layout !== 'none'
    // An empty fit-content frame is read back as fit_content(0)
    const size = (v) => (v === undefined || String(v).startsWith('fit_content') ? 'auto' : v === 'fill_container' ? 'fill' : 'fix')
    if (typeof n.width === 'number') o.w = n.width
    if (typeof n.height === 'number') o.h = n.height
    if (flow) {
      o.dir = row ? 'row' : 'column'
      if (n.gap) o.gap = n.gap
      const pad = pad4(n.padding)
      if (pad?.some((x) => x)) o.pad = pad
      if (n.alignItems && n.alignItems !== 'start') o.align = n.alignItems
      if (n.justifyContent && n.justifyContent !== 'start') o.justify = n.justifyContent.replace('_', '-')
      if (n.metadata?.type === 'wrap') o.wrap = true
      if (size(n.width) !== 'fix') o.hs = size(n.width)
      if (size(n.height) !== 'fix') o.vs = size(n.height)
    }
    const fill = color(n.fill, n)
    if (fill !== undefined) o.fill = fill
    const stroke = color(n.stroke, n)
    if (stroke !== undefined) {
      o.stroke = stroke
      if (n.strokeWidth && n.strokeWidth !== 1) o.strokeW = n.strokeWidth
    }
    if (Array.isArray(n.cornerRadius)) {
      env.pre.push(todo('corners with different radii, the largest is used', n))
      o.radius = Math.max(...n.cornerRadius)
    } else if (n.cornerRadius) o.radius = n.cornerRadius
    if (n.clip !== true) o.clip = false
    for (const k of ['opacity', 'rotation']) if (n[k] !== undefined) env.pre.push(todo(`${k} is not in the kit`, n))
    return o
  }

  // ---- Shapes: every function returns a Code ----
  // A shadow is set on the shape after it is made (kit.box has no option for it)
  function shadowOf (e) {
    const list = (Array.isArray(e) ? e : [e]).filter((x) => x?.type === 'shadow')
    return list.map((x) => {
      const c = String(x.color ?? '#00000040')
      const alpha = c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1
      return { style: x.shadowType === 'inner' ? 'inner-shadow' : 'drop-shadow', offsetX: x.offset?.x ?? 0, offsetY: x.offset?.y ?? 0, blur: x.blur ?? 0, spread: x.spread ?? 0, color: { color: c.slice(0, 7), opacity: Math.round(alpha * 1000) / 1000 } }
    })
  }
  function frame (n, kids) {
    const code = plainFrame(n, kids)
    if (n.effect === undefined) return code
    const v = name(n.name + ' shadow')
    return new Code(v, [...code.pre, `const ${v} = ${code.src}`, `${v}.shadows = ${js(shadowOf(n.effect))}`])
  }
  function plainFrame (n, kids) {
    const o = boxOptions(n)
    const flow = n.layout !== 'none'
    let children = kids ?? n.children ?? []
    // A container the session cut into rows (wrap) is one row again
    if (flow && n.metadata?.type === 'wrap' && n.layout === 'vertical' && children.length > 0 && children.every((k) => k.type === 'frame' && k.name === 'row')) {
      o.dir = 'row'
      if (children[0].alignItems && children[0].alignItems !== 'start') o.align = children[0].alignItems
      else delete o.align
      children = children.flatMap((k) => k.children ?? [])
    }
    const pre = [...env.pre.splice(0)]
    if (!flow) {
      const v = name(n.name)
      const stmts = [`const ${v} = ${callOf('kit.box', [n.name, o])}`]
      place(v, children, stmts)
      return new Code(v, [...pre, ...stmts])
    }
    const kidCodes = children.map(shape).filter((s) => s !== null)
    const { dir, gap, align, hs, vs, w, h, ...rest } = o
    const autoSized = hs === 'auto' && vs === 'auto' && w === undefined && h === undefined
    const make = !autoSized
      ? callOf('kit.box', [n.name, o])
      : dir === 'row'
        ? callOf('kit.row', [n.name, gap ?? 0, { align: align ?? 'start', ...rest }].map((x) => (x && x.align === 'center' ? { ...x, align: undefined } : x)))
        : callOf('kit.col', [n.name, gap ?? 0, { align, ...rest }])
    const pres = [...pre, ...kidCodes.flatMap((c) => c.pre)]
    if (kidCodes.length === 0) return new Code(make, pres)
    return new Code(callOf('kit.add', [new Code(make), ...kidCodes.map((c) => new Code(c.src))]), pres)
  }

  function text (n) {
    const o = {}
    if (n.fontFamily && n.fontFamily !== 'IBM Plex Sans') env.pre.push(todo(`font ${n.fontFamily} is not in the kit`, n))
    if (n.fontSize && n.fontSize !== 14) o.size = n.fontSize
    // 'normal' is the default weight and has no number
    if (n.fontWeight && n.fontWeight !== 'normal' && Number(n.fontWeight) !== 400) o.weight = Number(n.fontWeight)
    if (n.lineHeight && n.lineHeight !== 1.25) o.lh = n.lineHeight
    const c = color(n.fill, n)
    if (c !== undefined && tokenOf(n.fill) !== 'theme-caption-color') o.color = c
    if (n.textGrowth === 'fixed-width' && typeof n.width === 'number') o.w = n.width
    if (n.textAlign && n.textAlign !== 'left') o.align = n.textAlign
    if (n.name !== String(n.content).slice(0, 40)) o.name = n.name
    const pre = env.pre.splice(0)
    return new Code(callOf('kit.text', [n.content, o]), pre)
  }

  function instance (n) {
    const view = pen.viewOf(n) ?? (n.ref?.startsWith('§K:') ? null : null)
    if (view === null) {
      env.pre.push(todo(`component ${n.ref} is not in the imported library`, n))
      return placeholder(n)
    }
    const call = invertView(view, env)
    if (call === null) {
      env.pre.push(todo(`${view.name} has no kit function (add it to library/ui-kit.js)`, n))
      return placeholder(n)
    }
    return callCode(call, n)
  }

  const placeholder = (n) => new Code(callOf('kit.spacer', [n.width ?? 10, n.height ?? 10]), env.pre.splice(0))

  // Arguments as the kit takes them: no false options, no trailing holes
  function tidy (v) {
    if (Array.isArray(v)) {
      const a = v.map(tidy)
      while (a.length > 0 && (a.at(-1) === undefined || a.at(-1) === null)) a.pop()
      return a
    }
    if (isPlain(v)) {
      return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== false).map(([k, x]) => [k, tidy(x)]))
    }
    return v
  }
  function callCode (call, n) {
    if (call.fn === 'Workbench') {
      env.pre.push(todo('a Workbench belongs on the canvas, not inside a frame', n))
      return placeholder(n)
    }
    const pre = []
    let args = call.args
    if (call.fn === 'icon') {
      const c = call.args[1]?.color
      const col = c === undefined ? undefined : color(c, n)
      args = [call.args[0], col instanceof Code && col.src === "T('theme-dark-color')" ? undefined : col, call.args[2]]
      pre.push(...env.pre.splice(0))
    }
    if (call.note) pre.push(todo(call.note, n))
    let fn = call.fn
    if (call.iconButton) {
      const { icon, ...rest } = args[0]
      fn = 'IconButton'
      args = [icon, rest]
    }
    args = args.map(tidy)
    pre.push(...collect(args))
    return new Code(callOf(`kit.${fn}`, args), pre)
  }

  function shape (n) {
    if (n.enabled === false) return null
    switch (n.type) {
      case 'ref': return instance(n)
      case 'frame': {
        // A status icon of another size or color is drawn in place
        const drawn = n.name?.startsWith('StatusIcon/') ? nodeCall(n, env) : null
        return drawn !== null ? callCode(drawn, n) : frame(n)
      }
      case 'text': return text(n)
      case 'rectangle': return frame({ ...n, type: 'frame', layout: 'none', children: [] })
      case 'ellipse': {
        if (n.width !== n.height) env.pre.push(todo('ellipse that is not a circle', n))
        const c = color(n.fill, n)
        return new Code(callOf('kit.ellipse', [n.width, c, n.name === 'Ellipse' ? undefined : n.name]), env.pre.splice(0))
      }
      default:
        env.pre.push(todo(`${n.type} is not mapped`, n))
        return placeholder(n)
    }
  }
  env.pre = []
  env.color = (c) => color(c, null)
  env.conv = (n) => shape(n) ?? new Code('undefined')
  env.row = (nm, kids) => new Code(callOf('kit.add', [new Code(callOf('kit.row', [nm])), ...kids.map((k) => new Code(shape(k).src))]), kids.flatMap((k) => shape(k).pre))

  // ---- Screens ----
  // Children of a frame without layout: positioned in it, kit parts that fill it (space header, settings) are calls on it
  function place (parent, kids, lines) {
    for (const k of kids) {
      if (k.enabled === false) continue
      const call = k.type === 'ref' && pen.viewOf(k) ? nodeCall(k, env) : null
      if (call && HOSTED.has(call.fn)) {
        hosted(parent, k, call, lines)
        continue
      }
      const s = shape(k)
      if (s !== null) lines.push(...s.pre, `kit.at(${parent}, ${s.src}, ${k.x ?? 0}, ${k.y ?? 0})`)
    }
  }

  // Kit parts that take their parent (header of a panel) or return a pair (modal and its body)
  function hosted (parent, k, call, lines) {
    const modal = call.fn === 'Modal'
    const o = tidy(call.args[1])
    if (call.fn === 'SpaceHeader' || call.fn === 'PanelHeader') lines.push(...collect(o), callOf('kit.' + call.fn, [new Code(parent), o]))
    else if (modal) {
      const v = name('modal')
      const b = name('modalBody')
      lines.push(...collect(o), `const { modal: ${v}, body: ${b} } = ${callOf('kit.Modal', [call.args[0], o])}`)
      for (const c of call.content.map(shape).filter((x) => x !== null)) lines.push(...c.pre, `kit.add(${b}, ${c.src})`)
      lines.push(`kit.at(${parent}, ${v}, ${k.x ?? 0}, ${k.y ?? 0})`)
    } else {
      const v = name('content')
      lines.push(...collect(o), `const ${v} = ${callOf('kit.SettingsLayout', [new Code(parent), o])}`)
      for (const c of call.content.map(shape).filter((x) => x !== null)) lines.push(...c.pre, `kit.add(${v}, ${c.src})`)
    }
    lines.push(...env.pre.splice(0))
  }

  function workbench (n, y, lines) {
    const view = pen.viewOf(n)
    const call = invertView(view, env)
    const [, , , o] = call.args
    const main = slotKids(view, call.def, 'Main panel')
    const panelKids = slotKids(view, call.def, 'Side panel')
    const overlay = slotKids(view, call.def, 'overlay')
    const hasPanel = o.panel !== undefined
    const vars = [overlay.length > 0 ? 'frame' : undefined, main.length > 0 ? 'main' : undefined, hasPanel && panelKids.length > 0 ? 'panel' : undefined].filter(Boolean)
    const head = vars.length > 0 ? `const { ${vars.join(', ')} } = ` : ''
    const args = [n.name, n.x ?? 0, y, tidy(o)]
    lines.push(...collect(args), `${head}${callOf('kit.Workbench', args)}`)
    place('main', main, lines)
    if (hasPanel) place('panel', panelKids, lines)
    if (overlay.length > 0) place('frame', overlay, lines)
  }

  // Login page: the card sits in the slot of the page, its forms are kit.LoginForm(card) with their content added
  function loginPage (n, y, lines) {
    const view = pen.viewOf(n)
    const call = invertView(view, env)
    const args = [n.name, n.x ?? 0, y, tidy(call.args[3])]
    lines.push(...collect(args), `const { card } = ${callOf('kit.LoginPage', args)}`)
    const card = slotKids(view, call.def, 'Card slot').find((k) => k.type === 'ref')
    const cardView = card === undefined ? null : pen.viewOf(card)
    for (const k of cardView === null ? [] : slotKids(cardView, env.defs.get(cardView.name), '$root')) {
      if (k.type === 'ref' && pen.compName(k) === 'Login/LoginForm') {
        const fv = pen.viewOf(k)
        const v = name('form')
        const pad = pad4(fv.props.padding)
        const o = pad !== undefined && pad.join() !== '32,32,32,32' ? { pad } : undefined
        lines.push(`const ${v} = ${callOf('kit.LoginForm', [new Code('card'), o])}`)
        for (const c of slotKids(fv, env.defs.get(fv.name), '$root')) {
          const s = shape(c)
          if (s !== null) lines.push(...s.pre, `kit.add(${v}, ${s.src})`)
        }
      } else {
        const s = shape(k)
        if (s !== null) lines.push(...s.pre, `kit.add(card, ${s.src})`)
      }
    }
  }

  function topLevel (n, y, lines) {
    if (n.enabled === false) return
    if (n.type === 'ref' && pen.compName(n)?.startsWith('Workbench/Workbench')) return workbench(n, y, lines)
    if (n.type === 'ref' && pen.compName(n) === 'Login/LoginPage') return loginPage(n, y, lines)
    const w = typeof n.width === 'number' ? n.width : undefined
    const h = typeof n.height === 'number' ? n.height : undefined
    const view = n.type === 'ref' ? pen.viewOf(n) : null
    const size = [w ?? view?.comp?.width, h ?? view?.comp?.height]
    if (size.some((v) => typeof v !== 'number')) {
      lines.push(todo('size of the screen is not fixed, 400x300 is used', n))
      size[0] = typeof size[0] === 'number' ? size[0] : 400
      size[1] = typeof size[1] === 'number' ? size[1] : 300
    }
    const fill = n.type === 'frame' ? color(n.fill, n) : undefined
    const f = name(n.name)
    lines.push(...env.pre.splice(0), `const ${f} = ${callOf('kit.Frame', [n.name, n.x ?? 0, y, size[0], size[1], fill === undefined || fill === '#FFFFFF' ? undefined : { fill }])}`)
    if (n.type === 'frame') {
      const inner = frame({ ...n, x: 0, y: 0 })
      if (n.layout === 'none') {
        // The children of a frame without layout sit in the screen itself
        place(f, n.children ?? [], lines)
      } else lines.push(...inner.pre, `kit.at(${f}, ${inner.src}, 0, 0)`)
    } else {
      const s = shape({ ...n, x: 0, y: 0 })
      if (s !== null) lines.push(...s.pre, `kit.at(${f}, ${s.src}, 0, 0)`)
    }
  }

  const isPageMark = (n) => n.type === 'frame' && /^Page: /.test(n.name ?? '') && (n.children ?? []).length === 1 && n.children[0].type === 'text'
  const out = ['// Imported from ' + basename(file) + ' by dev/pen/import.mjs']
  let current = null
  let pageY = 0
  let any = false
  let wanted = page === undefined
  const startPage = (title) => {
    wanted = page === undefined || page === title
    if (wanted) out.push('', `await kit.page(${quote(title)})`)
    current = title
  }
  for (const n of pen.doc.children) {
    if (isPageMark(n)) {
      startPage(n.name.slice(6))
      pageY = (n.y ?? 0) + 140
      continue
    }
    if (current === null) {
      startPage(basename(file).replace(/\.pen$/, ''))
      pageY = 0
    }
    if (!wanted) continue
    const lines = []
    topLevel(n, (n.y ?? 0) - pageY, lines)
    any = true
    out.push('{', ...lines.map((l) => '  ' + l.split('\n').join('\n  ')), '}')
  }
  if (!any) throw new Error(`no screens in ${file}${page ? ` (page ${page})` : ''}`)
  out.push('await kit.settle()', '')
  return { script: out.join('\n'), todos, stats: {} }
}

async function main () {
  const args = process.argv.slice(2)
  const option = (n) => (args.indexOf(n) >= 0 ? args.splice(args.indexOf(n), 2)[1] : undefined)
  const outArg = option('--out')
  const page = option('--page')
  const file = args[0]
  if (file === undefined) {
    console.error('usage: node dev/pen/import.mjs <file.pen> [--out <script.js>] [--page <name>]')
    process.exit(2)
  }
  const { script, todos } = await importPen(resolve(file), { page })
  if (outArg === undefined) console.log(script)
  else writeFileSync(resolve(outArg), script)
  console.error(`${todos.length} TODO(import)`)
  for (const t of todos) console.error(`  ${t.msg}, node "${t.node}"`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
