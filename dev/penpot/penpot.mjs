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

// Design-as-code CLI for the local Penpot (dev/penpot/docker-compose.yaml); screens and kit are in dev/design. See docs/penpot.md.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { buildTokens, tokensJson, demoJson, commands as generate } from '../design/generate.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
// Shared design source (kit, screens, design.json); the library script and 60-trace.js stay here
const design = join(here, '../design')

// --host <ssh-host> runs the stack on that machine; its credentials, state and MCP key are kept separately
const argv = process.argv.slice(2)
const hostAt = argv.indexOf('--host')
const HOST = hostAt >= 0 ? argv[hostAt + 1] : undefined
if (hostAt >= 0) {
  if (HOST === undefined || HOST.startsWith('--')) throw new Error('--host needs an ssh host')
  argv.splice(hostAt, 2)
}
const SUFFIX = HOST === undefined ? '' : '.' + HOST
const ENV_FILE = join(here, '.env' + SUFFIX)

function loadEnv () {
  const file = ENV_FILE
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m !== null && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnv()
const MANIFEST = JSON.parse(readFileSync(join(design, 'design.json'), 'utf8'))
const URL_BASE = HOST !== undefined ? `http://${HOST}:9101` : process.env.PENPOT_URL ?? 'http://localhost:9101'
const MAIL_URL = `http://${HOST ?? 'localhost'}:1081`
process.env.PENPOT_EMAIL ??= MANIFEST.user.email
process.env.PENPOT_PASSWORD ??= MANIFEST.user.password
const COMPOSE = ['compose', '-p', 'penpot', '-f', join(here, 'docker-compose.yaml')]
const REMOTE_DIR = 'penpot-intabia'
const DOCKER_APP_CLI = '/Applications/Docker.app/Contents/Resources/bin'
const sleep = async (ms) => await new Promise((resolve) => setTimeout(resolve, ms))

function ssh (command, opts = {}) {
  return execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, command], { stdio: 'pipe', ...opts })
}

// Runs docker (compose) locally or on --host; the Docker Desktop CLI is not on the PATH of a non-interactive ssh shell
function docker (args, opts = { stdio: 'inherit' }) {
  if (HOST === undefined) return execFileSync('docker', args, opts)
  const cmd = `PATH="$PATH:${DOCKER_APP_CLI}" docker ${args.map((a) => `'${a}'`).join(' ')}`
  return execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, `cd ${REMOTE_DIR} && ${cmd}`], opts)
}

const composeArgs = () => HOST === undefined ? COMPOSE : ['compose', '-p', 'penpot', '-f', 'docker-compose.yaml']

// Copies the compose file to the host and makes sure the Docker daemon is running there
async function prepareRemote () {
  if (HOST === undefined) return
  ssh(`mkdir -p ${REMOTE_DIR}`)
  execFileSync('scp', ['-q', '-o', 'BatchMode=yes', join(here, 'docker-compose.yaml'), `${HOST}:${REMOTE_DIR}/docker-compose.yaml`])
  writeFileSync(join(here, '.remote-env.tmp'), `PENPOT_PUBLIC_URI=${URL_BASE}\n`)
  try {
    execFileSync('scp', ['-q', '-o', 'BatchMode=yes', join(here, '.remote-env.tmp'), `${HOST}:${REMOTE_DIR}/.env`])
  } finally {
    rmSync(join(here, '.remote-env.tmp'), { force: true })
  }
  const up = () => { try { docker(['info'], { stdio: 'pipe' }); return true } catch { return false } }
  if (up()) return
  console.log(`starting Docker Desktop on ${HOST} ...`)
  ssh('open -a Docker')
  for (let i = 0; i < 60; i++) {
    await sleep(5000)
    if (up()) return
  }
  throw new Error(`Docker daemon on ${HOST} did not start in 5 min. Log in to the Mac and start Docker Desktop once (licence / privileged helper prompts)`)
}

function saveEnv (values) {
  const file = ENV_FILE
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '') : []
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(k + '='))
    if (i >= 0) lines[i] = `${k}=${v}`
    else lines.push(`${k}=${v}`)
    process.env[k] = v
  }
  writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 })
}

// ---- MCP (Streamable HTTP) -------------------------------------------------

async function mcpCall (tool, args) {
  const token = process.env.PENPOT_MCP_TOKEN
  if (token === undefined || token === '') throw new Error('PENPOT_MCP_TOKEN is not set (dev/penpot/.env), see docs/penpot.md')
  const url = `${URL_BASE}/mcp/stream?userToken=${encodeURIComponent(token)}`
  let session
  let id = 0
  const rpc = async (method, params, notify = false) => {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
    if (session !== undefined) headers['mcp-session-id'] = session
    const body = { jsonrpc: '2.0', method, params, ...(notify ? {} : { id: ++id }) }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    session = res.headers.get('mcp-session-id') ?? session
    const text = await res.text()
    if (!res.ok) throw new Error(`MCP ${method}: HTTP ${res.status} ${text.slice(0, 300)}`)
    let out
    for (const line of text.split('\n')) if (line.startsWith('data:')) out = JSON.parse(line.slice(5))
    if (out === undefined && text.trim() !== '') out = JSON.parse(text)
    if (out?.error !== undefined) throw new Error(`MCP ${method}: ${JSON.stringify(out.error)}`)
    return out?.result
  }
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'penpot.mjs', version: '1' } })
  await rpc('notifications/initialized', {}, true)
  const result = await rpc('tools/call', { name: tool, arguments: args })
  if (result.isError === true) throw new Error(result.content.map((c) => c.text).join('\n'))
  return result.content
}

// Runs a screen script in the plugin. The plugin answers a failed or timed out task with ordinary text
// ("Tool execution failed: ...") and keeps running a timed out script, so the script marks its end in
// storage and a timeout is waited out instead of letting the next script start on top of it.
const failedText = (content) => content.map((c) => c.text ?? '').find((t) => t.startsWith('Tool execution failed'))
async function runScript (code) {
  const key = 'run_' + randomUUID()
  const mark = (v) => `storage[${JSON.stringify(key)}] = ${v}`
  const wrapped = `try {\n const result = await (async () => {\n${code}\n})()\n ${mark('{ ok: true }')}\n return result\n} catch (e) {\n ${mark('{ error: String(e && e.stack || e) }')}\n throw e\n}`
  const content = await mcpCall('execute_code', { code: wrapped })
  const failed = failedText(content)
  if (failed === undefined) { console.log('  TMPDBG ' + JSON.stringify(await mcpCall('execute_code', { code: 'const r = storage.TIMES; storage.TIMES = ""; return r' }))); return content }
  if (!failed.includes('timed out')) throw new Error(failed)
  console.log('  plugin task timed out, waiting for the script to finish')
  const until = Date.now() + 600000
  while (Date.now() < until) {
    await sleep(5000)
    const poll = await mcpCall('execute_code', { code: `return JSON.stringify(storage[${JSON.stringify(key)}] ?? null)` })
    const err = failedText(poll)
    if (err !== undefined) throw new Error(err)
    const done = JSON.parse(JSON.parse(poll.find((c) => c.type === 'text').text).result)
    if (done?.error !== undefined) throw new Error(`script failed: ${done.error}`)
    if (done?.ok === true) return content
  }
  throw new Error('script did not finish in 10 minutes')
}

// ---- Penpot RPC (cookie session) -------------------------------------------

let cookie
async function api (method, params) {
  if (cookie === undefined && method !== 'login-with-password') {
    const email = process.env.PENPOT_EMAIL
    const password = process.env.PENPOT_PASSWORD
    if (email === undefined || password === undefined) throw new Error('PENPOT_EMAIL / PENPOT_PASSWORD are not set (dev/penpot/.env)')
    await api('login-with-password', { email, password })
  }
  const res = await fetch(`${URL_BASE}/api/main/methods/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(cookie !== undefined ? { cookie } : {}) },
    body: JSON.stringify(params)
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length > 0) cookie = set.map((c) => c.split(';')[0]).join('; ')
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
  const type = res.headers.get('content-type') ?? ''
  return type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer())
}

async function findFile (nameOrId, required = true) {
  const projects = await api('get-all-projects', {})
  for (const p of projects) {
    const files = await api('get-project-files', { projectId: p.id })
    const f = files.find((it) => it.id === nameOrId || it.name === nameOrId)
    if (f !== undefined) return { ...f, teamId: p.teamId }
  }
  if (required) throw new Error(`Penpot file not found: ${nameOrId}`)
  return undefined
}

async function ensureProject () {
  const projects = await api('get-all-projects', {})
  return projects.find((p) => p.name === MANIFEST.project) ?? await api('create-project', { name: MANIFEST.project, teamId: projects[0].teamId })
}

// ---- Stack lifecycle -------------------------------------------------------

async function waitForPenpot (timeoutMs = 300000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const res = await fetch(`${URL_BASE}/api/main/doc`)
      if (res.ok) return
    } catch {}
    await sleep(2000)
  }
  throw new Error(`Penpot did not answer on ${URL_BASE} in ${timeoutMs / 1000}s`)
}

async function ensureUser () {
  const { email, password } = { email: process.env.PENPOT_EMAIL, password: process.env.PENPOT_PASSWORD }
  try {
    await api('login-with-password', { email, password })
    return 'exists'
  } catch {}
  // The backend CLI needs the prepl server, which may come up a little after HTTP
  for (let i = 0; ; i++) {
    try {
      docker([...composeArgs(), 'exec', '-T', 'penpot-backend', 'python3', 'manage.py', 'create-profile',
        '-n', MANIFEST.user.name, '-e', email, '-p', password, '--skip-tutorial', '--skip-walkthrough'], { stdio: 'pipe' })
      break
    } catch (err) {
      if (i >= 10) throw err
      await sleep(3000)
    }
  }
  await api('login-with-password', { email, password })
  return 'created'
}

async function ensureMcpToken () {
  await api('update-profile-props', { props: { mcpEnabled: true } })
  let token
  try {
    token = (await api('get-current-mcp-token', {}))?.token
  } catch {}
  token ??= (await api('create-access-token', { name: 'claude-code', type: 'mcp' })).token
  saveEnv({ PENPOT_URL: URL_BASE, PENPOT_EMAIL: process.env.PENPOT_EMAIL, PENPOT_PASSWORD: process.env.PENPOT_PASSWORD, PENPOT_MCP_TOKEN: token })
  return token
}

// The key changes after a wipe, so the Claude Code entry is replaced every time
function registerClaude (token) {
  const opts = { cwd: repo, stdio: 'pipe' }
  try {
    execFileSync('claude', ['--version'], opts)
  } catch {
    return 'claude CLI not found, skipped'
  }
  const name = 'penpot' + SUFFIX
  try { execFileSync('claude', ['mcp', 'remove', name, '-s', 'local'], opts) } catch {}
  execFileSync('claude', ['mcp', 'add', '-s', 'local', '--transport', 'http', name, `${URL_BASE}/mcp/stream?userToken=${token}`], opts)
  return `${name} MCP registered for this checkout (scope local)`
}

// Hash of everything a file is built from; .state.json keeps the hash of the last build per file id
// Shared kit plus the Penpot-only files, in one name order; the generated tokens and demo go through storage, not the body
function kitFiles (all = false) {
  return [join(design, 'kit'), join(here, 'kit')]
    .flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => join(dir, f)))
    .filter((f) => all || !/^(00-tokens|05-demo)/.test(basename(f)))
    .sort((a, b) => basename(a).localeCompare(basename(b)))
}

function sourceHash (entry) {
  const h = createHash('sha256')
  for (const f of kitFiles(true)) h.update(readFileSync(f))
  for (const f of entry.build.flat()) h.update(readFileSync(join(design, f)))
  h.update(JSON.stringify(entry))
  return h.digest('hex')
}
const STATE = join(here, `.state${SUFFIX}.json`)
const readState = () => existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
function saveBuilt (file, entry) {
  const state = readState()
  state[file.id] = sourceHash(entry)
  writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n')
}

function workspaceUrl (f) {
  return `${URL_BASE}/#/workspace?team-id=${f.teamId}&file-id=${f.id}`
}

// Name of the file the MCP plugin is connected to, or undefined
async function connectedFile () {
  try {
    const content = await mcpCall('execute_code', { code: 'return penpot.currentFile.name' })
    return JSON.parse(content.find((c) => c.type === 'text').text).result
  } catch {
    return undefined
  }
}

// Manual edits in the connected file (kit/60-trace.js) plus open comment threads,
// saved to files/diff/<file>.json
async function fileDiff (fileName) {
  const file = await findFile(fileName)
  const threads = (await api('get-comment-threads', { fileId: file.id })).filter((th) => !th.isResolved)
  const pins = threads.map((th) => ({ pageId: th.pageId, x: th.position.x, y: th.position.y }))
  const code = await scriptCode([]) + `\nreturn { shapes: kit.diffAll(), paths: kit.shapesAt(${JSON.stringify(pins)}) }`
  const content = await mcpCall('execute_code', { code })
  const text = content.find((c) => c.type === 'text')?.text ?? ''
  if (!text.startsWith('{')) throw new Error(text.slice(0, 500))
  const { shapes, paths } = JSON.parse(text).result
  const changes = [...shapes]
  for (const [i, th] of threads.entries()) {
    const comments = await api('get-comments', { threadId: th.id })
    changes.push({ page: th.pageName, path: paths[i] ?? [], kind: 'comment', thread: th.seqn, position: th.position, comments: comments.map((c) => ({ user: c.ownerFullname, text: c.content })) })
  }
  const dir = join(here, 'files', 'diff')
  mkdirSync(dir, { recursive: true })
  const out = join(dir, `${fileName}.json`)
  writeFileSync(out, JSON.stringify(changes, null, 2) + '\n')
  return { changes, out }
}

// Builds a file in the already connected tab; refuses to overwrite manual edits unless forced
async function buildConnected (file, entry, force) {
  const { changes, out } = await fileDiff(file.name)
  // Comments live outside the pages and survive a rebuild; only shape edits would be lost
  const edits = changes.filter((c) => c.kind !== 'comment')
  if (edits.length > 0 && !force) {
    console.log(`  skipped: ${edits.length} manual edits not in code yet (${out}). Move them into the scripts or use --force`)
    return false
  }
  const revn = (await api('get-file', { id: file.id })).revn
  for (const scripts of entry.build) {
    console.log(`  run ${scripts.join(' ')}`)
    const code = await scriptCode(scripts.map((it) => join(design, it)))
    const tr = Date.now(); await runScript(code); console.log('  TMPDBG run ms ' + (Date.now() - tr))
  }
  await waitForSave(file, revn)
  saveBuilt(file, entry)
  return true
}

// Uses the open tab when it holds the file, otherwise opens the file in a headless browser
async function buildFiles (entries, force = false) {
  let browser
  let context
  try {
    for (const { file, entry } of entries) {
      console.log(`build ${file.name}`)
      if (await connectedFile() === file.name) {
        await buildConnected(file, entry, force)
        continue
      }
      if (browser === undefined) {
        let chromium
        try {
          chromium = createRequire(join(repo, 'tests/sanity/package.json'))('@playwright/test').chromium
        } catch {
          throw new Error('Playwright is not installed (tests/sanity). Run `pnpm install`, or open the file in a browser')
        }
        browser = await chromium.launch({ headless: process.env.PENPOT_HEADED === undefined })
        context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
        await context.addCookies(cookie.split('; ').map((c) => {
          const i = c.indexOf('=')
          return { name: c.slice(0, i), value: c.slice(i + 1), url: URL_BASE }
        }))
      }
      // A fresh tab per file: switching files by URL hash keeps the plugin on the previous file
      const page = await context.newPage()
      await page.goto(workspaceUrl(file))
      await waitForConnection(page, file.name)
      await buildConnected(file, entry, force)
      await page.close()
    }
  } finally {
    await browser?.close()
  }
}

// The editor persists changes in the background; closing the tab earlier loses them
async function waitForSave (file, revn) {
  let last = revn
  let stable = 0
  for (let i = 0; i < 90 && stable < 3; i++) {
    await sleep(2000)
    const now = (await api('get-file', { id: file.id })).revn
    stable = now > revn && now === last ? stable + 1 : 0
    last = now
  }
  if (stable < 3) throw new Error(`"${file.name}" was not saved (revn ${revn} -> ${last})`)
}

async function waitForConnection (page, fileName) {
  const until = Date.now() + 120000
  let clicked = false
  let other
  while (Date.now() < until) {
    try {
      const content = await mcpCall('execute_code', { code: 'return penpot.currentFile.name' })
      const text = content.find((c) => c.type === 'text')?.text ?? ''
      if (text.includes(JSON.stringify(fileName))) return
      other = JSON.parse(text).result
    } catch {}
    // The server keeps one plugin connection per MCP key and rejects the rest
    if (other !== undefined && Date.now() > until - 90000) {
      throw new Error(`MCP is held by another Penpot tab with "${other}". Close Penpot tabs in your browser and run again`)
    }
    // The plugin connects by itself once MCP is enabled for the profile; the toolbar button is the fallback
    if (!clicked && Date.now() > until - 90000) {
      clicked = true
      await page.getByRole('button', { name: 'MCP' }).first().click().catch(() => {})
      await page.getByText('Connect', { exact: false }).first().click({ timeout: 2000 }).catch(() => {})
    }
    await sleep(2000)
  }
  throw new Error(`MCP plugin did not connect for "${fileName}"`)
}


// ---- Icons from the repository ----------------------------------------------
// "<ns>/<id>": sprite symbols of plugins/<ns>-assets/assets/*.svg and Svelte icons of
// packages/ui (ns "ui") and plugins/<ns>-resources/src/components/icons (ns = plugin)
let iconCache
// The plugin sandbox (SES) rejects code that contains HTML comment markers
const cleanSvg = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()
function buildIcons () {
  if (iconCache !== undefined) return iconCache
  const icons = {}
  const plugins = join(repo, 'plugins')
  for (const dir of readdirSync(plugins)) {
    if (dir.endsWith('-assets') && existsSync(join(plugins, dir, 'assets'))) {
      const ns = dir.slice(0, -'-assets'.length)
      for (const f of readdirSync(join(plugins, dir, 'assets')).filter((it) => it.endsWith('.svg'))) {
        const src = readFileSync(join(plugins, dir, 'assets', f), 'utf8')
        for (const m of src.matchAll(/<symbol([^>]*)>([\s\S]*?)<\/symbol>/g)) {
          const id = m[1].match(/id="([^"]+)"/)?.[1]
          if (id !== undefined) icons[`${ns}/${id}`] = { viewBox: m[1].match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 16 16', body: cleanSvg(m[2]) }
        }
      }
    }
  }
  const svelteDirs = [['ui', join(repo, 'packages/ui/src/components/icons')], ['ui-internal', join(repo, 'packages/ui/src/components/internal/icons')]]
  for (const dir of readdirSync(plugins).filter((it) => it.endsWith('-resources'))) svelteDirs.push([dir.slice(0, -'-resources'.length), join(plugins, dir, 'src/components/icons')])
  for (const [ns, dir] of svelteDirs) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((it) => it.endsWith('.svelte'))) {
      const svg = readFileSync(join(dir, f), 'utf8').match(/<svg([^>]*)>([\s\S]*?)<\/svg>/)
      // Icons whose markup depends on props beyond fill/size are skipped
      if (svg === null || /\{(?!fill\})[^}]*\}/.test(svg[2])) continue
      const key = `${ns}/${f.slice(0, -'.svelte'.length)}`
      icons[key] ??= { viewBox: svg[1].match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 16 16', body: cleanSvg(svg[2].replace(/\{fill\}/g, 'currentColor')) }
    }
  }
  iconCache = icons
  return icons
}

// Only the icons a script names are sent, the whole set is ~400 KB
function iconsFor (code) {
  const all = buildIcons()
  const used = {}
  for (const m of code.matchAll(/['"`]([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)['"`]/g)) if (all[m[1]] !== undefined) used[m[1]] = all[m[1]]
  return used
}

// ---- Commands --------------------------------------------------------------

// MCP rejects request bodies over ~100 KB, so full-line comments and indentation are dropped
function compactJs (src) {
  return src.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('//')).join('\n')
}

function kitSource () {
  return kitFiles().map((f) => compactJs(readFileSync(f, 'utf8'))).join('\n')
}

// Tokens and demo data go in separate calls and stay in the plugin's storage for the script
async function scriptCode (files) {
  const tsc = Date.now(); console.log('  TMPDBG scriptCode start')
  await mcpCall('execute_code', { code: `storage.TOKENS = ${tokensJson()}\nreturn 'ok'` })
  await mcpCall('execute_code', { code: `storage.DEMO = ${demoJson()}\nreturn 'ok'` })
  const source = files.map((f) => relative(design, f))
  const body = kitSource() + `\nkit.source = ${JSON.stringify(source)}\n` + files.map((f) => compactJs(readFileSync(f, 'utf8'))).join('\n')
  // Icons also go through storage, in chunks below the MCP body limit
  await mcpCall('execute_code', { code: "storage.ICONS = {}\nreturn 'ok'" })
  let chunk = {}
  const flush = async () => {
    if (Object.keys(chunk).length > 0) await mcpCall('execute_code', { code: `Object.assign(storage.ICONS, ${JSON.stringify(chunk)})\nreturn 'ok'` })
    chunk = {}
  }
  for (const [k, v] of Object.entries(iconsFor(body))) {
    chunk[k] = v
    if (JSON.stringify(chunk).length > 60000) await flush()
  }
  await flush()
  console.log('  TMPDBG scriptCode ms ' + (Date.now() - tsc))
  return 'const TOKENS = storage.TOKENS\nconst DEMO = storage.DEMO\nconst ICONS = storage.ICONS\n' + body
}

function printContent (content, png) {
  for (const c of content) {
    if (c.type === 'text') console.log(c.text)
    if (c.type === 'image') {
      writeFileSync(png, Buffer.from(c.data, 'base64'))
      console.log(`image -> ${png}`)
    }
  }
}


const commands = {
  // Starts the stack and restores user, MCP key, files and their content from design.json
  // Checks that the stack is up, prints how to log in and opens Penpot in the browser
  async open () {
    try {
      const res = await fetch(`${URL_BASE}/api/main/doc`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      console.log(`Penpot is not running on ${URL_BASE} (${err.message}). Start it: pnpm -w design:up${HOST === undefined ? '' : ' --host ' + HOST}`)
      process.exitCode = 1
      return
    }
    try {
      await api('login-with-password', { email: process.env.PENPOT_EMAIL, password: process.env.PENPOT_PASSWORD })
    } catch {
      console.log(`Penpot is running, but ${process.env.PENPOT_EMAIL} cannot log in. Restore it: pnpm -w design:up`)
      process.exitCode = 1
      return
    }
    console.log(`Penpot: ${URL_BASE}`)
    console.log(`  login:    ${process.env.PENPOT_EMAIL}`)
    console.log(`  password: ${process.env.PENPOT_PASSWORD}`)
    const missing = []
    for (const entry of MANIFEST.files) {
      const f = await findFile(entry.name, false)
      if (f === undefined) missing.push(entry.name)
      else console.log(`  ${entry.name}: ${workspaceUrl(f)}`)
    }
    console.log(`Mail: ${MAIL_URL}`)
    if (missing.length > 0) console.log(`Missing files: ${missing.join(', ')}. Restore them: pnpm -w design:up`)
    const opener = process.platform === 'darwin' ? ['open'] : process.platform === 'win32' ? ['cmd', '/c', 'start', ''] : ['xdg-open']
    try {
      execFileSync(opener[0], [...opener.slice(1), `${URL_BASE}/#/auth/login`], { stdio: 'ignore' })
    } catch {
      console.log('Could not open a browser, use the link above')
    }
  },
  async up (...flags) {
    await prepareRemote()
    docker([...composeArgs(), 'up', '-d'])
    console.log(`waiting for ${URL_BASE} ...`)
    await waitForPenpot()
    console.log(`user ${process.env.PENPOT_EMAIL}: ${await ensureUser()}`)
    const token = await ensureMcpToken()
    if (!flags.includes('--no-claude')) console.log(registerClaude(token))
    const project = await ensureProject()
    const toBuild = []
    for (const entry of MANIFEST.files) {
      let file = await findFile(entry.name, false)
      const missing = file === undefined
      if (missing) {
        const f = await api('create-file', { name: entry.name, projectId: project.id })
        if (entry.shared === true) await api('set-file-shared', { id: f.id, isShared: true })
        file = { ...f, teamId: project.teamId }
        console.log(`created ${entry.name}`)
      }
      for (const lib of entry.libraries ?? []) {
        const l = await findFile(lib)
        await api('link-file-to-library', { fileId: file.id, libraryId: l.id }).catch(() => {})
      }
      const changed = readState()[file.id] !== sourceHash(entry)
      if (missing || changed || flags.includes('--rebuild')) {
        // Rebuilt pages are cleared, so manual edits are saved first
        if (!missing) {
          const dir = join(here, 'files', 'backup-' + new Date().toISOString().replace(/[:.]/g, '-'))
          mkdirSync(dir, { recursive: true })
          await commands.export(entry.name, join(dir, `${entry.name}.penpot`))
        }
        toBuild.push({ file, entry })
      }
    }
    if (toBuild.length > 0) await buildFiles(toBuild, flags.includes('--force'))
    console.log(`\nPenpot: ${URL_BASE}  (${process.env.PENPOT_EMAIL} / ${process.env.PENPOT_PASSWORD})`)
    for (const entry of MANIFEST.files) console.log(`  ${entry.name}: ${workspaceUrl(await findFile(entry.name))}`)
    console.log(`Mail: ${MAIL_URL}`)
  },
  // Stops the stack; --wipe also removes its volumes after saving snapshots to files/backup-<time>/
  async down (...flags) {
    if (flags.includes('--wipe')) {
      try {
        const dir = join(here, 'files', 'backup-' + new Date().toISOString().replace(/[:.]/g, '-'))
        mkdirSync(dir, { recursive: true })
        for (const entry of MANIFEST.files) {
          if (await findFile(entry.name, false) !== undefined) await commands.export(entry.name, join(dir, `${entry.name}.penpot`))
        }
      } catch (err) {
        console.log(`snapshot skipped: ${err.message}`)
      }
      docker([...composeArgs(), 'down', '-v'])
    } else {
      docker([...composeArgs(), 'down'])
    }
  },
  // Rebuilds the given files (all from design.json by default) in a headless browser
  async build (...args) {
    const names = args.filter((a) => !a.startsWith('--'))
    const entries = []
    for (const entry of MANIFEST.files.filter((it) => names.length === 0 || names.includes(it.name))) {
      entries.push({ file: await findFile(entry.name), entry })
    }
    await buildFiles(entries, args.includes('--force'))
  },
  // Answers a comment thread (by its number in the file) and resolves it
  async reply (fileName, seqn, ...words) {
    const file = await findFile(fileName)
    const th = (await api('get-comment-threads', { fileId: file.id })).find((it) => it.seqn === Number(seqn))
    if (th === undefined) throw new Error(`No comment thread #${seqn} in "${fileName}"`)
    if (words.length > 0) await api('create-comment', { threadId: th.id, content: words.join(' ') })
    await api('update-comment-thread', { id: th.id, isResolved: true })
    console.log(`#${seqn} resolved`)
  },
  // Lists manual edits of the connected file with the scripts they came from
  async diff (name) {
    const connected = await connectedFile()
    if (connected === undefined) throw new Error('No Penpot tab is connected to MCP. Open the file in the browser')
    if (name !== undefined && name !== connected) throw new Error(`MCP is connected to "${connected}", open "${name}" instead`)
    const { changes, out } = await fileDiff(connected)
    const colorTokens = new Map()
    for (const [k, v] of Object.entries(buildTokens().colors.light)) colorTokens.set(v, [...(colorTokens.get(v) ?? []), k])
    const hint = (v) => {
      const m = String(v ?? '').match(/(#[0-9a-fA-F]{6}):([\d.]+)/)
      if (m === null) return ''
      const a = Math.round(Number(m[2]) * 255)
      const hex = m[1].toUpperCase() + (a < 255 ? a.toString(16).padStart(2, '0').toUpperCase() : '')
      const names = colorTokens.get(hex)
      return names ? ` (token: ${names.slice(0, 3).join(', ')})` : ' (no token)'
    }
    console.log(`${connected}: ${changes.length} manual edits -> ${out}`)
    for (const c of changes) {
      const where = `${c.page} / ${(c.path ?? []).join(' / ')}`
      if (c.kind === 'changed') {
        for (const [k, [a, b]] of Object.entries(c.changes)) console.log(`  ~ ${where}  ${k}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}${k === 'f' || k === 's' ? hint(b) : ''}  [${(c.src ?? []).join(', ')}]`)
      } else if (c.kind === 'comment') {
        console.log(`  # ${where}  comment #${c.thread}: ${c.comments.map((m) => `${m.user}: ${m.text}`).join(' | ')}`)
      } else if (c.kind === 'removed-children') {
        console.log(`  - ${where}  removed: ${c.removed.join(', ')}  [${(c.src ?? []).join(', ')}]`)
      } else {
        console.log(`  + ${where}  ${c.kind}  [${(c.src ?? []).join(', ')}]`)
      }
    }
  },
  demo: generate.demo,
  tokens: generate.tokens,
  // Runs kit + scripts in the Penpot file currently connected through the MCP plugin
  async run (...files) {
    if (files.length === 0) throw new Error('usage: run <script.js> [...]')
    printContent(await runScript(await scriptCode(files.map((f) => resolve(f)))))
  },
  async shot (shapeId, out = 'shot.png') {
    printContent(await mcpCall('export_shape', { shapeId, format: 'png' }), out)
  },
  async export (file, out) {
    const f = await findFile(file)
    // The method streams progress events; the last one points to the ready archive
    const events = (await api('export-binfile', { fileId: f.id, includeLibraries: false, embedAssets: true })).toString('utf8')
    const uri = events.match(/"~#uri":"([^"]+)"/)?.[1]
    if (uri === undefined) throw new Error(`export-binfile: no archive in response: ${events.slice(-300)}`)
    const res = await fetch(uri, { headers: { cookie } })
    if (!res.ok) throw new Error(`download ${uri}: HTTP ${res.status}`)
    const data = Buffer.from(await res.arrayBuffer())
    const target = out ?? join(here, 'files', `${f.name}.penpot`)
    writeFileSync(target, data)
    console.log(`${f.name} (${f.id}) -> ${target} (${data.length} bytes)`)
  },
  async import (input, projectName = 'Intabia') {
    const projects = await api('get-all-projects', {})
    const project = projects.find((p) => p.name === projectName) ?? projects.find((p) => p.isDefault === true)
    const form = new FormData()
    form.append('name', basename(input, '.penpot'))
    form.append('project-id', project.id)
    form.append('file', new Blob([readFileSync(input)]), basename(input))
    const res = await fetch(`${URL_BASE}/api/main/methods/import-binfile`, { method: 'POST', headers: { cookie, accept: 'application/json' }, body: form })
    console.log(res.status, (await res.text()).slice(0, 500))
  },
  async new (name, shared, projectName = 'Intabia') {
    const projects = await api('get-all-projects', {})
    const project = projects.find((p) => p.name === projectName) ?? await api('create-project', { name: projectName, teamId: projects[0].teamId })
    const f = await api('create-file', { name, projectId: project.id })
    if (shared === '--shared') await api('set-file-shared', { id: f.id, isShared: true })
    console.log(`${f.name} ${f.id}\n${URL_BASE}/#/workspace?team-id=${project.teamId}&file-id=${f.id}`)
  },
  async link (file, library) {
    const f = await findFile(file)
    const l = await findFile(library)
    await api('link-file-to-library', { fileId: f.id, libraryId: l.id })
    console.log(`${f.name} -> ${l.name}`)
  },
  async files () {
    for (const p of await api('get-all-projects', {})) {
      for (const f of await api('get-project-files', { projectId: p.id })) console.log(`${p.name}\t${f.name}\t${f.id}\t${f.isShared === true ? 'shared' : ''}`)
    }
  }
}

const [cmd, ...args] = argv
if (commands[cmd] === undefined) {
  console.log('usage: node dev/penpot/penpot.mjs <open|up|down|build|diff|reply|tokens|demo|run|shot|export|import|new|link|files> [...]')
  process.exit(1)
}
if (cmd === 'import') await api('get-all-projects', {})
commands[cmd](...args).catch((err) => {
  console.error(err.message)
  process.exit(1)
})
