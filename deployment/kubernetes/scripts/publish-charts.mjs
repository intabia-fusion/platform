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
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { chartVersion, k8sDir, repoRoot, run } from './chart-common.mjs'
import { packageCharts } from './package-charts.mjs'

function compareVersions (a, b) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value)
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4]?.split('.')] : [0, 0, 0, []]
  }
  const x = parse(a); const y = parse(b)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  if (!x[3] || !y[3]) return Number(!x[3]) - Number(!y[3])
  for (let i = 0; i < Math.max(x[3].length, y[3].length); i++) {
    const left = x[3][i]; const right = y[3][i]
    if (left === undefined || right === undefined) return left === undefined ? -1 : 1
    const ln = /^\d+$/.test(left); const rn = /^\d+$/.test(right)
    if (ln && rn && Number(left) !== Number(right)) return Number(left) - Number(right)
    if (ln !== rn) return ln ? -1 : 1
    if (left !== right) return left < right ? -1 : 1
  }
  return 0
}

function installScript (dir) {
  const scripts = join(dir, 'scripts')
  mkdirSync(scripts, { recursive: true })
  const destination = join(scripts, 'platform.mjs')
  const stamp = join(scripts, '.platform.mjs.sha256')
  const source = readFileSync(join(k8sDir, 'selfhost/scripts/platform.mjs'))
  const hash = data => createHash('sha256').update(data).digest('hex')
  const next = hash(source)
  const previous = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : undefined
  const current = existsSync(destination) ? hash(readFileSync(destination)) : undefined
  if (current && current !== previous && current !== next) {
    console.warn(`keeping modified ${destination}`)
    return
  }
  if (current !== next) writeFileSync(destination, source)
  if (previous !== next) writeFileSync(stamp, next + '\n')
}

function main (args) {
  let version = ''; let init = false; let push = true; let prune = false; let keep = 3
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--init') init = true
    else if (arg === '--no-push') push = false
    else if (arg === '--prune') prune = true
    else if (arg === '--keep') {
      const value = args[++i]
      keep = Number(value)
      if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(keep) || keep < 1) throw Object.assign(new Error('--keep must be >= 1'), { exitCode: 2 })
    } else if (arg.startsWith('-')) throw Object.assign(new Error(`unknown option: ${arg}`), { exitCode: 2 })
    else version = arg
  }
  const normalized = chartVersion(version)
  version ||= `v${normalized}`
  const dir = process.env.CHARTS_DIR || join(repoRoot, '../platform-charts')
  const url = process.env.CHARTS_URL || 'https://intabia-fusion.github.io/platform-charts'
  const env = { ...process.env }
  if (process.env.CHARTS_TOKEN) {
    const index = Number(env.GIT_CONFIG_COUNT || 0)
    if (!Number.isSafeInteger(index) || index < 0) throw new Error('invalid GIT_CONFIG_COUNT')
    env.GIT_CONFIG_COUNT = String(index + 1)
    env[`GIT_CONFIG_KEY_${index}`] = 'http.https://github.com/intabia-fusion/platform-charts.git.extraheader'
    env[`GIT_CONFIG_VALUE_${index}`] = `Authorization: Basic ${Buffer.from(`x-access-token:${process.env.CHARTS_TOKEN}`).toString('base64')}`
  }
  const git = (...args) => run('git', ['-C', dir, ...args], { env })
  if (!existsSync(join(dir, '.git'))) {
    console.log(`>> cloning platform-charts into ${dir}`)
    const cloneUrl = process.env.CHARTS_TOKEN ? 'https://github.com/intabia-fusion/platform-charts.git' : process.env.CHARTS_REPO_URL || 'https://github.com/intabia-fusion/platform-charts.git'
    run('git', ['clone', '--depth', '1', cloneUrl, dir], { env })
  } else {
    let upstream = false
    try { git('rev-parse', '--abbrev-ref', '@{u}'); upstream = true } catch {}
    if (upstream) {
      if (!git('status', '--porcelain').trim()) git('pull', '--ff-only')
      else console.log(`>> local changes in ${dir}: skipping pull`)
    }
  }
  const docs = join(dir, 'docs')
  mkdirSync(docs, { recursive: true })
  installScript(dir)
  if (init) {
    cpSync(join(k8sDir, 'selfhost', 'values'), join(dir, 'values'), {
      recursive: true,
      force: false,
      filter: source => !/^secrets-(?:base|platform)\.yaml$/.test(basename(source))
    })
    for (const name of ['README.md', '.gitignore']) if (!existsSync(join(dir, name))) cpSync(join(k8sDir, 'selfhost', name), join(dir, name))
  }
  packageCharts(version, docs)
  const index = () => run('helm', ['repo', 'index', docs, '--url', url])
  index()
  if (prune) {
    for (const chart of ['platform-base', 'platform', 'monitoring']) {
      const names = readdirSync(docs).filter(name => name.startsWith(`${chart}-`) && name.endsWith('.tgz') && (chart !== 'platform' || !name.startsWith('platform-base-')))
      names.sort((a, b) => compareVersions(b.slice(chart.length + 1, -4), a.slice(chart.length + 1, -4)))
      for (const name of names.slice(keep)) { console.log(`prune ${name}`); unlinkSync(join(docs, name)) }
    }
    index()
  }
  const entries = (readFileSync(join(docs, 'index.yaml'), 'utf8').match(/^\s*version:/gm) || []).length
  console.log(`>> packaged ${version}; index has ${entries} chart versions`)
  if (!push) { console.log(`>> --no-push: changes are in ${dir}`); return }
  if (!git('status', '--porcelain').trim()) { console.log(`>> nothing to publish: ${version} is already in the repository`); return }
  git('add', '-A')
  git('-c', `user.name=${process.env.GIT_AUTHOR_NAME || 'platform-ci'}`, '-c', `user.email=${process.env.GIT_AUTHOR_EMAIL || 'ci@intabia-fusion.local'}`, 'commit', '-m', `charts: ${version}`)
  git('push', 'origin', 'HEAD')
  console.log(`>> pushed charts ${version} to platform-charts`)
}

try { main(process.argv.slice(2)) } catch (error) {
  console.error(error.message)
  process.exitCode = error.exitCode ?? 1
}
