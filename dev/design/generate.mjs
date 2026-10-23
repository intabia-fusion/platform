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

// Generates the shared design data: kit/00-tokens.generated.js (theme tokens) and kit/05-demo.generated.js (demo data).
// Usage: node dev/design/generate.mjs <tokens|demo> [demo-checkout]
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')

// ---- Tokens from packages/theme/styles -------------------------------------

const REM = 16
const THEME_DIR = join(repo, 'packages/theme/styles')
// Blocks merged per mode, later ones win: the classes Theme.svelte sets for the Intabia accent.
const MODES = {
  light: ['*', ':root', '.theme-light', '.accent-intabia', '.accent-light-intabia'],
  dark: ['*', ':root', '.theme-dark', '.accent-intabia', '.accent-dark-intabia']
}

function scssBlocks (src) {
  const blocks = {}
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const re = /([^{};]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(clean)) !== null) {
    for (const sel of m[1].split(',').map((s) => s.trim())) {
      const vars = (blocks[sel] ??= {})
      for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim()
    }
  }
  return blocks
}

function toHex (v) {
  v = v.trim()
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('').toUpperCase()
  if (/^#[0-9a-f]{4}$/i.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('').toUpperCase()
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) return v.toUpperCase()
  const m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i)
  if (m === null) return undefined
  const h = (n) => Math.round(Number(n)).toString(16).padStart(2, '0')
  let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
  a = Math.max(0, Math.min(1, a))
  return ('#' + h(m[1]) + h(m[2]) + h(m[3]) + (a < 1 ? h(a * 255) : '')).toUpperCase()
}

function toPx (v) {
  const m = v.trim().match(/^(-?[\d.]+)(rem|px)$/)
  if (m === null) return undefined
  return m[2] === 'rem' ? Number(m[1]) * REM : Number(m[1])
}

function resolveVar (vars, value, depth = 0) {
  if (depth > 20) return undefined
  const m = value.match(/^var\(\s*--([\w-]+)\s*(?:,\s*(.+))?\)$/)
  if (m === null) return value
  if (vars[m[1]] !== undefined) {
    const r = resolveVar(vars, vars[m[1]], depth + 1)
    if (r !== undefined) return r
  }
  return m[2] !== undefined ? resolveVar(vars, m[2].trim(), depth + 1) : undefined
}

export function buildTokens () {
  const blocks = {}
  for (const f of readdirSync(THEME_DIR).filter((it) => it.endsWith('.scss'))) {
    for (const [sel, vars] of Object.entries(scssBlocks(readFileSync(join(THEME_DIR, f), 'utf8')))) {
      Object.assign((blocks[sel] ??= {}), vars)
    }
  }
  const out = { colors: {}, dimensions: {} }
  for (const [mode, sels] of Object.entries(MODES)) {
    const vars = Object.assign({}, ...sels.map((s) => blocks[s] ?? {}))
    const colors = {}
    for (const name of Object.keys(vars).sort()) {
      const v = resolveVar(vars, vars[name])
      if (v === undefined) continue
      const hex = toHex(v)
      if (hex !== undefined) colors[name] = hex
      else if (mode === 'light') {
        const px = toPx(v)
        if (px !== undefined) out.dimensions[name] = px
      }
    }
    out.colors[mode] = colors
  }
  // Category/label palette (status categories, priorities, labels) lives in TS, not SCSS
  const ts = readFileSync(join(repo, 'packages/ui/src/colors.ts'), 'utf8')
  const palettes = { light: 'whitePalette', dark: 'darkPalette' }
  out.palette = {}
  out.paletteTitle = {}
  out.paletteBackground = {}
  out.paletteBackgroundEnd = {}
  for (const [mode, name] of Object.entries(palettes)) {
    const start = ts.indexOf(`export const ${name}`)
    const body = ts.slice(start, ts.indexOf('\n])', start))
    // define(name, color, icon, title, number, background, percents): background mixes color over the theme bg
    const base = mode === 'light' ? [0xF1, 0xF1, 0xF4] : [0x1A, 0x1A, 0x28]
    out.palette[mode] = {}
    out.paletteTitle[mode] = {}
    out.paletteBackground[mode] = {}
    out.paletteBackgroundEnd[mode] = {}
    for (const m of body.matchAll(/define\('(\w+)',\s*'(\w{6})',\s*'\w{6}',\s*'(\w{6})',\s*'\w{6}',\s*'\w{6}',\s*\[(\d+),\s*(\d+)(?:,\s*(\d+))?/g)) {
      const rgb = [0, 2, 4].map((i) => parseInt(m[2].slice(i, i + 2), 16))
      const p = Number(m[5]) / 100
      out.palette[mode][m[1]] = '#' + m[2].toUpperCase()
      out.paletteTitle[mode][m[1]] = '#' + m[3].toUpperCase()
      const mix = (q) => '#' + rgb.map((c, i) => Math.round(c * q + base[i] * (1 - q)).toString(16).padStart(2, '0')).join('').toUpperCase()
      out.paletteBackground[mode][m[1]] = mix(p)
      // Dark headers are a horizontal gradient from this tint to the end percent (0 = panel color); light ones are flat
      out.paletteBackgroundEnd[mode][m[1]] = mix(m[6] === undefined ? p : Number(m[6]) / 100)
    }
  }
  return out
}

// ---- Demo data from tests/demo-ws* (branch FUSIO-1594) ---------------------

const TOKENS_FILE = join(here, 'kit/00-tokens.generated.js')
const DEMO_FILE = join(here, 'kit/05-demo.generated.js')
const DEMO_STORYBOOK_FILE = join(here, '../storybook/src/design/demo/demo.generated.json')
const DEMO_SETS = { ru: ['demo-ws', 'demo-ws.data.yaml'], en: ['demo-ws-en', 'demo-ws-en.data.yaml'] }
// dev/design/demo/<locale>: what the demo stand lacks (extra statuses, issues, boards), same file model as tests/demo-ws
const DEMO_EXTRA = join(here, 'demo')
const PRIORITIES = { Urgent: 'urgent', High: 'high', Medium: 'medium', Low: 'low' }
const STATUS_CATEGORY = { Backlog: 'backlog', Todo: 'todo', 'In Progress': 'active', Done: 'won', Canceled: 'lost' }

// Same hash as hashCode in packages/ui/src/colors.ts
function textHash (str) {
  return str.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
}

function demoLocale (root, loc, [dirName, dataName], palette) {
  const { load } = createRequire(join(repo, 'dev/tool/package.json'))('js-yaml')
  const dir = join(root, 'tests', dirName)
  const data = load(readFileSync(join(root, 'tests', dataName), 'utf8'))
  const byKey = (list) => new Map(list.map((it) => [it.key, it]))
  const components = byKey(data.components)
  const milestones = byKey(data.milestones)
  const tags = byKey(data.tags)
  const people = new Map()
  const person = (name) => {
    if (!people.has(name)) {
      const [first, last] = name.split(' ')
      people.set(name, { name, initials: (last[0] + first[0]).toUpperCase(), color: palette[Math.abs(textHash(name)) % palette.length] })
    }
    return name
  }
  const extra = join(DEMO_EXTRA, loc)
  // Header of a .md/.mdx file: the YAML between the first two --- lines
  const header = (file) => load(readFileSync(file, 'utf8').split(/^---$/m)[1])
  const entities = (cls) => {
    const found = []
    const walk = (folder) => {
      for (const e of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))) {
        if (e.isDirectory()) walk(join(folder, e.name))
        else if (e.name.endsWith('.mdx')) { const h = header(join(folder, e.name)); if (h?.class === cls) found.push(h) }
      }
    }
    if (existsSync(extra)) walk(extra)
    return found
  }
  const projects = []
  const extraStatuses = entities('tracker:class:IssueStatus')
  const statusCategory = { ...STATUS_CATEGORY, ...Object.fromEntries(extraStatuses.map((h) => [h.title, h.category])) }
  const readIssues = (project, folder, parent) => {
    for (const f of readdirSync(folder).sort()) {
      const m = f.match(/^(\d+)\.(.*)\.mdx?$/)
      if (m === null) continue
      const it = header(join(folder, f))
      if (it.class !== 'tracker:class:Issue') continue
      const id = `${project.id}-${m[1]}`
      project.issues.push({
        id,
        title: it.title,
        status: it.status,
        priority: PRIORITIES[it.priority] ?? 'none',
        ...(it.assignee !== undefined ? { assignee: person(it.assignee) } : {}),
        ...(it.estimation !== undefined ? { estimation: it.estimation } : {}),
        ...(it.remainingTime !== undefined ? { remaining: it.remainingTime } : {}),
        ...(data.issueLabels[id] !== undefined ? { labels: data.issueLabels[id].map((k) => [tags.get(k).title, palette[tags.get(k).color % palette.length]]) } : {}),
        ...(data.issueComponents[id] !== undefined ? { component: components.get(data.issueComponents[id]).label } : {}),
        ...(data.issueMilestones[id] !== undefined ? { milestone: milestones.get(data.issueMilestones[id]).label } : {}),
        ...(data.issueDueDates[id] !== undefined ? { dueDays: data.issueDueDates[id] } : {}),
        ...(parent !== undefined ? { parent } : {})
      })
      const sub = join(folder, f.replace(/\.mdx?$/, ''))
      if (existsSync(sub)) readIssues(project, sub, id)
    }
  }
  for (const f of readdirSync(dir).filter((it) => it.endsWith('.yaml')).sort()) {
    const [head] = readFileSync(join(dir, f), 'utf8').split(/^---$/m)
    const p = load(head)
    if (p.class !== 'tracker:class:Project') continue
    const project = { id: p.identifier, name: p.title, emoji: p.emoji, description: p.description.trim(), defaultStatus: p.defaultIssueStatus, issues: [] }
    readIssues(project, join(dir, f.slice(0, -5)), undefined)
    // Issues of the same project folder in the extra set
    if (existsSync(join(extra, f.slice(0, -5)))) readIssues(project, join(extra, f.slice(0, -5)), undefined)
    // sub[done, total] for parents, so a card can show "2/3"
    for (const it of project.issues) {
      const kids = project.issues.filter((k) => k.parent === it.id)
      if (kids.length > 0) it.sub = [kids.filter((k) => statusCategory[k.status] === 'won').length, kids.length]
    }
    projects.push(project)
  }
  const statuses = [...Object.entries(STATUS_CATEGORY).map(([name, category]) => ({ name, category, color: TOKEN_CATEGORY_COLOR[category] })),
    ...extraStatuses.map((h) => ({ name: h.title, category: h.category, color: h.color }))]
  const boards = entities('tracker:class:Board')
  return {
    projects,
    statuses,
    boards,
    people: [...people.values()],
    labels: data.tags.map((t) => ({ key: t.key, title: t.title, color: palette[t.color % palette.length] })),
    components: data.components.map((c) => c.label),
    milestones: data.milestones.map((x) => ({ label: x.label, inDays: x.offsetDays }))
  }
}
const TOKEN_CATEGORY_COLOR = { backlog: 'Cloud', todo: 'Porpoise', active: 'Cerulean', won: 'Grass', lost: 'Coin' }

export function tokensJson () {
  const src = readFileSync(TOKENS_FILE, 'utf8')
  return JSON.stringify(JSON.parse(src.slice(src.indexOf('{'))))
}

export function demoJson () {
  const src = readFileSync(DEMO_FILE, 'utf8')
  return JSON.stringify(JSON.parse(src.slice(src.indexOf('{'))))
}

export const commands = {
  // Reads tests/demo-ws* from a checkout of FUSIO-1594 and writes kit/05-demo.generated.js
  async demo (root = '../foundation4-demo') {
    const base = resolve(root)
    if (!existsSync(join(base, 'tests/demo-ws.data.yaml'))) throw new Error(`${base}: no tests/demo-ws.data.yaml, pass the FUSIO-1594 worktree`)
    const palette = Object.keys(JSON.parse(tokensJson()).palette.light)
    const demo = {}
    for (const [loc, files] of Object.entries(DEMO_SETS)) demo[loc] = demoLocale(base, loc, files, palette)
    writeFileSync(DEMO_FILE, '// Generated by `node dev/design/generate.mjs demo` from tests/demo-ws*. Do not edit.\n' +
      `const DEMO = ${JSON.stringify(demo, null, 1)}\n`)
    mkdirSync(dirname(DEMO_STORYBOOK_FILE), { recursive: true })
    writeFileSync(DEMO_STORYBOOK_FILE, JSON.stringify(demo, null, 1) + '\n')
    for (const [loc, d] of Object.entries(demo)) console.log(`${loc}: ${d.projects.map((p) => `${p.id} ${p.issues.length}`).join(', ')}, ${d.people.length} people`)
    console.log(`${DEMO_FILE}: ${(readFileSync(DEMO_FILE).length / 1024).toFixed(1)} KB`)
  },
  async tokens () {
    const t = buildTokens()
    writeFileSync(TOKENS_FILE, '// Generated by `node dev/design/generate.mjs tokens` from packages/theme/styles. Do not edit.\n' +
      `const TOKENS = ${JSON.stringify(t, null, 1)}\n`)
    console.log(`${TOKENS_FILE}: ${Object.keys(t.colors.light).length} light, ${Object.keys(t.colors.dark).length} dark colors, ${Object.keys(t.dimensions).length} dimensions`)
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2)
  if (commands[cmd] === undefined) {
    console.log('usage: node dev/design/generate.mjs <tokens|demo> [demo-checkout]')
    process.exit(1)
  }
  commands[cmd](...args).catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
