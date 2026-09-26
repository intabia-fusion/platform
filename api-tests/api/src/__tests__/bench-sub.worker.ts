//
// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

// Subscriber worker for the broadcast benchmark.
// Each worker connects with its own websocket, registers a LiveQuery on
// chunter.class.Channel, and reports first-seen ids back to the parent.
// When `slow` is true the callback busy-spins for `slowDelayMs` so the
// server-side ws.bufferedAmount keeps growing while messages queue up -
// that's how we trigger the slow-client drop path.

import { connect } from '@hcengineering/api-client'
import chunter from '@hcengineering/chunter'
import { parentPort, workerData } from 'worker_threads'

interface SubMessage {
  type: 'ready' | 'tx' | 'snapshot-result' | 'error' | 'done'
  ids?: string[]
  count?: number
  err?: string
}

interface Cmd {
  type: 'snapshot' | 'close'
  sentIds?: string[]
}

const { url, ws, slow, slowDelayMs } = workerData as {
  url: string
  ws: string
  slow: boolean
  slowDelayMs: number
}

async function run (): Promise<void> {
  const c = await connect(url, { email: 'user1', password: '1234', workspace: ws })
  const seen = new Set<string>()
  const lq = c.createLiveQuery()
  await new Promise<void>((resolve) => {
    let first = true
    lq.query(chunter.class.Channel, {}, (res) => {
      if (first) {
        first = false
        resolve()
        return
      }
      if (slow && slowDelayMs > 0) {
        const until = Date.now() + slowDelayMs
        // Busy-spin to actually block the worker's event loop -
        // setTimeout would still drain the websocket via libuv.
        // eslint-disable-next-line no-empty
        while (Date.now() < until) {
          /* spin */
        }
      }
      const fresh: string[] = []
      for (const ch of res) {
        if (!seen.has(ch._id)) {
          seen.add(ch._id)
          fresh.push(ch._id)
        }
      }
      if (fresh.length > 0) {
        parentPort?.postMessage({ type: 'tx', ids: fresh, count: fresh.length } satisfies SubMessage)
      }
    })
  })
  parentPort?.postMessage({ type: 'ready' } satisfies SubMessage)

  parentPort?.on('message', (cmd: Cmd) => {
    if (cmd.type === 'snapshot') {
      const ids = cmd.sentIds ?? []
      void c
        .findAll(chunter.class.Channel, { _id: { $in: ids } as any })
        .then((all) => {
          const got = new Set(all.map((d: any) => d._id))
          let missing = 0
          for (const id of ids) if (!got.has(id)) missing++
          parentPort?.postMessage({ type: 'snapshot-result', count: missing } satisfies SubMessage)
        })
        .catch((err) => {
          parentPort?.postMessage({ type: 'error', err: String(err?.message ?? err) } satisfies SubMessage)
        })
    } else if (cmd.type === 'close') {
      void c.close?.().finally(() => {
        parentPort?.postMessage({ type: 'done' } satisfies SubMessage)
        process.exit(0)
      })
    }
  })
}

run().catch((err) => {
  parentPort?.postMessage({ type: 'error', err: String(err?.message ?? err) } satisfies SubMessage)
  process.exit(1)
})
