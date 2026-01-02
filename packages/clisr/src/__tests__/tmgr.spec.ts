/* eslint-env jest */
// Tests for task manager scenario: server dispatches tasks to clients, clients execute,
// handle reconnection and response delivery within timeout.

import WebSocket from 'ws'
import { ClisrServer } from '../server'
import { ClisrClient } from '../client'
import { MeasureMetricsContext } from '@hcengineering/measurements'

jest.setTimeout(20000)

describe('TMGR server-client task delivery with reconnects', () => {
  it('accepts client response after reconnect if it arrives within timeout', async () => {
    const ctx = new MeasureMetricsContext('tmgr-test', {})
    const server = new ClisrServer(ctx, async (token: string) => token === 'token-ok', '1.0.0')

    await server.start(ctx, 0)
    const addr = server.httpServer?.address() as any
    const port = addr?.port ?? 0

    // Create a socketFactory similar to integration tests which buffers events
    let wrapperReal: WebSocket | undefined
    const socketFactory = (url: string): any => {
      const real = new WebSocket(url)
      wrapperReal = real

      let openEmitted = false
      let openHandler: any = null

      const msgQueue: any[] = []
      let msgHandler: any = null

      const wrapper: any = {
        send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
          real.send(data as any)
        },
        close: (code?: number) => {
          try {
            real.close(code)
          } catch (_err) {}
        },
        onclose: null,
        onerror: null,
        get readyState () {
          return real.readyState
        },
        bufferedAmount: 0
      }

      Object.defineProperty(wrapper, 'onopen', {
        get () {
          return openHandler
        },
        set (fn: any) {
          openHandler = fn
          if (openEmitted && typeof openHandler === 'function') openHandler({} as any)
        }
      })

      Object.defineProperty(wrapper, 'onmessage', {
        get () {
          return msgHandler
        },
        set (fn: any) {
          msgHandler = fn
          if (msgQueue.length > 0 && typeof msgHandler === 'function') {
            for (const m of msgQueue) msgHandler(m)
            msgQueue.length = 0
          }
        }
      })

      real.on('open', () => {
        if (typeof openHandler === 'function') openHandler({} as any)
        else openEmitted = true
      })
      real.on('message', (data) => {
        const m = { data } as any
        if (typeof msgHandler === 'function') msgHandler(m)
        else msgQueue.push(m)
      })

      real.on('close', () => {
        wrapper.onclose?.()
      })
      real.on('error', (err) => wrapper.onerror?.(err))

      return wrapper
    }

    // Create client that defers send until test triggers it
    let resolveExec!: (v?: any) => void
    const execPromise = new Promise<any>((resolve) => {
      resolveExec = resolve
    })
    let callbackInvoked = false

    let onConnectResolve!: () => void
    const onConnectP = new Promise<void>((resolve) => {
      onConnectResolve = resolve
    })

    const client = new ClisrClient(
      ctx,
      `ws://127.0.0.1:${port}`,
      () => {},
      () => 'token-ok',
      {
        socketFactory,
        onConnect: async () => {
          onConnectResolve()
        }
      }
    )
    client.callbackHandler = async (_method, args, send) => {
      callbackInvoked = true
      const result = await execPromise
      await send(result)
    }

    await onConnectP

    // Ensure server has recorded the session and hello completed
    expect((server as any).sessions.size).toBeGreaterThan(0)
    const sess = Array.from((server as any).sessions.values())[0] as any
    expect(sess.hello).toBeDefined()

    // Issue a request from server -> client
    const serverReqP = server.request(ctx, 'do-task', ['payload'])

    // Wait until client callback has been invoked and is waiting on execPromise
    async function waitFor (cond: () => boolean, timeout = 1000): Promise<void> {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        if (cond()) return
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      throw new Error('timed out waiting for condition')
    }
    await waitFor(() => callbackInvoked, 1000)
    expect(callbackInvoked).toBe(true)

    // Simulate network drop before client sends result
    wrapperReal?.close()

    // Force client to reopen immediately
    client.scheduleOpen(ctx, true)

    // Wait for client reconnect
    const reconnectP = new Promise<void>((resolve) => {
      const prev = client.onConnect
      client.onConnect = async (event, _session) => {
        resolve()
        if (prev != null) await prev(event, _session)
      }
    })
    await reconnectP

    // Now resolve executor (client finishes work and calls send)
    resolveExec({ answer: 'ok' })

    const res = await serverReqP
    expect(res).toEqual({ answer: 'ok' })

    await client.close()
    await server.close()
  })
})
