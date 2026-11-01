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

// Components whose slots carry data: the kit function takes a list (nav entries, cards, table rows) and draws
// one child per entry, so the children of the slot are read back into the list. Everything else in the inverse is
// derived from the library samples (inverse.mjs).
import { findAddr, nestedCall, nodeCall, palName, propOf, registerLifts, shown, slotAddr, slotKids } from './inverse.mjs'

export const tokenOf = (c) => (typeof c === 'string' && c.startsWith('$') ? c.replace(/^\$(§|[^:]*:)?/, '') : undefined)
const textOf = (n) => (n?.type === 'text' ? n.content : undefined)
const firstText = (n) => (n.type === 'text' ? n.content : (n.children ?? []).map(firstText).find((t) => t !== undefined))
const iconOf = (n) => (n.type === 'ref' ? ((n.name ?? '').startsWith('icon/') ? n.name.slice(5) : undefined) : (n.children ?? []).map(iconOf).find((t) => t !== undefined))
const hasTick = (n) => (n.children ?? []).some((c) => c.type === 'ref' && c.name === 'icon/tick')


// Content of the text named `name` in the component: the override of the instance or the library one
const textNamed = (view, def, name) => {
  const a = findAddr(def, (n) => n.type === 'text' && n.name === name)
  return a === undefined ? undefined : view.ov.get(a)?.props.content ?? def.nodes.get(a).content
}
const kidNamed = (kids, name) => kids.find((k) => k.name === name)
const kidText = (k) => (k?.children ?? []).find((c) => c.type === 'text')?.content

// Navigator entries from the children of the items slot. Layout flags (tight divider, compact captions) are not in the
// nodes: they are read from the vertical gaps (the algorithm is kit.Navigator in dev/design/kit/30-workbench.js)

// Colors that tell the kinds of a button apart: fill, stroke, icon and label
const colorSig = (view, def) => {
  const tok = (c) => (typeof c === 'string' && c !== '#00000000' ? tokenOf(c) ?? c : undefined)
  const root = def.nodes.get('')
  const ia = findAddr(def, (n) => n.type === 'ref' && n.name?.startsWith('icon/'))
  const ta = findAddr(def, (n) => n.type === 'text')
  const own = (a, prop) => propOf(view, a, prop) ?? def.nodes.get(a)?.[prop]
  return [
    tok(view.props.fill ?? root.fill), tok(view.props.stroke ?? root.stroke),
    ia !== undefined && shown(view, def, ia) ? tok(own(ia, 'stroke') ?? own(ia, 'fill')) : undefined,
    ta !== undefined && shown(view, def, ta) ? tok(own(ta, 'fill')) : undefined
  ]
}
// Fill and stroke must agree, a missing icon or label does not rule a kind out
const sameSig = (a, b) => a.every((x, i) => x === b[i] || (i > 1 && (x === undefined || b[i] === undefined)))

function navEntries (kids, env) {
  // Entries dragged under the footer line in a hand-edited file still sit above it: the order follows y then
  const fl = kids.findIndex((k) => k.name === 'footer line')
  if (fl >= 0 && kids.slice(fl + 1).some((k) => k.y < kids[fl].y)) kids = [...kids].sort((a, b) => a.y - b.y)
  const out = []
  const base = []
  let footer
  let divider
  let chevron = false
  const push = (entry, y) => {
    out.push(entry)
    base.push(y)
  }
  // A divider that no group or caption claims is an entry of its own
  const flush = () => {
    if (divider !== undefined) push({ divider: true }, divider.y - 12)
    divider = undefined
  }
  for (const k of kids) {
    if (k.name === 'footer line') {
      flush()
      footer = []
      continue
    }
    const c = k.type === 'ref' ? nodeCall(k, env) : null
    if (footer !== undefined) {
      if (c?.fn === 'NavItem') footer.push({ item: c.args[0], ...c.args[1] })
    } else if (k.name === 'divider') {
      flush()
      divider = k
    } else if (k.name === 'chevron') {
      chevron = true
    } else if (c?.fn === 'NavGroupHeader') {
      push({ group: c.args[0], ...c.args[1] }, k.y - 12)
      divider = undefined
    } else if (c?.fn === 'NavCaption') {
      // A caption keeps its own divider 11 px above it
      const own = divider !== undefined && k.y - divider.y === 11
      if (!own) flush()
      push({ caption: c.args[0], ...(chevron ? { chevron: true } : {}), ...(c.args[2]?.menu ? { menu: true } : {}), ...(own ? {} : { noDivider: true }) }, own ? divider.y - 12 : k.y - 10)
      divider = undefined
      chevron = false
    } else if (c?.fn === 'NavItem') {
      flush()
      const { w, ...o } = c.args[1] ?? {}
      push({ item: c.args[0], ...o, ...(w !== undefined && w !== 255 ? { w } : {}) }, k.y)
    } else if (c?.fn === 'NavSpaceHeader') {
      flush()
      push({ space: c.args[0], ...c.args[1] }, k.y + 4)
    }
  }
  flush()
  // Distance to the next entry; a tight divider and the 4 px under a compact section are seen as differences
  const step = (e) => (e.item !== undefined || e.space !== undefined ? 32 : e.group !== undefined ? 61 : e.caption !== undefined ? (e.noDivider ? 40 : 53) : 25)
  let section
  out.forEach((e, i) => {
    if (i > 0) {
      const delta = base[i] - (base[i - 1] + step(out[i - 1]))
      if (e.item === undefined && section !== undefined && delta === 4) section.compact = true
      else if (out[i - 1].divider && delta === -4) out[i - 1].tight = true
    }
    if (e.item === undefined) section = e.caption !== undefined && out[i + 1]?.item !== undefined ? e : undefined
  })
  return { nav: out, footer }
}

const tabsOf = (kids, env) => {
  const calls = kids.map((k) => nodeCall(k, env)).filter((c) => c?.fn === 'NavItem')
  return { tabs: calls.map((c) => (c.args[1]?.icon ? [c.args[0], c.args[1].icon] : c.args[0])), tab: calls.find((c) => c.args[1]?.selected)?.args[0] }
}

registerLifts({
  NavItem (call, view) {
    const p = view.props.padding
    const left = Array.isArray(p) ? (p.length === 4 ? p[3] : p[1]) : p
    // The library padding is 10, an entry of a project is indented by 22
    if (left === 32) call.args[1].indent = true
  },

  Button (call, view, def, env) {
    const o = call.args[0]
    const name = view.node?.name
    const auto = ['Button', `Button/${o.kind}/${o.size}`, `IconButton/${o.icon}`]
    if (name && !auto.includes(name)) o.name = name
    if (!o.label && name === `IconButton/${o.icon}`) call.iconButton = true
    // Kinds with the same look but the icon color tie in the fit: the color of the icon tells them apart
    const ia = findAddr(def, (n) => n.type === 'ref' && n.name?.startsWith('icon/'))
    const color = ia === undefined ? undefined : propOf(view, ia, 'stroke') ?? propOf(view, ia, 'fill')
    const own = ia === undefined ? undefined : def.nodes.get(ia).stroke ?? def.nodes.get(ia).fill
    if (color !== undefined && tokenOf(color) !== tokenOf(own)) {
      for (const d of env.defs.values()) {
        const a = d.call?.fn === 'Button' ? d.call.args[0] : undefined
        if (a === undefined || a.size !== o.size || !a.label !== !o.label) continue
        const n = d.nodes.get(findAddr(d, (x) => x.type === 'ref' && x.name?.startsWith('icon/')) ?? '')
        if (tokenOf(n?.stroke ?? n?.fill) === tokenOf(color)) {
          o.kind = a.kind
          break
        }
      }
    }
  },

  StatusChip (call, view, def, env) {
    const o = call.args[2] ?? (call.args[2] = {})
    const p = view.props
    if (typeof p.width === 'number') o.w = p.width
    if (typeof p.height === 'number') o.h = p.height
    if (p.fill !== undefined) o.fill = env.color(p.fill)
    if (p.stroke !== undefined) o.stroke = env.color(p.stroke)
    const t = view.ov.get(String((def.nodes.size > 0 ? [...def.nodes].find(([, n]) => n.type === 'text')?.[0] : '')))
    if (t?.props.fontSize && t.props.fontSize !== 11) o.size = t.props.fontSize
  },

  Notice (call, view) {
    const o = call.args[2] ?? (call.args[2] = {})
    // A pill is round at the ends (radius 14), the library notice has 6
    if (view.props.cornerRadius === 14) o.pill = true
    if (typeof view.props.width === 'number') o.w = view.props.width
  },

  ColumnHeader (call, view, def, env) {
    const o = call.args[4] ?? (call.args[4] = {})
    // Only the limit turns red when it is exceeded
    const la = findAddr(def, (n) => n.type === 'text' && n.name.startsWith('/ '))
    if (la !== undefined && tokenOf(view.ov.get(la)?.props.fill) === 'theme-state-negative-color') o.over = true
    const bg = tokenOf(view.props.fill)
    const pal = bg?.startsWith('palbg-') ? bg.slice(6) : Object.entries(env.TOKENS.paletteBackground.light).find(([, v]) => v === view.props.fill)?.[0]
    if (pal !== undefined && pal !== env.kit.CATEGORY[call.args[1]]) o.color = pal
  },

  FilterChip (call, view, def) {
    // The cross is switched off by the instance: a condition of a settings table
    const ra = findAddr(def, (n) => n.name === 'remove')
    if (ra !== undefined && !shown(view, def, ra)) (call.args[3] ??= {}).plain = true
  },

  Chip (call, view, def, env) {
    call.args[0] = slotKids(view, def, '$root').map((k) => env.conv(k))
    if (view.node?.name && view.node.name !== 'Chip') call.args[1] = { name: view.node.name }
  },

  Switcher (call, view, def, env) {
    const kids = slotKids(view, def, '$root')
    // The elements are frames named after their item, the selected one is filled
    call.args[0] = kids.map((k) => k.name.replace(/^element /, ''))
    call.args[1] = kids.find((k) => k.fill !== undefined)?.name.replace(/^element /, '')
    if (view.node?.name && view.node.name !== 'Switcher') call.args[2] = { name: view.node.name }
  },

  Menu (call, view, def, env) {
    if (view.node?.name && view.node.name !== 'Menu') call.args[1].name = view.node.name
    call.args[0] = slotKids(view, def, '$root').map((k) => {
      if (k.name === 'divider') return '-'
      if (k.name === 'header') {
        const t = (k.children ?? []).find((c) => c.type === 'text')
        return { header: t?.name?.toUpperCase() === t?.content ? t.name : firstText(k) }
      }
      const kids = k.children ?? []
      const label = k.name.replace(/^item\//, '')
      const labels = kids.find((c) => c.name === 'labels')?.children ?? []
      const item = { label }
      const icon = kids.find((c) => c.type === 'ref' && c.name.startsWith('icon/') && c.name !== 'icon/tick')
      if (icon) item.icon = icon.name.slice(5)
      const swatch = kids.find((c) => c.name === 'swatch')
      if (swatch) item.color = palName(swatch.fill, env) ?? tokenOf(swatch.fill)?.replace(/^pal-/, '')
      const description = labels.find((t) => t.type === 'text' && t.content !== label)
      if (description) item.description = description.content
      const hint = kids.find((c) => c.type === 'text')
      if (hint) item.hint = hint.content
      if (hasTick(k)) item.selected = true
      if (tokenOf(labels.find((t) => t.content === label)?.fill) === 'primary-button-default') item.accent = true
      if (tokenOf(k.fill) === 'theme-popup-hover') item.hover = true
      return item
    })
  },

  Table (call, view, def, env) {
    const cols = slotKids(view, def, 'head').map((th) => ({ title: firstText(th) ?? '', w: th.width }))
    const rows = slotKids(view, def, 'body').filter((k) => k.name === 'row').map((row) => (row.children ?? []).map((td) => {
      const c = (td.children ?? [])[0]
      const plain = c?.type === 'text' && (c.fontSize ?? 14) === 14 && c.fontWeight === undefined && tokenOf(c.fill) === 'theme-caption-color'
      return plain ? c.content : c === undefined ? '' : env.conv(c)
    }))
    call.args[0] = cols
    call.args[1] = rows
    if (view.node?.name && view.node.name !== 'Table') call.args[2] = { name: view.node.name }
  },

  FormRow (call, view, def, env) {
    const kids = slotKids(view, def, 'control')
    call.args[1] = kids.length === 1 ? env.conv(kids[0]) : env.row('control', kids)
    const o = call.args[2]
    if (view.props.alignItems === 'start') o.alignTop = true
    if (typeof view.props.width === 'number' && view.props.width !== 720) o.w = view.props.width
  },

  ClassicButton (call, view, def, env) {
    const o = call.args[0]
    const name = view.node?.name
    if (name && name !== `ClassicButton/${o.kind}/${o.size}`) o.name = name
    const size = { 28: 'small', 32: 'medium', 36: 'large' }[view.props.height]
    if (size !== undefined) o.size = size
    if (tokenOf(view.props.fill) === 'primary-button-disabled') {
      o.kind = 'primary'
      o.disabled = true
    } else if (tokenOf(view.props.fill) === 'theme-button-disabled') {
      o.kind = 'regular'
      o.disabled = true
    } else {
      // Variants of other kinds can tie in the fit: the colors tell the kind
      const mine = colorSig(view, def)
      const kinds = [...env.defs.values()].filter((d) => d.call?.fn === 'ClassicButton' && !d.lib.penalty && sameSig(colorSig({ props: {}, ov: new Map() }, d), mine)).map((d) => d.call.args[0].kind)
      if (kinds.length > 0 && !kinds.includes(o.kind)) o.kind = kinds[0]
    }
    const ia = findAddr(def, (n) => n.type === 'ref' && n.name?.startsWith('icon/'))
    const w = ia === undefined || !shown(view, def, ia) ? undefined : propOf(view, ia, 'width')
    if (typeof w === 'number' && w !== 16) o.iconSize = w
    if (def.nodes.get('')?.slot !== undefined) {
      const kids = slotKids(view, def, '$root')
      o.content = kids.length === 1 ? env.conv(kids[0]) : env.row('content', kids)
    }
  },

  Modal (call, view, def, env) {
    const o = call.args[1]
    if (typeof view.props.width === 'number') o.w = view.props.width
    const ok = nestedCall(view, def, findAddr(def, (n) => n.type === 'ref' && n.name === 'Button/primary/medium'), env)
    if (ok?.args[0]?.label && ok.args[0].label !== 'Save') o.okLabel = ok.args[0].label
    call.content = slotKids(view, def, 'body')
  },

  GridRow (call, view, def, env) {
    const kids = slotKids(view, def, 'control')
    call.args[1] = kids.length === 1 ? env.conv(kids[0]) : env.row('control', kids)
    const o = call.args[2]
    for (const k of ['alignTop', 'padded', 'last', 'w']) delete o[k]
    if (typeof view.props.width === 'number') o.w = view.props.width
    if (view.props.alignItems === 'start') o.alignTop = true
    if (view.props.padding === 0) o.last = true
    const pad = view.ov.get(slotAddr(def, 'control'))?.props.padding
    if (Array.isArray(pad) && pad[0] === 12) o.padded = true
  },

  PanelHeader (call, view, def, env) {
    const o = call.args[1]
    delete o.actions
    const actions = slotKids(view, def, 'actions').map((k) => env.conv(k))
    if (actions.length > 0) o.actions = actions
  },

  Message (call, view) {
    const o = call.args[0]
    if (typeof view.props.width === 'number') o.w = view.props.width
  },

  MessageInput (call, view, def) {
    const field = findAddr(def, (n) => n.type === 'text')
    const placeholder = view.ov.get(field)?.props.content
    if (placeholder !== undefined) call.args[0].placeholder = placeholder
  },

  IssueRow (call, view, def, env) {
    const kids = slotKids(view, def, 'row')
    const d = {}
    const first = (k) => (k?.children ?? [])[0]
    d.id = kidText(kidNamed(kids, 'id'))
    d.priority = nodeCall(first(kidNamed(kids, 'priority')) ?? {}, env)?.args[0]
    const status = nodeCall(first(kidNamed(kids, 'status')) ?? {}, env)
    d.cat = status?.args[0]
    if (status?.args[2] !== undefined) d.color = status.args[2]
    d.title = kidNamed(kids, 'title')?.content
    const sub = kidNamed(kids, 'sub-issues')
    if (sub) d.sub = (sub.children ?? []).find((c) => c.type === 'text')?.content
    for (const [name, key] of [['comments', 'com'], ['attachments', 'att']]) {
      const k = kidNamed(kids, name)
      if (k) d[key] = Number(kidText(k))
    }
    const labels = kids.filter((k) => k.name?.startsWith('Label '))
    if (labels.length > 0) d.labels = labels.map((k) => [k.name.slice(6), palName(first(k)?.fill, env)])
    for (const [icon, key] of [['milestone', 'milestone'], ['component', 'component'], ['calendar', 'due']]) {
      const k = kidNamed(kids, 'ListChip/' + icon)
      if (!k) continue
      const t = (k.children ?? []).find((c) => c.type === 'text')
      d[key] = t?.content
      if (key === 'due' && tokenOf(t?.fill) === 'theme-state-negative-color') d.overdue = true
    }
    const colText = (name) => (kidNamed(kids, 'col ' + name)?.children ?? []).find((c) => c.type === 'text')?.content
    d.rep = parseFloat(colText('reported'))
    const est = (kidNamed(kids, 'estimation')?.children ?? []).find((c) => c.type === 'text')?.content
    if (est !== undefined && est !== '0h') d.est = est
    d.created = colText('created')
    d.modified = colText('modified')
    const who = nodeCall(kids.at(-1) ?? {}, env)
    if (who?.fn === 'Avatar') d.assignee = [who.args[0], who.args[1]]
    call.args[0] = d
    const border = findAddr(def, (n) => n.name === 'border')
    call.args[2] = shown(view, def, border) ? {} : { last: true }
  },

  IssueGroup (call, view, def, env) {
    const g = {}
    g.name = call.args[0].name
    g.estimation = textNamed(view, def, 'estimation')
    const icon = nestedCall(view, def, findAddr(def, (n) => n.type === 'frame' && n.name?.startsWith('StatusIcon/')), env)
    g.cat = icon?.args[0]
    if (icon?.args[2] !== undefined) g.color = icon.args[2]
    g.issues = slotKids(view, def, 'rows').map((k) => nodeCall(k, env)).filter((c) => c?.fn === 'IssueRow').map((c) => c.args[0])
    call.args[0] = g
  },

  IssueList (call, view, def, env) {
    call.args[0] = slotKids(view, def, '$root').map((k) => nodeCall(k, env)).filter((c) => c?.fn === 'IssueGroup').map((c) => c.args[0])
  },

  // The page is drawn at fixed positions (kit.IssuePage in dev/design/kit/40-tracker.js): fields are read back by them
  IssuePage (call, view, def, env) {
    const kids = slotKids(view, def, '$root')
    const at = (x, y) => kids.find((k) => k.x === x && k.y === y)
    const text = (k) => (k?.type === 'text' ? k.content : kidText(k))
    const d = {}
    const crumbs = kidNamed(kids, 'breadcrumb')?.children ?? []
    d.id = text(crumbs[2])
    d.project = kidText(crumbs[0])
    d.title = kidNamed(kids, 'title')?.content
    const description = kidNamed(kids, 'description')?.content
    if (description !== 'Add description...') d.description = description
    d.subIssues = kids.map((k) => (k.type === 'ref' ? nodeCall(k, env) : null)).filter((c) => c?.fn === 'IssueRow').map((c) => c.args[0])
    d.activity = kids.filter((k) => k.name === 'update').map((k) => {
      const parts = kidNamed(k.children ?? [], 'text')?.children ?? []
      return { time: text(kids.find((t) => t.type === 'text' && t.x === 98 && t.y === k.y + 2)), text: parts[0]?.content, ...(parts[1] !== undefined ? { strong: parts[1].content } : {}) }
    })
    d.created = text(at(1305, 807))
    const avatar = kids.find((k) => k.type === 'ref' && k.x === 82)
    const author = kidNamed(kids, 'author')?.children?.[0]
    const who = avatar === undefined ? null : nodeCall(avatar, env)
    if (who?.fn === 'Avatar') d.creator = [who.args[0], who.args[1], author?.content]
    const value = (y) => (at(1291, y)?.children ?? [])
    const status = value(73)
    const icon = nodeCall(status[0] ?? {}, env)
    d.cat = icon?.args[0]
    if (icon?.args[2] !== undefined) d.color = icon.args[2]
    d.statusName = status[1]?.content
    d.priority = nodeCall(value(109)[0] ?? {}, env)?.args[0]
    const assignee = nodeCall(value(181)[0] ?? {}, env)
    if (assignee?.fn === 'Avatar') d.assignee = [assignee.args[0], assignee.args[1], value(181)[1]?.content]
    const component = value(325)[1]?.content
    if (component !== 'Component') d.component = component
    const milestone = value(361)[1]?.content
    if (milestone !== 'Milestone') d.milestone = milestone
    const est = value(435)[0]?.content
    if (est !== '0h') d.est = est
    d.rep = parseFloat(value(469)[0]?.content)
    call.args[0] = d
  },

  IssueCard (call, view, def, env) {
    const d = call.args[0]
    for (const k of ['priority', 'sub', 'due', 'overdue', 'component', 'milestone', 'labels', 'est', 'estLabel', 'parent', 'density']) delete d[k]
    let density = view.name.split('/')[2]
    // A detailed card without estimation and labels fits the normal one best, its own padding tells them apart
    if (density === 'normal' && JSON.stringify(view.props.padding) === '[12,14]') density = undefined
    if (density !== undefined) d.density = density
    const textAt = (name) => {
      const a = findAddr(def, (n) => n.type === 'text' && n.name === name)
      return a !== undefined && shown(view, def, a) ? view.ov.get(a)?.props.content ?? def.nodes.get(a).content : undefined
    }
    // The dense card cuts the title to one line: the cut text is all an instance keeps
    if (density === 'dense') d.title = textAt('title') ?? d.title
    const parent = textAt('parent')
    if (parent !== undefined) d.parent = parent.replace(/^› /, '')
    const footer = textAt('footer')
    if (footer !== undefined) {
      const [label, ...rest] = footer.split(' ')
      d.est = rest.join(' ')
      if (label !== 'Оценка') d.estLabel = label
    }
    const labels = []
    const compactKids = density === 'compact' ? slotKids(view, def, 'meta') : []
    for (const chip of density === 'compact' ? compactKids : slotKids(view, def, 'chips')) {
      const text = (chip.children ?? []).find((c) => c.type === 'text')
      if (chip.name === 'priority') {
        const p = nodeCall((chip.children ?? [])[0] ?? {}, env)
        if (p?.fn === 'PriorityIcon') d.priority = p.args[0]
      } else if (chip.name === 'sub-issues') d.sub = text?.content
      else if (chip.name === 'due date') {
        d.due = text?.content
        if (tokenOf(text?.fill) === 'theme-state-negative-color') d.overdue = true
      } else if (chip.name === 'component' || chip.name === 'milestone') {
        if (text) d[chip.name] = text.content
      } else if (chip.name === 'est') d.est = text?.content
      else if (chip.name === 'label') {
        const dot = (chip.children ?? []).find((c) => c.type === 'ellipse')
        labels.push([text?.content, palName(dot?.fill, env) ?? 'Sky'])
      } else if (chip.type === 'ref') {
        const p = nodeCall(chip, env)
        if (p?.fn === 'PriorityIcon') d.priority = p.args[0]
        // The compact card shows an attribute as an icon, its value is not drawn
        else if (/^icon\/(subissues|calendar|component|milestone)$/.test(chip.name)) d[{ subissues: 'sub', calendar: 'due' }[chip.name.slice(5)] ?? chip.name.slice(5)] = true
      } else if (chip.type === 'text') {
        if (chip === compactKids[0]) d.id = chip.content
        else d.est = chip.content
      }
    }
    if (labels.length > 0) d.labels = labels
    if (view.props.stroke !== undefined) d.accent = env.color(view.props.stroke)
    if (d.priority === undefined) d.priority = 'none'
    if (Array.isArray(d.assignee)) {
      // The card avatar is always round: the size and round flags of the nested call are not data
      d.assignee = [d.assignee[0], d.assignee[1]]
      if (d.assignee.every((x) => x === undefined)) delete d.assignee
    }
  },

  KanbanColumn (call, view, def, env) {
    const h = nestedCall(view, def, '0', env)
    const [name, cat, count, , o] = h.args
    const col = { name, cat, count, ...o }
    const sa = findAddr(def, (n) => n.slot !== undefined && n.name === 'statuses')
    if (shown(view, def, sa)) col.statuses = slotKids(view, def, 'statuses').map((k) => nodeCall(k, env)).filter((c) => c?.fn === 'StatusChip').map((c) => [c.args[0], c.args[1]])
    col.cards = slotKids(view, def, 'cards').map((k) => nodeCall(k, env)).filter((c) => c?.fn === 'IssueCard').map((c) => c.args[0])
    call.args[0] = col
  },

  Navigator (call, view, def, env) {
    const o = call.args[1]
    if (!('newLabel' in o)) o.newLabel = null
    if (o.tools !== undefined) {
      o.tools = o.tools.filter(Boolean)
      if (o.tools.length === 0) delete o.tools
    }
    const add = findAddr(def, (n) => n.type === 'frame' && n.name === 'New')
    if (add !== undefined && !shown(view, def, add)) o.newLabel = null
    const r = navEntries(slotKids(view, def, 'items'), env)
    o.nav = r.nav
    if (r.footer?.length) o.footer = r.footer
    else delete o.footer
  },

  TopBar (call, view, def, env) {
    const icon = nestedCall(view, def, findAddr(def, (n) => n.type === 'ref' && n.name === 'icon/kit/CheckSquare'), env)
    if (icon?.fn === 'icon' && icon.args[0] !== 'kit/CheckSquare') (call.args[1] ?? (call.args[1] = {})).tabIcon = icon.args[0]
  },

  AppRail (call, view, def, env) {
    // The selected app is the button with a fill
    let selected = false
    for (const [a, n] of def.nodes) {
      const fill = view.ov.get(a)?.props.fill ?? n.fill
      if (!n.name?.startsWith('AppItem ') || typeof fill !== 'string' || fill === '#00000000') continue
      const app = env.kit.RAIL_APPS.find((it) => 'AppItem ' + it.icon === n.name)?.app
      if (app !== undefined && app !== 'tracker') (call.args[1] ?? (call.args[1] = {})).app = app
      selected = true
    }
    // No button selected (the settings app has none in the rail)
    if (!selected) (call.args[1] ?? (call.args[1] = {})).app = 'none'
  },

  Sidebar (call, view) {
    const o = call.args[1]
    const widgets = o.widgets ?? []
    // The open widget has a filled button
    const open = widgets.findIndex((_, i) => view.ov.get(String(i))?.props.fill)
    if (open >= 0) o.selected = widgets[open]
  },

  Workbench (call, view, def, env) {
    const o = call.args[3]
    if (view.props.width !== undefined) o.w = view.props.width
    if (view.props.height !== undefined) o.h = view.props.height
    const nested = (name) => nestedCall(view, def, findAddr(def, (n) => n.type === 'ref' && n.name === name), env)
    const nav = nested('Navigator')
    for (const k of ['tools', 'footer']) if (nav?.args[1]?.[k] !== undefined) o[k] = nav.args[1][k]
    const rail = nested('App rail')
    if (rail?.args[1]?.app !== undefined) o.app = rail.args[1].app
    const bar = nested('Top bar')
    if (bar?.args[1]?.tabIcon !== undefined) o.tabIcon = bar.args[1].tabIcon
    if (nav?.args[1]?.title && nav.args[1].title !== 'Tracker') o.title = nav.args[1].title
    if (nav?.args[1]?.newLabel !== 'New issue' && nav?.args[1]?.newLabel !== undefined) o.newLabel = nav.args[1].newLabel
  },

  // Login parts. Options the samples do not show are read from the look of the instance
  LoginPage (call, view, def) {
    const row = findAddr(def, (n) => n.name === 'Copyright')
    const texts = [0, 1].map((i) => view.ov.get(`${row}/${i}`)?.props.content ?? def.nodes.get(`${row}/${i}`)?.content)
    const o = call.args[3] ?? (call.args[3] = {})
    if (texts.join('|') !== '© 2026,|Intabia Fusion') o.copyright = texts
  },

  LoginTabs (call, view, def) {
    // The selected tab has a filled underline
    const filled = (i) => {
      const a = `1/${i}/1`
      const f = view.ov.get(a)?.props.fill ?? def.nodes.get(a)?.fill
      return f !== undefined && f !== '#00000000'
    }
    const tabs = call.args[1]
    const i = tabs.findIndex((t, k) => t !== undefined && filled(k))
    call.args[2] = i >= 0 ? tabs[i] : undefined
  },

  LoginField (call, view, def) {
    const o = call.args[1] ?? (call.args[1] = {})
    const value = o.value
    if (typeof value === 'string' && /^\u2022+$/.test(value)) o.password = true
    if (view.props.stroke === '#EE7A7A99') o.error = true
    if (typeof view.props.width === 'number' && view.props.width !== 396) o.w = view.props.width
  },

  LoginButton (call, view) {
    const o = call.args[1] ?? (call.args[1] = {})
    if (typeof view.props.width === 'number' && view.props.width !== 396) o.w = view.props.width
  },

  LoginProviders (call, view, def, env) {
    const buttons = slotKids(view, def, '$root').flatMap((row) => row.children ?? [])
    call.args[0] = buttons.map((b) => {
      const c = nodeCall(b, env)
      return [c?.args[1]?.icon, c?.args[0]]
    })
    if (typeof view.props.width === 'number' && view.props.width !== 396) call.args[1] = view.props.width
  },

  LoginCheckbox (call, view, def) {
    const box = findAddr(def, (n) => n.name === 'box')
    const stroke = propOf(view, box, 'stroke') ?? def.nodes.get(box)?.stroke
    if (stroke === '#EE7A7A') (call.args[2] ?? (call.args[2] = {})).invalid = true
  },

  LoginLinks (call, view, def, env) {
    // A link row the session cut into rows is read as one
    const texts = (row) => (row.children ?? []).flatMap((c) => (c.type === 'frame' && c.name === 'row' ? c.children ?? [] : [c])).filter((c) => c.type === 'text')
    const rows = slotKids(view, def, '$root').map((row) => texts(row).map((t) => t.content))
    call.args[0] = rows.map((r) => (r.length > 1 ? r : [undefined, r[0]]))
    const o = call.args[1] ?? (call.args[1] = {})
    const first = slotKids(view, def, '$root')[0]
    if (texts(first ?? {})[0]?.fill === '#000061CC') o.accent = true
    if (typeof view.props.width === 'number' && view.props.width !== 396) o.w = view.props.width
  },

  LoginCode (call, view, def) {
    // Cells 0-2 and 4-6 of the template, an empty digit is replaced by a spacer
    call.args[0] = [0, 1, 2, 4, 5, 6].map((a) => {
      const e = view.ov.get(`${a}/0`)
      return e?.node !== undefined ? '' : e?.props.content ?? def.nodes.get(`${a}/0`)?.content ?? ''
    }).join('')
  },

  LoginWorkspace (call, view) {
    if (typeof view.props.width === 'number' && view.props.width !== 428) (call.args[2] ?? (call.args[2] = {})).w = view.props.width
  },

  LoginBackTitle (call, view) {
    if (typeof view.props.width === 'number' && view.props.width !== 428) (call.args[1] ?? (call.args[1] = {})).w = view.props.width
  },

  SpaceHeader (call, view, def, env) {
    const o = call.args[1]
    for (const k of ['view', 'title', 'titleIcon', 'titleNode', 'actions', 'filters', 'tabs', 'tab']) delete o[k]
    const left = slotKids(view, def, 'left')
    const sw = left.length > 0 ? nodeCall(left[0], env) : null
    if (sw?.fn === 'Switcher') o.view = sw.args[1] === 'kit/BulletList' ? 'list' : 'board'
    const title = left.at(-1)
    if (title?.name === 'Breadcrumb') {
      o.title = firstText(title)
      o.titleIcon = iconOf(title)
    } else if (left.length > 4) o.titleNode = env.conv(title)
    const right = slotKids(view, def, 'right')
    if (right.length > 1) o.actions = right.slice(0, -1).map((k) => env.conv(k))
    const filters = slotKids(view, def, 'filters').filter((k) => k.name !== 'Filter' && k.name !== 'Search')
    if (filters.length > 0) o.filters = filters.map((k) => env.conv(k))
    const modesAddr = findAddr(def, (n) => n.type === 'ref' && n.name === 'Mode tabs')
    const modes = nestedCall(view, def, modesAddr, env)
    if (modesAddr !== undefined && !shown(view, def, modesAddr)) o.tabs = []
    else if (modes?.fn === 'Switcher' && (modes.args[0].join() !== 'All,Active,Backlog' || modes.args[1] !== 'All')) {
      o.tabs = modes.args[0]
      o.tab = modes.args[1]
    }
  },

  SettingsLayout (call, view, def, env) {
    const o = call.args[1]
    for (const k of ['tabs', 'tab', 'subtabs', 'subtab', 'subLead', 'actions', 'close']) delete o[k]
    Object.assign(o, tabsOf(slotKids(view, def, 'Settings tabs'), env))
    const right = slotKids(view, def, 'right')
    const close = right.at(-1)
    if (close?.type === 'ref' && close.name === 'Close settings') o.close = true
    const actions = right.filter((k) => k !== close || !o.close)
    if (actions.length > 0) o.actions = actions.map((k) => env.conv(k))
    // The fit may pair the content frame with the subtabs row (both start with "Settings"): a row without a switcher is the content
    call.content = slotKids(view, def, 'Settings content')
    const sa = findAddr(def, (n) => n.slot !== undefined && n.name === 'Settings subtabs')
    if (shown(view, def, sa)) {
      const row = slotKids(view, def, 'Settings subtabs')
      const sw = nodeCall(row.at(-1) ?? {}, env)
      if (sw?.fn === 'Switcher') {
        o.subtabs = sw.args[0]
        o.subtab = sw.args[1]
        if (row.length > 2) o.subLead = env.conv(row[0])
      } else call.content = row
    }
  }
})

// ui/kit components (dev/design/kit/25-ui-kit.js): list controls read their items back from the children of the root slot
const itemOf = (label, icon) => (icon === undefined ? label : [label, icon])
const named = (k, prefix) => k.name.slice(prefix.length)
const iconIn = (n) => {
  const i = iconOf(n)
  return i?.startsWith('icon/') ? i.slice(5) : i
}

registerLifts({
  Tabs (call, view, def) {
    const kids = slotKids(view, def, '$root').filter((k) => k.name.startsWith('tab '))
    call.args[0] = kids.map((k) => itemOf(named(k, 'tab '), iconIn((k.children ?? [])[0] ?? {})))
    call.args[1] = named(kids.find((k) => (k.children ?? []).some((c) => c.name === 'underline' && c.fill !== undefined)) ?? kids[0] ?? { name: 'tab ' }, 'tab ')
  },

  SegmentedControl (call, view, def) {
    const kids = slotKids(view, def, '$root').filter((k) => k.name.startsWith('segment '))
    call.args[0] = kids.map((k) => {
      const texts = (k.children ?? []).filter((c) => c.type === 'text')
      const icon = iconIn(k)
      return texts.length > 1 ? [named(k, 'segment '), icon, texts[1].content] : itemOf(named(k, 'segment '), icon)
    })
    call.args[1] = named(kids.find((k) => k.fill !== undefined) ?? kids[0] ?? { name: 'segment ' }, 'segment ')
  },

  ButtonGroup (call, view, def) {
    const kids = slotKids(view, def, '$root').filter((k) => k.name.startsWith('button '))
    call.args[0] = kids.map((k) => {
      const label = firstText(k)
      return [label ?? '', iconIn(k)]
    })
    call.args[1] = named(kids.find((k) => tokenOf(k.fill) === 'button-selected-BackgroundColor') ?? { name: 'button ' }, 'button ') || undefined
    // Both kinds have the same root, the stroke of the buttons tells them apart
    call.args[2] = { ...call.args[2], kind: kids.some((k) => k.stroke !== undefined) ? 'secondary' : 'ghost' }
  },

  Breadcrumbs (call, view, def) {
    call.args[0] = slotKids(view, def, '$root').filter((k) => k.name.startsWith('crumb ')).map((k) => itemOf(firstText(k), iconIn(k)))
  },

  Steps (call, view, def) {
    const rows = slotKids(view, def, '$root').filter((k) => k.name.startsWith('step '))
    const texts = rows.map((r) => (r.children ?? []).find((c) => c.type === 'text'))
    call.args[0] = texts.map((t) => String(t?.content ?? '').replace(/^\d+\. /, ''))
    const reached = texts.filter((t) => String(t?.fontWeight) === '500').length
    call.args[1] = reached > 0 ? reached - 1 : undefined
  },

  SettingRow (call, view, def, env) {
    const kids = slotKids(view, def, 'control')
    call.args[1] = kids.length === 1 ? env.conv(kids[0]) : env.row('control', kids)
    const o = call.args[2]
    delete o.details
    const da = slotAddr(def, 'details')
    const details = slotKids(view, def, 'details')
    if (da !== undefined && shown(view, def, da) && details.length > 0) o.details = details.map((k) => env.conv(k))
    if (typeof view.props.width === 'number' && view.props.width !== 560) o.w = view.props.width
    delete o.hint
    if (shown(view, def, findAddr(def, (n) => n.type === 'ref' && n.name === 'hint'))) o.hint = true
    if (propOf(view, '0', 'height') === 52) o.first = true
  },

  Section (call, view, def, env) {
    const o = call.args[2]
    call.args[1] = slotKids(view, def, 'content').map((k) => env.conv(k))
    delete o.actions
    const actions = slotKids(view, def, 'actions').map((k) => env.conv(k))
    if (actions.length > 0) o.actions = actions
    if (typeof view.props.width === 'number' && view.props.width !== 560) o.w = view.props.width
  },

  Dialog (call, view, def, env) {
    call.args[1] = slotKids(view, def, 'body').map((k) => env.conv(k))
    const o = call.args[2]
    if (typeof view.props.width === 'number') o.w = view.props.width
    // Footer buttons: Cancel, then the submit
    const buttons = [...def.nodes].filter(([, n]) => n.type === 'ref' && /^Button\/[a-z]+\/medium$/.test(n.name)).map(([a]) => nestedCall(view, def, a, env))
    const [cancel, submit] = buttons
    if (cancel?.args[0]?.label && cancel.args[0].label !== 'Cancel') o.cancelLabel = cancel.args[0].label
    if (submit?.args[0]?.label && submit.args[0].label !== 'Save') o.submitLabel = submit.args[0].label
    if (submit?.args[0]?.kind && submit.args[0].kind !== 'brand') o.submitKind = submit.args[0].kind
  },

  KitWizardDialog (call, view, def, env) {
    call.args[3] = slotKids(view, def, 'body').map((k) => env.conv(k))
    const steps = nodeCall(slotKids(view, def, 'steps')[0] ?? {}, env)
    if (steps?.fn === 'Steps') {
      call.args[1] = steps.args[0]
      call.args[2] = steps.args[1] ?? 0
    }
    const o = (call.args[4] ??= {})
    if (typeof view.props.width === 'number') o.w = view.props.width
    const h = propOf(view, findAddr(def, (n) => n.name === 'content'), 'height')
    if (typeof h === 'number' && h !== 400) o.h = h
  },

  // Widths of the samples are the kit defaults: a changed one goes back into `w`
  TextInput (call, view, def, env) {
    const o = call.args[0]
    const w = propOf(view, findAddr(def, (n) => n.name === 'field'), 'width')
    if (typeof w === 'number' && w !== 240) o.w = w
    const ta = findAddr(def, (n) => n.type === 'text' && n.content === 'Value')
    if (tokenOf(propOf(view, ta, 'fill')) === 'global-secondary-TextColor' && o.value !== undefined) {
      o.placeholder = o.value
      delete o.value
    }
  },

  TextArea (call, view) {
    if (typeof view.props.width === 'number' && view.props.width !== 320) call.args[0].w = view.props.width
  },

  Callout (call, view) {
    if (typeof view.props.width === 'number') (call.args[1] ??= {}).w = view.props.width
  },

  EmptyState (call, view) {
    const o = call.args[1]
    if (typeof view.props.width === 'number' && view.props.width !== (o.size === 'small' ? 320 : 416)) o.w = view.props.width
    if (typeof view.props.height === 'number' && view.props.height !== 196 && o.size !== 'small') o.h = view.props.height
  },

  KitChip (call, view, def, env) {
    const o = call.args[1]
    // A color from data: the palette token under the tint mix (pal-Orange-14-clear)
    const t = tokenOf(o.kind === 'outline' ? view.props.stroke : view.props.fill)
    if (o.tone === undefined && t?.startsWith('pal-')) o.color = env.color('$§' + t.replace(/-\d+-.*$/, ''))
  }
})

export { textOf }
