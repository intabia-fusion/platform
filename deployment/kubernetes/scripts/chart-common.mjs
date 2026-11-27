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
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

export const scriptsDir = dirname(fileURLToPath(import.meta.url))
export const k8sDir = resolve(scriptsDir, '..')
export const repoRoot = resolve(k8sDir, '../..')

export function run (command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const error = new Error(`${command} exited with ${result.status ?? result.signal}`)
    error.exitCode = result.status || 1
    throw error
  }
  return result.stdout ?? ''
}

export function chartVersion (version) {
  if (!version) {
    try {
      version = run('git', ['-C', repoRoot, 'describe', '--tags', '--match', 'v*', '--abbrev=0'], { stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      throw Object.assign(new Error('no v* release tag found: pass the version explicitly'), { exitCode: 2 })
    }
  }
  if (version.startsWith('s')) throw Object.assign(new Error(`${version} is a staging tag: charts are for v* release tags only`), { exitCode: 2 })
  if (version.includes('+')) throw Object.assign(new Error(`${version} carries build metadata (+...): tag the release without +build`), { exitCode: 2 })
  if (!/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw Object.assign(new Error(`invalid version '${version}': expected vX.Y.Z or X.Y.Z, with an optional -prerelease`), { exitCode: 2 })
  }
  return version.replace(/^v/, '')
}
