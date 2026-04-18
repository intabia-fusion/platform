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

import {
  getWorkspaceToken,
  loadServerConfig,
  type ServerConfig,
  type WorkspaceToken
} from '@intabiafusion/api-client'
import { getClient as getAccountClient, type AccountClient } from '@intabiafusion/account-client'
import type { WorkspaceUuid, WorkspaceMode } from '@intabiafusion/core'

import type { BenchConfig } from './config'

export interface WorkspaceInfo {
  workspaceId: WorkspaceUuid
  workspaceUrl: string
  name: string
  token: WorkspaceToken
}

/** Wait until workspace becomes active (max ~60s) */
async function waitForWorkspaceReady (
  accountClient: AccountClient,
  maxWaitMs: number = 60000
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const info = await accountClient.getWorkspaceInfo()
      const mode = info.mode as WorkspaceMode | string | undefined
      if (mode === 'active' || mode === undefined) {
        return true
      }
      console.log(`    workspace mode: ${String(mode)}, waiting...`)
    } catch {
      // workspace may not be accessible yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return false
}

/** Create multiple workspaces via account API and return connection info for each */
export async function createWorkspaces (
  cfg: BenchConfig,
  config: ServerConfig,
  count: number,
  region?: string
): Promise<WorkspaceInfo[]> {
  // Login to get account client
  const loginResp = await loginToAccount(cfg, config)
  const results: WorkspaceInfo[] = []

  for (let i = 0; i < count; i++) {
    const name = `bench-ws-${i.toString().padStart(3, '0')}`
    console.log(`  creating workspace ${i + 1}/${count}: ${name}`)

    try {
      const wsInfo = await loginResp.accountClient.createWorkspace(name, region)

      // Wait for workspace to be ready
      const wsAccountClient = getAccountClient(config.ACCOUNTS_URL, wsInfo.token)
      const ready = await waitForWorkspaceReady(wsAccountClient)
      if (!ready) {
        console.error(`    workspace ${name} did not become active in time, skipping`)
        continue
      }

      const wsToken = await getWorkspaceToken(cfg.url, {
        email: cfg.email,
        password: cfg.password,
        workspace: wsInfo.workspaceUrl
      }, config)

      results.push({
        workspaceId: wsInfo.workspace,
        workspaceUrl: wsInfo.workspaceUrl,
        name,
        token: wsToken
      })
    } catch (err: any) {
      // Workspace may already exist — try to connect to it
      if (String(err?.message ?? '').includes('already exists') || String(err?.message ?? '').includes('duplicate')) {
        console.log(`    workspace ${name} already exists, connecting...`)
        try {
          const wsToken = await getWorkspaceToken(cfg.url, {
            email: cfg.email,
            password: cfg.password,
            workspace: name
          }, config)
          results.push({
            workspaceId: wsToken.workspaceId,
            workspaceUrl: name,
            name,
            token: wsToken
          })
        } catch (connErr: any) {
          console.error(`    failed to connect to existing workspace ${name}: ${connErr.message}`)
        }
      } else {
        console.error(`    failed to create workspace ${name}: ${err.message}`)
      }
    }
  }

  console.log(`  created/connected ${results.length}/${count} workspaces`)
  return results
}

/** Connect to existing workspaces by URL pattern */
export async function connectToWorkspaces (
  cfg: BenchConfig,
  config: ServerConfig,
  workspaceUrls: string[]
): Promise<WorkspaceInfo[]> {
  const results: WorkspaceInfo[] = []

  for (const wsUrl of workspaceUrls) {
    try {
      const wsToken = await getWorkspaceToken(cfg.url, {
        email: cfg.email,
        password: cfg.password,
        workspace: wsUrl
      }, config)

      results.push({
        workspaceId: wsToken.workspaceId,
        workspaceUrl: wsUrl,
        name: wsUrl,
        token: wsToken
      })
    } catch (err: any) {
      console.error(`  failed to connect to workspace ${wsUrl}: ${err.message}`)
    }
  }

  return results
}

interface LoginResult {
  accountClient: AccountClient
  token: string
}

async function loginToAccount (cfg: BenchConfig, config: ServerConfig): Promise<LoginResult> {
  const accountClient = getAccountClient(config.ACCOUNTS_URL)
  const loginInfo = await accountClient.login(cfg.email, cfg.password)
  if (loginInfo.token === undefined) {
    throw new Error('Login failed: no token received')
  }
  const authedClient = getAccountClient(config.ACCOUNTS_URL, loginInfo.token)
  return { accountClient: authedClient, token: loginInfo.token }
}
