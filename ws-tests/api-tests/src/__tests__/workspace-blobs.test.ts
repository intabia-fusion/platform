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

import { loadServerConfig, type ServerConfig } from '@hcengineering/api-client'
import { type WorkspaceUuid } from '@hcengineering/core'

import { DEV_OTP, rpc, STAND_URL } from './admin.fixtures'

const DATALAKE_URL = `${STAND_URL}/_datalake`

/**
 * Deleting a workspace drops its database, never its files. The blobs are marked instead, so a
 * later sweep can find them - and that mark only lands once the deletion is past calling off.
 */
describe('workspace-blobs-deletion', () => {
  const email = `blobs-${Date.now()}@example.com`
  const password = '1234'
  const blobName = `note-${Date.now()}.txt`

  let config: ServerConfig
  let adminSession: string
  let userToken: string
  let wsToken: string
  let wsUuid: WorkspaceUuid
  let wsUrl: string

  beforeAll(async () => {
    config = await loadServerConfig(STAND_URL)
    const login = await rpc(config, undefined, 'login', { email: 'admin', password })
    expect(login.error).toBeUndefined()
    const session = await rpc(config, login.result.token, 'verifyAdminSession', { otpCode: DEV_OTP })
    expect(session.error).toBeUndefined()
    adminSession = session.result.token
  }, 60000)

  async function adminOp (method: string, params: Record<string, any>): Promise<any> {
    await rpc(config, adminSession, 'requestAdminOperationOtp', {})
    return await rpc(config, adminSession, method, { ...params, otpCode: DEV_OTP })
  }

  async function workspaceStatus (): Promise<any> {
    const res = await rpc(config, adminSession, 'listWorkspaces', { isDisabled: null })
    return res.result?.find((it: any) => it.uuid === wsUuid)?.status
  }

  async function waitMode (mode: string, timeoutMs = 240000): Promise<void> {
    const until = Date.now() + timeoutMs
    let last: string | undefined
    while (Date.now() < until) {
      last = (await workspaceStatus())?.mode
      if (last === mode) return
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error(`workspace never reached mode '${mode}', last: ${last}`)
  }

  async function blobStatus (token: string | undefined = wsToken): Promise<number> {
    const res = await fetch(`${DATALAKE_URL}/blob/${wsUuid}/${blobName}`, {
      headers: token !== undefined ? { Authorization: `Bearer ${token}` } : {}
    })
    return res.status
  }

  async function headStatus (token: string | undefined = wsToken): Promise<number> {
    const res = await fetch(`${DATALAKE_URL}/blob/${wsUuid}/${blobName}`, {
      method: 'HEAD',
      headers: token !== undefined ? { Authorization: `Bearer ${token}` } : {}
    })
    return res.status
  }

  /** Admin listing of the workspace: what a sweep or a support request would see. */
  async function listedBlobs (): Promise<any[]> {
    const res = await fetch(`${DATALAKE_URL}/blob/${wsUuid}`, {
      headers: { Authorization: `Bearer ${adminSession}` }
    })
    if (res.status !== 200) return []
    const body = await res.json()
    return body.blobs ?? []
  }

  async function upload (name: string, token: string): Promise<number> {
    const form = new FormData()
    form.append('file', new Blob(['payload'], { type: 'text/plain' }), name)
    const res = await fetch(`${DATALAKE_URL}/upload/form-data/${wsUuid}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    })
    return res.status
  }

  async function waitBlobGone (timeoutMs = 120000): Promise<number> {
    const until = Date.now() + timeoutMs
    let last = 0
    while (Date.now() < until) {
      last = await blobStatus()
      if (last === 404) return last
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    return last
  }

  it('uploads a file into a fresh workspace', async () => {
    const signedUp = await rpc(config, undefined, 'signUp', { email, password, firstName: 'Blob', lastName: 'Owner' })
    expect(signedUp.error).toBeUndefined()
    userToken = signedUp.result.token

    const created = await rpc(config, userToken, 'createWorkspace', {
      workspaceName: `blobs-${Date.now()}`
    })
    expect(created.error).toBeUndefined()
    wsUuid = created.result.workspace
    wsUrl = created.result.workspaceUrl
    await waitMode('active')

    const selected = await rpc(config, userToken, 'selectWorkspace', {
      workspaceUrl: wsUrl,
      kind: 'external'
    })
    expect(selected.error).toBeUndefined()
    wsToken = selected.result.token

    expect(await upload(blobName, wsToken)).toEqual(200)

    expect(await blobStatus()).toEqual(200)
    expect(await listedBlobs()).toHaveLength(1)
  }, 300000)

  it('keeps the file while the deletion can still be called off', async () => {
    const scheduled = await adminOp('performWorkspaceOperation', { workspaceId: wsUuid, event: 'delete', params: [] })
    expect(scheduled.error).toBeUndefined()

    const status = await workspaceStatus()
    expect(status.mode).toEqual('active')
    expect(status.deleteOn).toBeGreaterThan(Date.now())

    // Read-only window: the data must still be there to be taken out.
    expect(await blobStatus()).toEqual(200)

    // ... and only taken out: a token issued now carries extra.readonly, which datalake refuses
    // for every write.
    const readonly = await rpc(config, userToken, 'selectWorkspace', { workspaceUrl: wsUrl, kind: 'external' })
    expect(readonly.error).toBeUndefined()
    expect(await upload(`late-${Date.now()}.txt`, readonly.result.token)).toEqual(401)

    const cancelled = await adminOp('performWorkspaceOperation', {
      workspaceId: wsUuid,
      event: 'cancel-delete',
      params: []
    })
    expect(cancelled.error).toBeUndefined()
    expect(await blobStatus()).toEqual(200)
  }, 120000)

  it('freezes an archived workspace without emptying it', async () => {
    const archived = await adminOp('performWorkspaceOperation', { workspaceId: wsUuid, event: 'archive', params: [] })
    expect(archived.error).toBeUndefined()
    await waitMode('archived')

    // The files are what a restore brings back, so they stay readable.
    expect(await blobStatus()).toEqual(200)

    // A token taken out now is read-only, and datalake refuses every write carrying that flag.
    const selected = await rpc(config, userToken, 'selectWorkspace', { workspaceUrl: wsUrl, kind: 'external' })
    expect(selected.error).toBeUndefined()
    const archivedToken: string = selected.result.token
    expect(await upload(`archived-${Date.now()}.txt`, archivedToken)).toEqual(401)

    const removed = await fetch(`${DATALAKE_URL}/blob/${wsUuid}/${blobName}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${archivedToken}` }
    })
    expect(removed.status).toEqual(401)
    expect(await blobStatus()).toEqual(200)
  }, 420000)

  it('takes changes again once the workspace is restored', async () => {
    const restored = await adminOp('performWorkspaceOperation', { workspaceId: wsUuid, event: 'unarchive', params: [] })
    expect(restored.error).toBeUndefined()
    await waitMode('active')

    const selected = await rpc(config, userToken, 'selectWorkspace', { workspaceUrl: wsUrl, kind: 'external' })
    expect(selected.error).toBeUndefined()
    wsToken = selected.result.token

    expect(await upload(`restored-${Date.now()}.txt`, wsToken)).toEqual(200)
    expect(await blobStatus()).toEqual(200)
  }, 420000)

  it('marks the file once the workspace is actually purged', async () => {
    const res = await adminOp('performWorkspaceOperation', { workspaceId: wsUuid, event: 'delete-now', params: [] })
    expect(res.error).toBeUndefined()

    // The purge pipeline drops the database and only then announces the deletion.
    await waitMode('deleted')

    expect(await waitBlobGone()).toEqual(404)
  }, 420000)

  it('serves the file to nobody afterwards', async () => {
    // The workspace token outlives the workspace, and anonymous reads are allowed unless SECURE
    // is set - neither may bring the file back.
    expect(await blobStatus()).toEqual(404)
    expect(await blobStatus(undefined)).toEqual(404)
    expect(await headStatus()).toEqual(404)
    expect(await headStatus(undefined)).toEqual(404)

    // Gone from the listing too, so nothing walks into it by accident.
    expect(await listedBlobs()).toHaveLength(0)

    const meta = await fetch(`${DATALAKE_URL}/meta/${wsUuid}/${blobName}`, {
      headers: { Authorization: `Bearer ${wsToken}` }
    })
    expect(meta.status).toEqual(404)
  }, 120000)
})
