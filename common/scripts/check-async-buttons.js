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

/**
 * Finds buttons whose on:click runs async code but the button shows no progress (`loading`)
 * and is not disabled by a flag the handler sets - a rage click then runs the action several times.
 *
 * Markup is parsed by svelte/compiler, <script> by the TypeScript AST. Async-ness is resolved
 * through local functions, relative .ts imports and `getClient()` calls; anything else
 * (props, workspace package imports, other Promise-returning calls) is not seen.
 *
 * Usage: node common/scripts/check-async-buttons.js [paths...] [--guarded] [--json]
 *   --guarded  also list buttons whose handler has an early-return guard but no progress
 *   --json     print findings as JSON (for tooling / agents)
 *
 * Reviewed cases live in async-buttons-reviewed.json next to this script: { file, id, handler, reason }.
 * `id` hashes the component name and the whole handler text, so editing the handler asks for a new review.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { createRequire } = require('module')
const crypto = require('crypto')
const ts = require('typescript')

const root = path.resolve(__dirname, '..', '..')
// svelte is not a dependency of this package; packages/ui always has it.
const svelte = createRequire(path.join(root, 'packages', 'ui', 'package.json'))('svelte/compiler')

const BUTTONS = new Set([
  'button',
  'Button',
  'ButtonIcon',
  'ButtonBase',
  'ModernButton',
  'HeaderButton',
  'SplitButton',
  'ButtonWithDropdown',
  'CircleButton'
])
const REVIEWED_FILE = path.join(__dirname, 'async-buttons-reviewed.json')
const SYNC_CLIENT_METHODS = new Set(['getHierarchy', 'getModel', 'apply'])

// ---------- TypeScript side (<script>) ----------

function isFn (node) {
  return node != null && (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))
}

function fnIsAsync (node) {
  if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true) return true
  return node.type != null && ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === 'Promise'
}

// Calls only count on the function's own level: a nested callback (popup result, setTimeout) is not the click.
function tsInfo (fn, clients) {
  const info = { async: fnIsAsync(fn), calls: new Set(), assigns: new Set(), guards: new Set() }
  const visit = (node, own) => {
    if (node !== fn && isFn(node)) own = false
    if (ts.isCallExpression(node) && own) {
      const c = node.expression
      if (ts.isIdentifier(c)) info.calls.add(c.text)
      if (ts.isPropertyAccessExpression(c)) {
        const name = c.name.text
        if (name === 'then' || name === 'catch' || name === 'finally') info.async = true
        if (ts.isIdentifier(c.expression) && clients.has(c.expression.text) && !SYNC_CLIENT_METHODS.has(name)) {
          info.async = true
        }
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      info.assigns.add(node.left.text)
    }
    if (ts.isIfStatement(node) && ts.isIdentifier(node.expression) && returnsEarly(node.thenStatement)) {
      info.guards.add(node.expression.text)
    }
    ts.forEachChild(node, (n) => visit(n, own))
  }
  visit(fn, true)
  return info
}

function returnsEarly (stmt) {
  if (ts.isReturnStatement(stmt)) return true
  return ts.isBlock(stmt) && stmt.statements.length > 0 && ts.isReturnStatement(stmt.statements[0])
}

function identifiersTs (node, out = new Set()) {
  if (ts.isIdentifier(node)) out.add(node.text)
  ts.forEachChild(node, (n) => identifiersTs(n, out))
  return out
}

const tsFileCache = new Map()

// Exported async functions of a relative .ts module (one level, no re-exports).
function asyncExportsOf (file) {
  if (tsFileCache.has(file)) return tsFileCache.get(file)
  const result = new Set()
  tsFileCache.set(file, result)
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  for (const st of sf.statements) {
    const exported = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
    if (!exported) continue
    if (ts.isFunctionDeclaration(st) && st.name != null && fnIsAsync(st)) result.add(st.name.text)
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isFn(d.initializer) && fnIsAsync(d.initializer)) result.add(d.name.text)
      }
    }
  }
  return result
}

function resolveRelative (fromFile, spec) {
  if (!spec.startsWith('.')) return undefined
  const base = path.resolve(path.dirname(fromFile), spec)
  return [base, base + '.ts', path.join(base, 'index.ts')].find((f) => f.endsWith('.ts') && fs.existsSync(f))
}

function analyzeScript (file, code, scope) {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause != null) {
      const spec = st.moduleSpecifier.text
      const bindings = st.importClause.namedBindings
      if (bindings == null || !ts.isNamedImports(bindings)) continue
      for (const el of bindings.elements) {
        const imported = (el.propertyName ?? el.name).text
        scope.imports.set(el.name.text, { spec, imported })
      }
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || d.initializer == null) continue
        const init = d.initializer
        if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'getClient') {
          scope.clients.add(d.name.text)
        }
      }
    }
  }
  // Second pass: clients must be known before function bodies are read.
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name != null && st.body != null) {
      scope.fns.set(st.name.text, tsInfo(st, scope.clients))
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isFn(d.initializer)) scope.fns.set(d.name.text, tsInfo(d.initializer, scope.clients))
      }
    }
    // $: busy = saving || loading  ->  busy depends on saving, loading
    if (ts.isLabeledStatement(st) && st.label.text === '$' && ts.isExpressionStatement(st.statement)) {
      const e = st.statement.expression
      if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(e.left)) {
        scope.reactive.set(e.left.text, identifiersTs(e.right))
      }
    }
  }
}

// ---------- Svelte side (markup, estree) ----------

function walk (node, cb, own = true, top = node) {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach((n) => walk(n, cb, own, top))
  if (typeof node.type !== 'string') return
  if (node !== top && /Function/.test(node.type)) own = false
  cb(node, own)
  for (const k of Object.keys(node)) {
    if (k !== 'start' && k !== 'end' && k !== 'loc') walk(node[k], cb, own, top)
  }
}

function estreeInfo (fn, clients) {
  const info = { async: fn.async === true, calls: new Set(), assigns: new Set(), guards: new Set() }
  walk(fn, (node, own) => {
    if (node.type === 'CallExpression' && own) {
      const c = node.callee
      if (c.type === 'Identifier') info.calls.add(c.name)
      if (c.type === 'MemberExpression' && c.property.type === 'Identifier') {
        const name = c.property.name
        if (name === 'then' || name === 'catch' || name === 'finally') info.async = true
        if (c.object.type === 'Identifier' && clients.has(c.object.name) && !SYNC_CLIENT_METHODS.has(name)) info.async = true
      }
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') info.assigns.add(node.left.name)
  })
  return info
}

function identifiersEstree (node) {
  const out = new Set()
  walk(node, (n) => {
    if (n.type === 'Identifier') out.add(n.name)
  })
  return out
}

// ---------- resolution ----------

function isAsync (info, scope, file, seen = new Set()) {
  if (info.async) return true
  for (const c of info.calls) {
    if (seen.has(c)) continue
    seen.add(c)
    const local = scope.fns.get(c)
    if (local != null) {
      if (isAsync(local, scope, file, seen)) return true
      continue
    }
    const imp = scope.imports.get(c)
    const target = imp != null ? resolveRelative(file, imp.spec) : undefined
    if (target != null && asyncExportsOf(target).has(imp.imported)) return true
  }
  return false
}

// Union of assigns/guards over the handler and the local functions it calls.
function collect (info, scope, key, out = new Set(), seen = new Set()) {
  for (const v of info[key]) out.add(v)
  for (const c of info.calls) {
    const local = scope.fns.get(c)
    if (local == null || seen.has(c)) continue
    seen.add(c)
    collect(local, scope, key, out, seen)
  }
  return out
}

function attrExpression (attr) {
  if (attr.value === true) return { type: 'Literal', value: true }
  const tag = Array.isArray(attr.value) ? attr.value.find((v) => v.type === 'MustacheTag' || v.type === 'AttributeShorthand') : undefined
  return tag?.expression
}

function hasProgress (el, assigns, scope) {
  for (const attr of el.attributes) {
    if (attr.type === 'Spread') return true // props unknown, do not guess
    if (attr.type !== 'Attribute' || (attr.name !== 'loading' && attr.name !== 'disabled')) continue
    const expr = attrExpression(attr)
    if (expr == null || (expr.type === 'Literal' && expr.value === false)) continue
    if (attr.name === 'loading') return true
    const ids = identifiersEstree(expr)
    for (const id of [...ids]) for (const dep of scope.reactive.get(id) ?? []) ids.add(dep)
    if ([...ids].some((id) => assigns.has(id))) return true
  }
  return false
}

function handlerInfo (expr, scope) {
  if (expr == null) return undefined // on:click forwarding
  if (expr.type === 'Identifier') return scope.fns.get(expr.name) ?? importedInfo(expr.name, scope)
  if (/Function/.test(expr.type)) return estreeInfo(expr, scope.clients)
  return undefined
}

function importedInfo (name, scope) {
  if (!scope.imports.has(name)) return undefined
  return { async: false, calls: new Set([name]), assigns: new Set(), guards: new Set() }
}

async function checkFile (file, source) {
  const scope = { fns: new Map(), imports: new Map(), clients: new Set(), reactive: new Map() }
  const blank = (s) => s.replace(/[^\n]/g, ' ')
  // Scripts are TypeScript (svelte 4 parser cannot read it) and styles may be scss: blank both, keep offsets.
  const { code } = await svelte.preprocess(
    source,
    {
      script: ({ content }) => {
        analyzeScript(file, content, scope)
        return { code: blank(content) }
      },
      style: ({ content }) => ({ code: blank(content) })
    },
    { filename: file }
  )
  const ast = svelte.parse(code, { filename: file })

  const findings = []
  walk(ast.html, (el) => {
    if (el.type !== 'Element' && el.type !== 'InlineComponent') return
    const imp = scope.imports.get(el.name)
    const name = imp != null && imp.spec === '@hcengineering/ui' ? imp.imported : el.name
    if (!BUTTONS.has(name)) return
    for (const attr of el.attributes) {
      if (attr.type !== 'EventHandler' || attr.name !== 'click') continue
      const info = handlerInfo(attr.expression, scope)
      if (info == null || !isAsync(info, scope, file)) continue
      const assigns = collect(info, scope, 'assigns')
      if (hasProgress(el, assigns, scope)) continue
      const guarded = [...collect(info, scope, 'guards')].some((g) => assigns.has(g))
      const text = source.slice(attr.start, attr.end)
      const id = crypto.createHash('sha1').update(`${name}|${text.replace(/\s+/g, ' ')}`).digest('hex').slice(0, 12)
      findings.push({ line: lineOf(source, el.start), name, guarded, id, handler: text.split('\n')[0] })
    }
  })
  return findings
}

function lineOf (source, offset) {
  let line = 1
  for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++
  return line
}

async function selfTest () {
  const assert = require('assert')
  const file = path.join(root, 'self-test.svelte')
  const run = (src) => checkFile(file, src)
  const s = (script, markup) => `<script lang="ts">\n  import { Button } from '@hcengineering/ui'\n${script}\n</script>\n${markup}`

  assert.strictEqual((await run(s('async function save (): Promise<void> {}', '<Button on:click={save} />'))).length, 1)
  assert.strictEqual((await run(s('async function save (): Promise<void> {}', '<Button loading={busy} on:click={save} />'))).length, 0)
  assert.strictEqual((await run(s('function open () {}', '<Button on:click={open} />'))).length, 0)
  // sync wrapper around async call, native button
  assert.strictEqual((await run(s('async function save () {}', '<button on:click={() => { void save() }} />'))).length, 1)
  // disabled by the flag the handler sets, through a reactive alias
  const flag = 'let saving = false\n$: busy = saving\nasync function save () { saving = true; await x(); saving = false }'
  assert.strictEqual((await run(s(flag, '<Button disabled={busy} on:click={save} />'))).length, 0)
  assert.strictEqual((await run(s(flag, '<Button disabled={other} on:click={save} />'))).length, 1)
  // getClient() calls are async, getHierarchy is not; popup callback is not the click
  const client = 'import { getClient } from "@hcengineering/presentation"\nconst client = getClient()'
  assert.strictEqual((await run(s(client, '<Button on:click={() => client.remove(doc)} />'))).length, 1)
  assert.strictEqual((await run(s(client, '<Button on:click={() => client.getHierarchy()} />'))).length, 0)
  assert.strictEqual((await run(s(client, '<Button on:click={() => showPopup(X, {}, undefined, async () => { await client.remove(doc) })} />'))).length, 0)
  const guarded = await run(s('let s = false\nasync function save () { if (s) return; s = true; await x() }', '<Button on:click={save} />'))
  assert.strictEqual(guarded[0].guarded, true)
  assert.strictEqual(guarded[0].line, 6)
  console.log('✓ self-test passed')
}

async function main () {
  const args = process.argv.slice(2)
  if (args.includes('--self-test')) return await selfTest()
  const showGuarded = args.includes('--guarded')
  const asJson = args.includes('--json')
  const reviewed = fs.existsSync(REVIEWED_FILE) ? JSON.parse(fs.readFileSync(REVIEWED_FILE, 'utf8')) : []
  const reviewedKeys = new Set(reviewed.map((r) => `${r.file}#${r.id}`))
  const seenKeys = new Set()
  const paths = args.filter((a) => !a.startsWith('--'))
  // git pathspec `*` crosses directories, so `dir/*.svelte` is recursive.
  const specs = paths.length > 0 ? paths.map((p) => (p.endsWith('.svelte') ? p : `${p}/*.svelte`)) : ['*.svelte']
  const files = execFileSync('git', ['ls-files', '--', ...specs], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.svelte'))

  const out = []
  let guardedCount = 0
  let reviewedCount = 0
  for (const rel of files) {
    const full = path.join(root, rel)
    let findings
    try {
      findings = await checkFile(full, fs.readFileSync(full, 'utf8'))
    } catch (err) {
      console.warn(`⚠ ${rel}: ${err.message.split('\n')[0]}`)
      continue
    }
    for (const f of findings) {
      const key = `${rel}#${f.id}`
      seenKeys.add(key)
      if (reviewedKeys.has(key)) {
        reviewedCount++
        continue
      }
      if (f.guarded) guardedCount++
      if (f.guarded && !showGuarded) continue
      out.push({ file: rel, ...f })
    }
  }

  const scanned = new Set(files)
  const stale = reviewed.filter((r) => scanned.has(r.file) && !seenKeys.has(`${r.file}#${r.id}`))
  if (asJson) {
    console.log(JSON.stringify(out, null, 2))
  } else {
    for (const f of out) {
      console.log(`${f.file}:${f.line}  <${f.name}>${f.guarded ? ' [guarded]' : ''}  ${f.id}  ${f.handler}`)
    }
    for (const r of stale) console.log(`ℹ️  reviewed entry no longer matches, drop or re-review: ${r.file}#${r.id}  ${r.handler}`)
    console.log(
      `\n${out.length} async button(s) without progress in ${files.length} files, ${reviewedCount} reviewed` +
        (showGuarded ? '' : `, ${guardedCount} guarded hidden (--guarded)`)
    )
  }
  if (out.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
