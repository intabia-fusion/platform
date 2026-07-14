//
// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { loadServerConfig } from '@hcengineering/api-client'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import { isActiveMode } from '@hcengineering/core'

const COUNT = parseInt(process.env.BENCH_WS_COUNT ?? '24')
const PREFIX = process.env.BENCH_WS_PREFIX ?? 'bench-'
const REGION = process.env.BENCH_WS_REGION ?? ''
const ENABLED = process.env.BENCH_CREATE_WS === '1'

const dtest = ENABLED ? describe : describe.skip

dtest('create-bench-workspaces benchmark', () => {
  jest.setTimeout(30 * 60 * 1000)

  it(`create ${COUNT} workspaces and wait for active`, async () => {
    const config = await loadServerConfig('http://localhost:8083')

    // Account-level login (no workspace) — createWorkspace only needs an account token.
    const loginInfo = await getAccountClient(config.ACCOUNTS_URL).login('user1', '1234')
    if (loginInfo.token == null) {
      throw new Error('login failed for user1')
    }
    const accountClient = getAccountClient(config.ACCOUNTS_URL, loginInfo.token)

    // build set of target workspace names
    const targetNames: string[] = []
    for (let i = 0; i < COUNT; i++) {
      targetNames.push(`${PREFIX}${String(i + 1).padStart(2, '0')}`)
    }

    // check which already exist
    const existing = await accountClient.getUserWorkspaces()
    const existingNames = new Set(existing.map((ws) => ws.name))
    const alreadyExist = targetNames.filter((n) => existingNames.has(n))
    // eslint-disable-next-line no-console
    console.log(`already existing: ${alreadyExist.length}/${COUNT}`)

    // create missing ones sequentially
    const createStart = Date.now()
    const createdUuids = new Map<string, string>() // name -> uuid

    for (const name of targetNames) {
      if (existingNames.has(name)) continue
      const t0 = Date.now()
      const info = await accountClient.createWorkspace(name, REGION)
      const elapsed = Date.now() - t0
      createdUuids.set(name, info.workspace)
      // eslint-disable-next-line no-console
      console.log(`created ${name} uuid=${info.workspace} (+${elapsed}ms)`)
    }

    const totalCreateMs = Date.now() - createStart
    // eslint-disable-next-line no-console
    console.log(`total create-record time: ${totalCreateMs}ms for ${createdUuids.size} new workspaces`)

    // poll until all target workspaces are active
    const pollStart = Date.now()
    const maxPollMs = 25 * 60 * 1000
    let activeCount = 0

    while (true) {
      const all = await accountClient.getUserWorkspaces()
      const byName = new Map(all.map((ws) => [ws.name, ws]))

      activeCount = 0
      for (const name of targetNames) {
        const ws = byName.get(name)
        if (ws != null && isActiveMode(ws.mode)) activeCount++
      }

      const elapsed = Math.round((Date.now() - pollStart) / 1000)
      // eslint-disable-next-line no-console
      console.log(`active ${activeCount}/${COUNT} (elapsed ${elapsed}s)`)

      if (activeCount === COUNT) break
      if (Date.now() - pollStart > maxPollMs) break

      await new Promise((resolve) => setTimeout(resolve, 3000))
    }

    const totalWallMs = Date.now() - pollStart
    const avgInitMs = COUNT > 0 ? Math.round(totalWallMs / COUNT) : 0

    // collect any that never went active
    const finalAll = await accountClient.getUserWorkspaces()
    const finalByName = new Map(finalAll.map((ws) => [ws.name, ws]))
    const notActive = targetNames.filter((name) => {
      const ws = finalByName.get(name)
      return ws == null || !isActiveMode(ws.mode)
    })

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          totalWallMs,
          avgInitMsPerWorkspace: avgInitMs,
          activeCount,
          count: COUNT,
          notActive: notActive.map((name) => ({ name, mode: finalByName.get(name)?.mode ?? 'missing' }))
        },
        null,
        2
      )
    )

    expect(activeCount).toBe(COUNT)
  })
})
