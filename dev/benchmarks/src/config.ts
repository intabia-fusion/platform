/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

export interface BenchConfig {
  url: string
  email: string
  password: string
  workspace: string

  // Scenario params
  scenario: string
  clients: number[]
  duration: number
  workspaces: number
  projectsPerWs: number
  output?: string

  // Multi-workspace params
  transactorUrl?: string
  region?: string
  workspaceList?: string[]
  profile: boolean
  profileDir?: string

  // Live (WebSocket) scenario params
  iters: number
  count: number
  tenants: boolean
  prefix: string
  startIdx: number
  keepOpen: boolean
  small?: string
  medium?: string
  large?: string
  manifest?: string
  disruptCmd?: string
}

function parseIntList (val: string): number[] {
  return val.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
}

export function parseArgs (argv: string[]): BenchConfig {
  const args = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const val = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true'
      args.set(key, val)
      if (val !== 'true') i++
    }
  }

  const flag = (k: string): boolean => args.get(k) === 'true' || args.get(k) === '1'

  return {
    url: args.get('url') ?? process.env.HULY_URL ?? 'http://localhost:8087',
    email: args.get('email') ?? process.env.HULY_EMAIL ?? 'user1',
    password: args.get('password') ?? process.env.HULY_PASSWORD ?? '1234',
    workspace: args.get('workspace') ?? process.env.HULY_WORKSPACE ?? 'bench-ws',

    scenario: args.get('scenario') ?? 'all',
    clients: parseIntList(args.get('clients') ?? '1,5,10,20,50'),
    duration: parseInt(args.get('duration') ?? '15', 10),
    workspaces: parseInt(args.get('workspaces') ?? '10', 10),
    projectsPerWs: parseInt(args.get('projects-per-ws') ?? '50', 10),
    output: args.get('output'),

    transactorUrl: args.get('transactor-url') ?? process.env.TRANSACTOR_URL,
    region: args.get('region') ?? process.env.HULY_REGION,
    workspaceList: args.get('workspace-list') !== undefined
      ? args.get('workspace-list')!.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    profile: args.get('profile') === 'true',
    profileDir: args.get('profile-dir'),

    iters: parseInt(args.get('iters') ?? '30', 10),
    count: parseInt(args.get('count') ?? args.get('n') ?? '100', 10),
    tenants: flag('tenants'),
    prefix: args.get('prefix') ?? 'co',
    startIdx: parseInt(args.get('start') ?? '1', 10),
    keepOpen: flag('keep-open'),
    small: args.get('small'),
    medium: args.get('medium'),
    large: args.get('large'),
    manifest: args.get('manifest'),
    disruptCmd: args.get('disrupt'),
  }
}
