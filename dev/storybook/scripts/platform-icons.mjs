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

// Collects every svg of the platform sources into `virtual:platform-icons`:
// sprite symbols, .svg files, <svg> in .svelte markup, svg strings in .ts and svg data URIs in styles.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, dirname, join, posix } from 'node:path'

const VIRTUAL = 'virtual:platform-icons'
const RESOLVED = '\0' + VIRTUAL

const SKIPPED =
  /^(dev|tests|qms-tests|api-tests|ws-tests|benchmarks|common|docs|scripts)\/|__tests__|\.test\.ts$|\/(lib|types)\//
const SCANNED = /\.(svg|svelte|ts|scss|css)$/
const GROUPED = new Set(['packages', 'plugins', 'services', 'server-plugins', 'foundations', 'models', 'pods'])
const COLOR_ATTRS = new Set(['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color'])
const DIRECTIVE = /^(on|bind|use|class|style|transition|in|out|animate|let):/
// An empty href is a kit symbol filled in at runtime, not an icon of its own.
const DRAWABLE = /<(path|rect|circle|ellipse|line|polyline|polygon|text)[\s>/]|<use[^>]*href="[^"]/
// The kit's icons get their own block, apart from the legacy icons of packages/ui.
const KIT_SPRITE = 'packages/ui/assets/icons.svg'
// Whole components that draw their own states, and pictures shaped by props or made of clip paths: not icons, blank without their props.
const COMPONENTS = new Set([
  'packages/presentation/src/components/breadcrumbs/BreadcrumbsElement.svelte',
  'packages/ui/src/components/CheckBox.svelte',
  'packages/ui/src/components/ModernCheckbox.svelte',
  'packages/ui/src/components/ProgressCircle.svelte',
  'packages/ui/src/components/Spinner.svelte',
  'packages/ui/src/components/TooltipInstance.svelte',
  'packages/ui/src/components/wizard/WizardStep.svelte',
  'packages/ui/src/ui-kit/checkbox/Checkbox.svelte',
  'packages/ui/src/ui-kit/progress-circle/ProgressCircle.svelte',
  'packages/ui/src/ui-kit/spinner/Spinner.svelte',
  'packages/ui/src/ui-kit/status-icon/StatusIcon.svelte',
  'plugins/admin-resources/src/components/RegistrationsChart.svelte',
  'plugins/admin-resources/src/components/tabs/PaymentsTab.svelte',
  'plugins/time-resources/src/components/Border.svelte',
  'plugins/tracker-resources/src/components/issues/timereport/EstimationProgressCircle.svelte',
  'plugins/workbench-resources/src/components/Workbench.svelte'
])
// Pictures, not icons: backgrounds with embedded rasters and diagrams.
const MAX_SIZE = 64 * 1024

export function platformIcons(root) {
  let server
  const watched = new Set()
  return {
    name: 'platform-icons',
    configureServer(dev) {
      server = dev
      // An edited icon file rebuilds the list; a new file still needs a restart, the whole repository is not watched.
      const changed = (file) => {
        if (!watched.has(file)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED)
        if (mod != null) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('change', changed)
      server.watcher.on('unlink', changed)
    },
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null
      const icons = collectIcons(root)
      if (server != null) {
        const files = [...new Set(icons.map((icon) => join(root, icon.file)))].filter((file) => !watched.has(file))
        files.forEach((file) => watched.add(file))
        server.watcher.add(files)
      }
      return `export default ${JSON.stringify(icons)}`
    }
  }
}

export function collectIcons(root) {
  let files
  try {
    files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024
    })
      .toString()
      .split('\0')
  } catch (err) {
    console.warn('platform-icons: git ls-files failed', err)
    return []
  }
  const icons = []
  for (const file of [...new Set(files)].sort()) {
    if (!SCANNED.test(file) || SKIPPED.test(file) || COMPONENTS.has(file)) continue
    let text
    try {
      text = readFileSync(join(root, file), 'utf-8')
    } catch {
      continue
    }
    if (!text.includes('<svg') && !text.includes('svg+xml')) continue
    for (const found of iconsOf(file, text)) {
      const svg = prefixIds(found.svg, `pi${icons.length}-`)
      if (!DRAWABLE.test(svg) || svg.includes('<image') || svg.length > MAX_SIZE) continue
      icons.push({
        id: `pi${icons.length}`,
        source: sourceOf(file),
        file,
        ...found,
        svg,
        isolated: svg.includes('<style')
      })
    }
  }
  return icons
}

function iconsOf(file, text) {
  const ext = posix.extname(file)
  const name = basename(file, ext)
  if (ext === '.svg') {
    if (text.includes('<symbol')) return sprite(text)
    const [block] = svgBlocks(text)
    return block != null ? [{ kind: 'svg', name, line: 1, svg: clean(block.text, false) }] : []
  }
  const out = []
  if (ext === '.svelte') {
    const markup = blank(text, /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g)
    const blocks = svgBlocks(markup)
    blocks.forEach((block, i) => {
      out.push({
        kind: 'svelte',
        name: blocks.length > 1 ? `${name} #${i + 1}` : name,
        line: lineOf(text, block.start),
        svg: clean(resolveBlocks(block.text), true)
      })
    })
  } else if (ext === '.ts') {
    for (const block of svgBlocks(text)) {
      const before = text.slice(0, block.start)
      if (!/[`'"]\s*$/.test(before)) continue
      const label = /(\w+)\s*[:=]\s*\(?\s*[`'"]\s*$/.exec(before)?.[1]
      const line = lineOf(text, block.start)
      out.push({
        kind: 'ts',
        name: label ?? `${name}:${line}`,
        line,
        svg: clean(block.text.replace(/\$\{[^}]*\}/g, ''), false)
      })
    }
  }
  for (const uri of dataUris(text)) {
    out.push({ kind: 'css', name: `${name}:${uri.line}`, line: uri.line, svg: clean(uri.svg, false) })
  }
  return out
}

/** Block of the page: a plugin with its assets and resources together, or a package. */
function sourceOf(file) {
  if (file === KIT_SPRITE) return 'ui kit'
  const parts = file.split('/')
  const head = parts.slice(0, GROUPED.has(parts[0]) && parts.length > 2 ? 2 : 1)
  if (parts[0] === 'plugins' && head.length === 2) head[1] = head[1].replace(/-(assets|resources)$/, '')
  return head.join('/')
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/** Replaces matches with spaces so that offsets and line numbers stay. */
function blank(text, re) {
  return text.replace(re, (m) => m.replace(/[^\n]/g, ' '))
}

/** Top-level <svg>...</svg> elements. */
function svgBlocks(text) {
  const blocks = []
  const tag = /<(\/?)svg(?=[\s>/])/g
  let depth = 0
  let start = -1
  for (let m = tag.exec(text); m != null; m = tag.exec(text)) {
    if (m[1] === '') {
      const end = tagEnd(text, m.index)
      if (end < 0) break
      const selfClosed = text[end - 1] === '/'
      if (depth === 0) start = m.index
      if (selfClosed) {
        if (depth === 0) blocks.push({ start, text: text.slice(start, end + 1) })
      } else depth++
      tag.lastIndex = end + 1
    } else if (depth > 0) {
      depth--
      const end = text.indexOf('>', m.index)
      if (end < 0) break
      if (depth === 0) blocks.push({ start, text: text.slice(start, end + 1) })
    }
  }
  return blocks
}

/** Index of the `>` closing the tag that starts at `from`, past quotes and braces. */
function tagEnd(text, from) {
  let quote = ''
  let braces = 0
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i]
    if (quote !== '') {
      if (c === quote && braces === 0) quote = ''
      else if (c === '{') braces++
      else if (c === '}' && braces > 0) braces--
    } else if (c === '"' || c === "'") quote = c
    else if (c === '{') {
      i = braceEnd(text, i)
      if (i < 0) return -1
    } else if (c === '>') return i
  }
  return -1
}

/** Index of the `}` matching the `{` at `from`, past string literals. */
function braceEnd(text, from) {
  let depth = 0
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '"' || c === "'" || c === '`') {
      const close = text.indexOf(c, i + 1)
      if (close < 0) return -1
      i = close
    } else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

/** Keeps the first branch of `{#if}`, one pass of `{#each}`; drops other Svelte blocks and text expressions. */
function resolveBlocks(text) {
  let out = ''
  const frames = []
  const keeping = () => frames.every((f) => f.keep)
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '<') {
      const end = tagEnd(text, i)
      if (end < 0) break
      if (keeping()) out += text.slice(i, end + 1)
      i = end
      continue
    }
    if (c !== '{') {
      if (keeping()) out += c
      continue
    }
    const end = braceEnd(text, i)
    if (end < 0) break
    const body = text.slice(i + 1, end).trim()
    if (body.startsWith('#')) frames.push({ keep: true })
    else if (body.startsWith(':') && frames.length > 0) frames[frames.length - 1].keep = false
    else if (body.startsWith('/')) frames.pop()
    i = end
  }
  return out
}

/** Static svg markup: Svelte attributes resolved, components and directives dropped, root sized by CSS. */
function clean(markup, svelte) {
  markup = markup.replace(/<\?xml[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->|<script[\s\S]*?<\/script>/gi, '')
  let out = ''
  let root = true
  for (let i = 0; i < markup.length; i++) {
    const c = markup[i]
    if (c !== '<') {
      out += c
      continue
    }
    const end = tagEnd(markup, i)
    if (end < 0) break
    const raw = markup.slice(i + 1, end)
    i = end
    const closing = raw.startsWith('/')
    const name = /^\/?\s*([\w:.-]+)/.exec(raw)?.[1] ?? ''
    if (/^[A-Z]/.test(name) || name.startsWith('svelte:') || name === 'slot') continue
    if (closing) {
      out += `</${name}>`
      continue
    }
    const selfClosed = raw.endsWith('/')
    const attrs = attributes(raw.slice(name.length, selfClosed ? -1 : undefined), svelte)
    if (root && name === 'svg') {
      rootAttrs(attrs)
      root = false
    }
    if (name === 'use' && !attrs.some(([key]) => key === 'href' || key === 'xlink:href')) continue
    const text = attrs.map(([key, value]) => (value == null ? ` ${key}` : ` ${key}="${value.replace(/"/g, '&quot;')}"`))
    out += `<${name}${text.join('')}${selfClosed ? '/>' : '>'}`
  }
  if (out.includes('xlink:') && !out.includes('xmlns:xlink')) {
    out = out.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  }
  return out.trim()
}

function rootAttrs(attrs) {
  const get = (key) => attrs.find(([k]) => k === key)?.[1]
  if (get('viewBox') == null) {
    const w = parseFloat(get('width') ?? '')
    const h = parseFloat(get('height') ?? '')
    attrs.push(['viewBox', Number.isFinite(w) && Number.isFinite(h) ? `0 0 ${w} ${h}` : '0 0 16 16'])
  }
  if (get('xmlns') == null) attrs.unshift(['xmlns', 'http://www.w3.org/2000/svg'])
  for (const key of ['width', 'height', 'class', 'style', 'id']) {
    const at = attrs.findIndex(([k]) => k === key)
    if (at >= 0) attrs.splice(at, 1)
  }
}

/** Attributes of a tag body as [name, value | null]; Svelte expressions become static values or are dropped. */
function attributes(body, svelte) {
  const out = []
  let i = 0
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++
    if (i >= body.length) break
    if (body[i] === '{') {
      const end = braceEnd(body, i)
      if (end < 0) break
      const expr = body.slice(i + 1, end).trim()
      if (COLOR_ATTRS.has(expr)) out.push([expr, 'currentColor'])
      i = end + 1
      continue
    }
    const nameMatch = /^[^\s=/>]+/.exec(body.slice(i))
    if (nameMatch == null) {
      i++
      continue
    }
    const key = nameMatch[0]
    i += key.length
    while (i < body.length && /\s/.test(body[i])) i++
    let value = null
    let dynamic = false
    if (body[i] === '=') {
      i++
      while (i < body.length && /\s/.test(body[i])) i++
      const q = body[i]
      if (q === '"' || q === "'") {
        let j = i + 1
        while (j < body.length && body[j] !== q) {
          if (svelte && body[j] === '{') {
            const end = braceEnd(body, j)
            if (end < 0) break
            dynamic = true
            j = end
          }
          j++
        }
        value = body.slice(i + 1, j)
        i = j + 1
      } else if (q === '{') {
        const end = braceEnd(body, i)
        if (end < 0) break
        const expr = body.slice(i + 1, end).trim()
        i = end + 1
        const literal = /^(?:-?[\d.]+|'([^']*)'|"([^"]*)")$/.exec(expr)
        if (literal != null) value = literal[1] ?? literal[2] ?? expr
        else dynamic = true
      } else {
        const m = /^[^\s>]+/.exec(body.slice(i))
        value = m?.[0] ?? ''
        i += value.length
      }
    }
    if ((svelte && DIRECTIVE.test(key)) || /^on/i.test(key)) continue
    if (dynamic) {
      if (COLOR_ATTRS.has(key)) out.push([key, 'currentColor'])
      continue
    }
    out.push([key, value])
  }
  return out
}

/** Symbols of a sprite, each with the sprite defs and the symbols it uses. */
function sprite(text) {
  const symbols = new Map()
  const re = /<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g
  for (let m = re.exec(text); m != null; m = re.exec(text)) {
    const attrs = attributes(m[1], false)
    const id = attrs.find(([k]) => k === 'id')?.[1]
    if (id != null) symbols.set(id, { attrs, inner: m[2], line: lineOf(text, m.index), source: m[0] })
  }
  const rootStart = text.indexOf('>', text.indexOf('<svg')) + 1
  const rootEnd = text.lastIndexOf('</svg>')
  const shared = text.slice(rootStart, rootEnd).replace(re, '').trim()
  const out = []
  for (const [id, symbol] of symbols) {
    const used = new Set()
    const visit = (inner) => {
      for (const [, ref] of inner.matchAll(/href="#([^"]+)"/g)) {
        if (symbols.has(ref) && ref !== id && !used.has(ref)) {
          used.add(ref)
          visit(symbols.get(ref).inner)
        }
      }
    }
    visit(symbol.inner)
    const defs = [...[...used].map((ref) => symbols.get(ref).source), /url\(#|href="#/.test(symbol.inner) ? shared : '']
      .join('')
      .trim()
    const attrs = symbol.attrs.filter(([k]) => k !== 'id').map(([k, v]) => (v == null ? ` ${k}` : ` ${k}="${v}"`))
    const markup = `<svg${attrs.join('')}>${defs !== '' ? `<defs>${defs}</defs>` : ''}${symbol.inner}</svg>`
    out.push({ kind: 'sprite', name: id, line: symbol.line, svg: clean(markup, false) })
  }
  return out
}

/** Decoded `data:image/svg+xml` URIs with their line. */
function dataUris(text) {
  const out = []
  const re = /data:image\/svg\+xml([^,'"()]*),/g
  for (let m = re.exec(text); m != null; m = re.exec(text)) {
    const opener = text[m.index - 1]
    const closer = opener === '"' || opener === "'" ? opener : ')'
    const end = text.indexOf(closer, re.lastIndex)
    if (end < 0) continue
    let payload = text.slice(re.lastIndex, end)
    if (payload.includes('#{') || payload.includes('${')) continue
    try {
      payload = m[1].includes('base64') ? Buffer.from(payload, 'base64').toString('utf-8') : decodeURIComponent(payload)
    } catch {
      continue
    }
    const [block] = svgBlocks(payload)
    if (block != null) out.push({ line: lineOf(text, m.index), svg: block.text })
  }
  return out
}

/** Makes ids unique on the page: icons of different files reuse names like `clip0`. */
function prefixIds(svg, prefix) {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  if (ids.length === 0) return svg
  const known = new Set(ids)
  return svg
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, (whole, id) => (known.has(id) ? `url(#${prefix}${id})` : whole))
    .replace(/(href)="#([^"]+)"/g, (whole, key, id) => (known.has(id) ? `${key}="#${prefix}${id}"` : whole))
}

// `node scripts/platform-icons.mjs` prints what the module would hold.
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = join(dirname(new URL(import.meta.url).pathname), '../../..')
  const icons = collectIcons(root)
  const by = {}
  for (const icon of icons) by[icon.kind] = (by[icon.kind] ?? 0) + 1
  console.log(icons.length, by, (JSON.stringify(icons).length / 1024).toFixed(0) + ' KB')
}
