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

// The stand the api-tests and backup-tests run against: the `api` Kubernetes test
// stand (deployment/kubernetes/stands/api), reset and seeded in-cluster by
// deployment/kubernetes/scripts/prepare-test-stand.sh. The target cluster comes
// from the active stand configuration (pnpm -w stand:configure; see
// deployment/kubernetes/scripts/lib.sh) - there is no compose scenario anymore.
// API_STAND (keep/stop/external) and STAND_COVERAGE are described in docs/testing.md.

import { spawn, spawnSync } from 'child_process'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

// src/ or lib/ -> api-tests/, where the logs and the coverage profiles live.
const standDir = resolve(__dirname, '..', '..')
const repoRoot = resolve(standDir, '..')
const scriptsDir = join(repoRoot, 'deployment', 'kubernetes', 'scripts')
const standName = 'api'
const coverageDir = join(standDir, 'coverage')
const coverage = process.env.STAND_COVERAGE === 'true'

interface StandState {
  owned: boolean
  forwards: Array<{ proc: ReturnType<typeof spawn>, port: number }>
}

// globalSetup and globalTeardown run in the same process, as separate modules.
const holder = globalThis as typeof globalThis & { __apiStand?: StandState }

function run (args: string[]): void {
  const res = spawnSync('bash', args, { stdio: 'inherit' })
  if (res.status !== 0) {
    throw new Error(`${args.join(' ')} exited with ${res.status ?? 'a signal'}`)
  }
}

// Everything the shell scripts resolve (namespace, context, kubeconfig) lives in
// lib.sh; ask it instead of re-implementing the values parsing here.
function shCapture (script: string): string {
  const res = spawnSync('bash', ['-c', `source "${scriptsDir}/lib.sh" && ${script}`], { encoding: 'utf-8' })
  if (res.status !== 0) {
    throw new Error(`cannot resolve stand settings via lib.sh (${script}): ${res.stderr}`)
  }
  return res.stdout.trim()
}

function namespace (): string {
  return shCapture(`stand_namespace ${standName}`)
}

function isUp (): boolean {
  const ns = namespace()
  const res = spawnSync('bash', ['-c', `source "${scriptsDir}/lib.sh" && kc -n "${ns}" get deployment account`])
  return res.status === 0
}

function portOpen (port: number): boolean {
  return spawnSync('bash', ['-c', `(exec 3<>/dev/tcp/127.0.0.1/${port}) 2>/dev/null`]).status === 0
}

async function waitPortOpen (port: number): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    if (portOpen(port)) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return false
}

// Backup tests reach the workspace database and the backup archive bucket
// directly (the harness defaults point at localhost:5533 / localhost:9102), so
// those cluster services are published on the host for the duration of the run.
async function startForward (
  ns: string,
  resource: string,
  port: number,
  targetPort: number
): Promise<StandState['forwards'][number] | undefined> {
  if (portOpen(port)) return undefined // someone already forwards this port - leave it alone
  const proc = spawn('bash', [
    '-c',
    `source "${scriptsDir}/lib.sh" && exec kubectl --context "$KUBE_CONTEXT" -n "${ns}" port-forward ${resource} ${port}:${targetPort}`
  ], { stdio: 'ignore' })
  if (await waitPortOpen(port)) return { proc, port }
  try {
    proc.kill('SIGKILL')
  } catch {}
  throw new Error(`port-forward ${resource} ${port}:${targetPort} did not start`)
}

/** @public */
export async function startStand (): Promise<void> {
  const mode = process.env.API_STAND
  if (mode === 'external') return

  const up = isUp()
  if (!(up && mode === 'keep')) {
    if (!up) {
      // Full cycle: remove the old stand, wipe its data, deploy, seed in-cluster.
      // STAND_COVERAGE reaches deploy.sh through the environment and turns on the
      // coverage PVC + NODE_V8_COVERAGE of the pods.
      run([join(scriptsDir, 'prepare-test-stand.sh'), standName])
    }
    // up but not `keep`: reused like the compose flow did, without re-seeding
  }
  // postgres/s3/mailpit live in platform-base, not in the stand namespace.
  const baseNs = shCapture('echo "$BASE_NAMESPACE"')
  const forwards = [
    await startForward(baseNs, 'statefulset/postgres', 5533, 5432),
    await startForward(baseNs, 'statefulset/s3', 9102, 9000),
    await startForward(baseNs, 'deployment/mailpit', 8126, 8025)
  ].filter((f): f is StandState['forwards'][number] => f !== undefined)
  holder.__apiStand = { owned: !up, forwards }
}

/** @public */
export async function stopStand (): Promise<void> {
  const state = holder.__apiStand
  const mode = process.env.API_STAND
  if (state === undefined) return

  for (const forward of state.forwards) {
    try {
      forward.proc.kill('SIGTERM')
    } catch {}
  }
  if (mode === 'keep' || (mode !== 'stop' && !state.owned)) return

  // Diagnostics for the CI artifacts, best-effort (never fails the teardown).
  const logsOut = join(standDir, 'logs', 'stand')
  mkdirSync(logsOut, { recursive: true })
  spawnSync('bash', [join(repoRoot, 'common', 'scripts', 'k8s-stand-logs.sh'), standName, logsOut], {
    stdio: 'inherit'
  })

  // Pods write their V8 profile only as they exit; collect before the namespace
  // (and the coverage PVC with it) goes away. A stand prepared without
  // STAND_COVERAGE=true has no PVC - there is nothing to collect, keep tearing
  // down.
  if (coverage) {
    const pvc = spawnSync('bash', [
      '-c',
      `source "${scriptsDir}/lib.sh" && kc -n "${namespace()}" get pvc stand-coverage`
    ])
    if (pvc.status === 0) {
      run([join(scriptsDir, 'coverage-collect.sh'), standName, coverageDir])
    } else {
      console.warn('stand has no stand-coverage PVC (prepared without STAND_COVERAGE=true?) - skipping profile collection')
    }
  }

  // API_STAND=stop removes only the api stand; platform-base and other stands stay.
  run([join(scriptsDir, 'test-down.sh'), standName, '--yes'])
}
