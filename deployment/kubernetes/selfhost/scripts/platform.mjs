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
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = process.env
const ns = env.NS || 'platform'
const baseNs = env.SINGLE_NAMESPACE === '1' ? ns : env.NS_BASE || 'platform-base'
const timeout = env.HELM_TIMEOUT || '15m'
const command = process.argv[2]

function helm (args, { capture = false, dry = false } = {}) {
  if (dry) { console.log('+ helm ' + args.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')); return '' }
  const result = spawnSync('helm', args, { cwd: command === 'rollback' ? process.cwd() : root, encoding: 'utf8', stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'] })
  if (result.error) throw result.error
  if (result.status !== 0) throw Object.assign(new Error(`helm exited with ${result.status ?? result.signal}`), { exitCode: result.status || 1 })
  return result.stdout || ''
}

function install (version, diff) {
  const profile = env.PROFILE || 'bundled'
  if (!['bundled', 'external'].includes(profile)) throw Object.assign(new Error('PROFILE must be bundled or external'), { exitCode: 2 })
  version = env.PLATFORM_VERSION || version
  if (!version) throw Object.assign(new Error('usage: PLATFORM_VERSION=vX.Y.Z PROFILE=bundled|external node scripts/platform.mjs install'), { exitCode: 2 })
  const chartVersion = env.CHART_VERSION || version.replace(/^v/, '')
  const dry = env.DRY_RUN === '1'
  if (diff && !helm(['plugin', 'list'], { capture: true }).split('\n').some(line => line.trim().split(/\s+/)[0] === 'diff')) {
    throw Object.assign(new Error('helm-diff is required for diff: helm plugin install https://github.com/databus23/helm-diff'), { exitCode: 2 })
  }
  const baseFiles = ['-f', `values/base-${profile}.yaml`]
  if (profile === 'bundled' && env.EXTERNAL) {
    for (const part of env.EXTERNAL.split(',')) {
      const overlay = `values/external/${part}.yaml`
      if (!existsSync(join(root, overlay)) || part.includes('/') || part.includes('..')) throw Object.assign(new Error(`unknown EXTERNAL component '${part}'`), { exitCode: 2 })
      baseFiles.push('-f', overlay)
    }
  }
  const baseSecrets = existsSync(join(root, 'values/secrets-base.yaml')) ? ['-f', 'values/secrets-base.yaml'] : []
  const platformSecrets = existsSync(join(root, 'values/secrets-platform.yaml')) ? ['-f', 'values/secrets-platform.yaml'] : []
  const chart = name => env.CHARTS_DIR ? join(env.CHARTS_DIR, `${name}-${chartVersion}.tgz`) : `platform-charts/${name}`
  const versionArgs = env.CHARTS_DIR ? [] : ['--version', chartVersion]
  const upgrade = diff ? ['diff', 'upgrade', '--install'] : ['upgrade', '--install']
  const applyArgs = diff ? [] : ['--create-namespace']
  const waitArgs = diff ? [] : ['--timeout', timeout, '--wait']
  if (!env.CHARTS_DIR && !dry) {
    helm(['repo', 'add', 'platform-charts', env.CHARTS_URL || 'https://intabia-fusion.github.io/platform-charts', '--force-update'], { dry })
    helm(['repo', 'update', 'platform-charts'], { dry })
  }
  console.log(`>> platform-base ${chartVersion} (${profile}) in ${baseNs}`)
  helm([...upgrade, 'platform-base', chart('platform-base'), ...versionArgs, '-n', baseNs, ...applyArgs, ...baseFiles, ...baseSecrets, ...waitArgs], { dry })
  console.log(`>> platform ${chartVersion} (${profile}) in ${ns}`)
  helm([...upgrade, 'platform', chart('platform'), ...versionArgs, '-n', ns, ...applyArgs, '-f', `values/platform-${profile}.yaml`, ...platformSecrets, '--set', `global.namespace=${ns}`, '--set', `global.baseNamespace=${baseNs}`, '--set', `global.version=${version}`, ...waitArgs], { dry })
  if (dry) console.log('>> dry run: see the commands above')
  else if (diff) console.log('>> diff done, nothing applied')
  else {
    const values = JSON.parse(helm(['-n', ns, 'get', 'values', 'platform', '-o', 'json'], { capture: true }))
    console.log(`>> installed ${version}: https://${values.global.hostUrl}`)
  }
}

function rollback (target = 'previous') {
  if (target === '--list') {
    console.log(`== ${ns}/platform`); helm(['-n', ns, 'history', 'platform'])
    console.log(`== ${baseNs}/platform-base`); helm(['-n', baseNs, 'history', 'platform-base'])
    return
  }
  if (target === 'previous') {
    const history = JSON.parse(helm(['-n', ns, 'history', 'platform', '-o', 'json'], { capture: true }))
    if (history.length < 2) throw new Error('platform has a single revision, nothing to roll back')
    target = String(history.at(-2).revision)
  }
  if (!/^\d+$/.test(target)) throw Object.assign(new Error('usage: node scripts/platform.mjs rollback [revision|--list]'), { exitCode: 2 })
  for (const [namespace, release] of [[ns, 'platform'], [baseNs, 'platform-base']]) {
    console.log(`>> rollback ${release} to revision ${target} in ${namespace}`)
    helm(['-n', namespace, 'rollback', release, target, '--wait', '--timeout', timeout])
  }
  for (const [namespace, release] of [[ns, 'platform'], [baseNs, 'platform-base']]) {
    console.log(helm(['-n', namespace, 'history', release], { capture: true }).trimEnd().split('\n').slice(-3).join('\n'))
  }
}

try {
  const [command, arg] = process.argv.slice(2)
  if (['install', 'apply', 'upgrade', 'diff'].includes(command)) install(arg, command === 'diff' || env.DIFF === '1')
  else if (command === 'rollback') rollback(arg)
  else throw Object.assign(new Error('usage: node scripts/platform.mjs install|apply|upgrade|diff|rollback [argument]'), { exitCode: 2 })
} catch (error) {
  console.error(error.message)
  process.exitCode = error.exitCode ?? 1
}
