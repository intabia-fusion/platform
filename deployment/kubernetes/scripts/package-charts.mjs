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
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chartVersion, k8sDir, repoRoot, run } from './chart-common.mjs'

export function packageCharts (version, out = join(repoRoot, 'dist/charts')) {
  version = chartVersion(version)
  mkdirSync(out, { recursive: true })
  console.log(`>> packaging charts ${version} into ${out}`)
  copyFileSync(join(repoRoot, 'tests/indexes.yaml'), join(k8sDir, 'charts/platform/files/indexes.yaml'))
  const chart = name => join(k8sDir, 'charts', name)
  run('helm', ['lint', chart('platform-base')])
  run('helm', ['lint', chart('platform'), '-f', join(k8sDir, 'stands/ci/render-check.yaml')])
  run('helm', ['dependency', 'build', chart('monitoring')])
  run('helm', ['lint', chart('monitoring')])
  for (const name of ['platform-base', 'platform', 'monitoring']) {
    const args = ['package', '--version', version]
    if (name !== 'monitoring') args.push('--app-version', version)
    run('helm', [...args, '--destination', out, chart(name)])
  }
  for (const name of readdirSync(out).filter(name => name.endsWith(`-${version}.tgz`)).sort()) console.log(join(out, name))
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { packageCharts(process.argv[2], process.argv[3]) } catch (error) {
    console.error(error.message)
    process.exitCode = error.exitCode ?? 1
  }
}
