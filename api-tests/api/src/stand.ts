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

// The stand the api-tests and backup-tests run against, as a testcontainers compose environment.
// API_STAND (keep/stop/external) and STAND_COVERAGE are described in docs/testing.md.

import { execFileSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment } from 'testcontainers'

// src/ or lib/ -> api-tests/, where the compose files, .env and the coverage profiles live.
const standDir = resolve(__dirname, '..', '..')
const repoRoot = resolve(standDir, '..')
const project = 'api-tests'

interface StandState {
  env: StartedDockerComposeEnvironment
  owned: boolean
}

// globalSetup and globalTeardown run in the same process, as separate modules.
const holder = globalThis as typeof globalThis & { __apiStand?: StandState }

function composeFiles (): string[] {
  return ['docker-compose.yaml', ...(process.env.STAND_COVERAGE === 'true' ? ['docker-compose.coverage.yaml'] : [])]
}

function isUp (): boolean {
  return execFileSync('docker', ['compose', '-p', project, 'ps', '-q'], { cwd: standDir }).toString().trim() !== ''
}

/** @public */
export async function startStand (): Promise<void> {
  const mode = process.env.API_STAND
  if (mode === 'external') return
  const reuse = isUp()
  const env = await new DockerComposeEnvironment(standDir, composeFiles())
    // Before withProjectName: withNoRecreate() resets the project name to `testcontainers-node`.
    .withNoRecreate()
    .withProjectName(project)
    // The reaper takes the project down when this process exits, which `keep` must survive.
    .withAutoCleanup(!reuse && mode !== 'keep')
    .withStartupTimeout(180000)
    .up()
  holder.__apiStand = { env, owned: !reuse }
  if (reuse) return

  // Accounts, workspaces and their data: the same seeding tests/ and ws-tests/ get from prepare.sh.
  const seed = spawnSync(join(repoRoot, 'dev', 'test-base', 'run.sh'), ['api', 'seed'], { stdio: 'inherit' })
  if (seed.status !== 0) throw new Error(`stand seeding failed with ${seed.status}`)
}

/** @public */
export async function stopStand (): Promise<void> {
  const state = holder.__apiStand
  const mode = process.env.API_STAND
  if (state === undefined || mode === 'keep' || (mode !== 'stop' && !state.owned)) return

  mkdirSync(join(standDir, 'logs'), { recursive: true })
  const logs = spawnSync('docker', ['compose', '-p', project, 'logs', '--no-color', '--timestamps'], {
    cwd: standDir,
    maxBuffer: 1024 * 1024 * 1024
  })
  writeFileSync(join(standDir, 'logs', 'stand.log'), logs.stdout)
  // A pod writes its coverage profile as it exits, so it gets time to exit on its own.
  await state.env.down({ timeout: 60000, removeVolumes: true })

  // On Linux the pods write their profiles as root; the host user has to read and later delete them.
  if (existsSync(join(standDir, 'coverage'))) {
    spawnSync(
      'docker',
      ['run', '--rm', '-v', `${join(standDir, 'coverage')}:/c`, 'nginx:alpine', 'chmod', '-R', 'a+rwX', '/c'],
      {
        stdio: 'inherit'
      }
    )
  }
}
