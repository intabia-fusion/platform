/* eslint-env jest */
// Integration tests: real WebSocket connections
//
// These tests start a real `ClisrServer` listening on an ephemeral port and
// create a real `ws` client wrapped into a Browser-like `ClientSocket` so
// `CLisrClient` can use it without fakes.

import WebSocket from 'ws'
import { ClisrServer } from '../server'
import { ClisrClient } from '../client'
import { MeasureMetricsContext } from '@hcengineering/measurements'
import type { ClientSocketFactory } from '../types'

// Increase timeout for flaky network/integration scenarios
jest.setTimeout(30000)

describe('integration: real WebSocket connections', () => {
  it('performs handshake and RPC end-to-end', async () => {
    const ctx = new MeasureMetricsContext('clisr-integration', {})
    const server = new ClisrServer(ctx, async (token: string) => token === 'token-ok', '1.0.0')

    await server.start(ctx, 0)
    const addr = server.httpServer?.address() as any
    const port = addr?.port ?? 0
    console.info('integration: server started', { port })

    // Register a simple echo handler on server side
    let gotOp: any = null
    server.handlers.push(async (op: any, respond: (data: any) => Promise<void>) => {
      gotOp = op
      await respond({ echo: op.params[0] })
    })

    // Promise that resolves when client onConnect is invoked
    let onConnectResolve!: () => void
    const onConnectP = new Promise<void>((resolve) => {
      onConnectResolve = resolve
    })
    const onConnect = async (_event: any, _session: any): Promise<void> => {
      console.info('integration: client onConnect invoked', { session: _session })
      onConnectResolve()
    }

    // socketFactory: wraps node ws into a Browser-like socket with
    // assignable `onopen/onmessage/onclose/onerror` properties.
    // This implementation buffers `open` and `message` events in case they
    // happen before client assigns corresponding handlers on the wrapper.
    const socketFactory: ClientSocketFactory = (url: string) => {
      const real = new WebSocket(url)

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
          } catch (_err) {
            // ignore
          }
        },
        onclose: null as any,
        onerror: null as any,
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
          if (openEmitted && typeof openHandler === 'function') {
            openHandler({} as any)
          }
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

      real.on('close', (code, reason) => {
        wrapper.onclose?.(code, reason)
      })

      real.on('error', (err) => {
        wrapper.onerror?.(err)
      })

      return wrapper
    }

    let client: ClisrClient | undefined
    try {
      console.info('integration: creating client', { url: `ws://127.0.0.1:${port}` })
      client = new ClisrClient(
        ctx,
        `ws://127.0.0.1:${port}`,
        () => {},
        () => 'token-ok',
        {
          socketFactory,
          onConnect
        }
      )

      // Wait for handshake to finish
      await onConnectP
      console.info('integration: handshake finished')

      // Send a real RPC request over WebSocket and get a real response
      console.info('integration: sending echo request from client -> server')
      const result = await (client as any).sendRequest({ method: 'echo', params: ['hello'] })
      console.info('integration: client received echo result', { result })
      expect(result).toEqual({ echo: 'hello' })
      expect(gotOp).not.toBeNull()
      expect(gotOp.method).toBe('echo')

      // Now test server -> client request
      let gotServerOp: any = null
      ;(client as any).operationHandler = async (
        method: string,
        params: any[],
        send: (response: any) => Promise<void>
      ) => {
        console.info('integration: client.operationHandler invoked', { method, params })
        gotServerOp = { method, params }
        await send({ answer: params[0] + '-from-client' })
      }

      console.info('integration: calling server.request to invoke client operation')
      const callRes = await server.request(ctx, 'call-me', ['payload'])
      console.info('integration: server.request returned', { callRes })
      expect(callRes).toEqual({ answer: 'payload-from-client' })
      expect(gotServerOp).not.toBeNull()
      expect(gotServerOp.method).toBe('call-me')
      expect(gotServerOp.params).toEqual(['payload'])
    } finally {
      console.info('integration: test cleanup - closing client/server')
      // Best-effort cleanup to avoid leaking handles between tests
      if (client !== undefined) {
        try {
          await client.close()
        } catch (_err) {
          // ignore close errors
        }
      }
      try {
        await server.close()
      } catch (_err) {
        // ignore close errors
      }
    }
  })
})
