/* eslint-env jest */
// Tests for ClisrServer.checkHello and CLisrClient.handleMsg
// Comments in tests are in English as per repository conventions.

import { ClisrServer, createWebsocketClientSocket as createConnectionSocket } from '../server'
import { ClisrClient } from '../connection'
import {
  type HelloRequest,
  type HelloResponse,
  type ConnectionSocket,
  type Session,
  ClientConnectEvent,
  ClientSocketReadyState,
  pingConst,
  FRAME_PING,
  FRAME_HELLO_RESP,
  FRAME_PACKED
} from '../types'
import { MeasureMetricsContext, type MeasureContext } from '@hcengineering/measurements'
import { Analytics } from '@hcengineering/analytics'
import { RPCHandler } from '@hcengineering/rpc'

describe('ClisrServer and ClisrClient consistency', () => {
  // Create a minimal fake MeasureContext to satisfy callers used in server / client.
  // We only implement the small subset used by the code under test.
  function createFakeCtx (): MeasureContext {
    // Use a real MeasureMetricsContext to exercise behavior closer to production.
    return new MeasureMetricsContext('clisr-test', {})
  }

  // Build a simple fake ConnectionSocket that captures sent messages and supports required interface.
  function createFakeCS (sent: any[] = []): ConnectionSocket {
    const cs: any = {
      id: 'cs-' + Math.random().toString(36).slice(2, 9),
      isClosed: false,
      close: () => {
        cs.isClosed = true
      },
      sendRaw: async (_ctx: MeasureContext, buf: Uint8Array | Buffer) => {
        sent.push({ raw: buf })
      },
      send: async (_ctx: MeasureContext, msg: any, binary: boolean, compression: boolean) => {
        // Capture outgoing message for assertions.
        sent.push({ msg, binary, compression })
      },
      sendPong: () => {},
      data: () => ({ remoteAddress: '127.0.0.1' }),
      readRequest: (_buffer: Buffer, _binary: boolean) => {
        throw new Error('not implemented')
      },
      isBackpressure: () => false,
      backpressure: async (_ctx: MeasureContext) => {},
      checkState: () => true
    }
    return cs as ConnectionSocket
  }

  it('checkHello sends useCompression and reconnect flags', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async (token: string) => token === 'good-token', '1.0.0')

    const sent: any[] = []
    const cs = createFakeCS(sent)

    const session: Session = {
      hello: undefined,
      createTime: Date.now(),
      sid: 'sid-1',
      sessionId: 'session-1',
      requests: new Map(),
      lastRequest: Date.now(),
      lastPing: Date.now(),
      socket: cs
    }

    const helloReq: HelloRequest = {
      method: 'hello',
      params: [],
      id: -1,
      token: 'good-token',
      sessionId: 'session-1'
    }

    await server.checkHello(session, helloReq, cs)

    expect(sent.length).toBe(1)
    // sent[0] contains raw framed data
    const raw = sent[0].raw as Buffer
    expect(raw[0]).toBe(FRAME_HELLO_RESP)
    const payload = raw.slice(1)
    const resp = server.rpcHandler.readResponse<any>(payload, true) as HelloResponse
    expect(resp.result).toBe('hello')
    expect(resp.reconnect).toBe(false)

    // Session object should be updated with hello and modes
    expect(session.hello).toBeDefined()
  })

  it('checkHello sets reconnect true when old session present in reconnectQueue', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async () => true, '1.0.0')

    const sent: any[] = []
    const cs = createFakeCS(sent)

    const oldSession: Session = {
      hello: undefined,
      createTime: Date.now(),
      sid: 'sid-old',
      sessionId: 'session-2',
      requests: new Map(),
      lastRequest: Date.now(),
      lastPing: Date.now(),
      socket: cs
    }
    server.reconnectQueue.set('session-2', oldSession)

    const newSession: Session = {
      hello: undefined,
      createTime: Date.now(),
      sid: 'sid-new',
      sessionId: 'session-2',
      requests: new Map(),
      lastRequest: Date.now(),
      lastPing: Date.now(),
      socket: cs
    }

    const helloReq: HelloRequest = {
      method: 'hello',
      params: [],
      id: -1,
      token: 'ok',
      sessionId: 'session-2'
    }

    await server.checkHello(newSession, helloReq, cs)

    expect(sent.length).toBe(1)
    const raw = sent[0].raw as Buffer
    expect(raw[0]).toBe(FRAME_HELLO_RESP)
    const payload = raw.slice(1)
    const resp = server.rpcHandler.readResponse<any>(payload, true) as HelloResponse
    expect(resp.reconnect).toBe(true)

    // reconnectQueue entry should be cleared and newSession should be initialized
    expect(server.reconnectQueue.has('session-2')).toBe(false)
    expect(newSession.hello).toBeDefined()
    expect(newSession.sessionId).toBe('session-2')
  })

  it('checkHello closes session when token validation fails', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async () => false, '1.0.0')

    const cs = createFakeCS()
    const session: Session = {
      hello: undefined,
      createTime: Date.now(),
      sid: 'sid-3',
      sessionId: 'session-3',
      requests: new Map(),
      lastRequest: Date.now(),
      lastPing: Date.now(),
      socket: cs
    }

    const helloReq: HelloRequest = {
      method: 'hello',
      params: [],
      id: -1,
      token: 'invalid',
      sessionId: 'session-3'
    }

    await server.checkHello(session, helloReq, cs)

    // On invalid token socket should be closed.
    expect(cs.isClosed).toBe(true)
  })

  it('CLisrClient.handleMsg processes hello response and calls onConnect', async () => {
    const ctx = createFakeCtx()

    // Provide a socketFactory that returns a minimal ClientSocket object to avoid real network usage.
    const fakeFactory = jest.fn((url: string) => {
      return {
        send: jest.fn(),
        close: jest.fn(),
        readyState: ClientSocketReadyState.CLOSED
      }
    })

    const onConnectSpy = jest.fn(async () => {})

    const client = new ClisrClient(
      ctx,
      'ws://localhost',
      (_data: any[]) => {},
      () => 'token',
      { socketFactory: fakeFactory, onConnect: onConnectSpy }
    )

    // Create a hello Response like the server would emit (binary/compression flags removed)
    const resp: HelloResponse = {
      id: -1,
      result: 'hello',
      serverVersion: '1.2.3',
      sessionId: 'client-session',
      reconnect: true
    }

    // Simulate receiving the hello response
    client.handleMsg(1, resp)

    // Client should mark hello as received
    expect((client as any).helloReceived).toBe(true)

    // Wait a tick for the async onConnect call to be invoked
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Verify onConnect was invoked with Reconnected event and some payload
    expect(onConnectSpy).toHaveBeenCalledWith(ClientConnectEvent.Reconnected, expect.anything())

    // Clean up timers and sockets created by the client
    await client.close()
  })

  it('sends request to a single connected session and returns response', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async () => true, '1.0.0')

    // Prepare a fake socket that records sent messages and simulates a client reply.
    const sent: any[] = []
    const cs = createFakeCS(sent)

    // Override send to immediately resolve server's pending request for the sent id.
    cs.send = async (_ctx: any, msg: any) => {
      sent.push(msg)
      const id = msg.id
      const rr = (server as any).requests.get(id)
      if (rr !== undefined) {
        rr.resolve({ answer: 'payload-from-client' })
        rr.onDone?.()
        ;(server as any).requests.delete(id)
      }
    }

    const session = {
      hello: undefined,
      createTime: Date.now(),
      sid: 'sid-req1',
      sessionId: 'session-req1',
      requests: new Map(),
      lastRequest: Date.now(),
      lastPing: Date.now(),
      socket: cs
    } as any

    ;(server as any).sessions.set(session.sid, session)

    const res = await server.request(ctx, 'call-me', ['payload'])
    expect(sent.length).toBe(1)
    expect(sent[0].result?.method).toBe('call-me')
    expect(res).toEqual({ answer: 'payload-from-client' })

    await server.close()
  })

  it('round-robins requests across available sessions', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async () => true, '1.0.0')

    try {
      const calls: string[] = []

      // Session 1
      const s1sent: any[] = []
      const s1 = createFakeCS(s1sent)
      s1.send = async (_ctx: any, msg: any) => {
        calls.push('s1')
        const id = msg.id
        const rr = (server as any).requests.get(id)
        if (rr !== undefined) {
          rr.resolve({ from: 's1' })
          rr.onDone?.()
          ;(server as any).requests.delete(id)
        }
      }

      const session1 = {
        hello: undefined,
        createTime: Date.now(),
        sid: 's1',
        sessionId: 'session-1',
        requests: new Map(),
        lastRequest: Date.now(),
        lastPing: Date.now(),
        socket: s1 as any
      } as any

      // Session 2
      const s2sent: any[] = []
      const s2 = createFakeCS(s2sent)
      s2.send = async (_ctx: any, msg: any) => {
        calls.push('s2')
        const id = msg.id
        const rr = (server as any).requests.get(id)
        if (rr !== undefined) {
          rr.resolve({ from: 's2' })
          rr.onDone?.()
          ;(server as any).requests.delete(id)
        }
      }

      const session2 = {
        hello: undefined,
        createTime: Date.now(),
        sid: 's2',
        sessionId: 'session-2',
        requests: new Map(),
        lastRequest: Date.now(),
        lastPing: Date.now(),
        socket: s2 as any
      } as any

      // Insert sessions in order so round-robin uses them alternately
      ;(server as any).sessions.set(session1.sid, session1)
      ;(server as any).sessions.set(session2.sid, session2)

      const r1 = await server.request(ctx, 'method-a', ['p1'])
      const r2 = await server.request(ctx, 'method-b', ['p2'])

      expect(r1).toEqual({ from: 's1' })
      expect(r2).toEqual({ from: 's2' })
      expect(calls).toEqual(['s1', 's2'])
    } finally {
      await server.close()
    }
  })

  it('handleTick moves timed-out sessions to reconnectQueue and invokes event handlers', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async () => true, '1.0.0')

    try {
      // Create a session that will be considered timed out
      const sent: any[] = []
      const cs = createFakeCS(sent)
      let closed = false
      cs.close = () => {
        closed = true
      }

      const session = {
        hello: {},
        createTime: Date.now() - 1000,
        sid: 'timeout-sid',
        sessionId: 'session-timeout',
        requests: new Map(),
        // Make lastRequest sufficiently old to trigger timeout.
        // Use a value larger than OperationTimeout so the session is considered timed out.
        lastRequest: Date.now() - 3000000,
        lastPing: Date.now(),
        socket: cs
      } as any

      const calls: Array<{ ev: string, id: string }> = []
      server.eventHandlers.push(async (sessionId, ev) => {
        calls.push({ ev, id: sessionId })
      })
      ;(server as any).sessions.set(session.sid, session)

      await server.handleTick()

      expect((server as any).sessions.has(session.sid)).toBe(false)
      // After timeout, session should be queued for reconnect and socket closed.
      expect(server.reconnectQueue.has(session.sid)).toBe(true)
      expect(closed).toBe(true)
      expect(calls).toContainEqual({ ev: 'timeout', id: 'session-timeout' })
    } finally {
      await server.close()
    }
  })

  it('checkHello handles event handler errors without throwing', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async () => true, '1.0.0')

    const sent: any[] = []
    const cs = createFakeCS(sent)

    const session: Session = {
      hello: undefined,
      createTime: Date.now(),
      sid: 'sid-eh',
      sessionId: 'session-eh',
      requests: new Map(),
      lastRequest: Date.now(),
      lastPing: Date.now(),
      socket: cs
    }

    let calledErr = false
    server.eventHandlers.push(async () => {
      throw new Error('boom')
    })
    jest.spyOn((server as any).ctx, 'error').mockImplementation(() => {
      calledErr = true
    })

    const helloReq: HelloRequest = {
      method: 'hello',
      params: [],
      id: -1,
      token: 'ok',
      sessionId: 'session-eh'
    }

    await server.checkHello(session, helloReq, cs)
    expect(calledErr).toBe(true)
  })

  it('processes ping messages and calls registered handlers', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async () => true, '1.0.0')

    // Fake ws that stores event listeners
    const listeners: Record<string, Array<(...args: any[]) => void>> = {}
    const ws: any = {
      bufferedAmount: 0,
      readyState: 1,
      OPEN: 1,
      CLOSED: 2,
      CLOSING: 3,
      send: jest.fn((_buf: any, _opts: any, cb: any) => cb?.()),
      close: jest.fn(),
      terminate: jest.fn(),
      on: (name: string, fn: (...args: any[]) => void) => {
        ;(listeners[name] ??= []).push(fn)
      }
    }

    await server.handleConnection(ws, { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as any)

    // Retrieve session and mark it as hello'ed so ping is treated as normal request
    const sess = Array.from((server as any).sessions.values())[0] as any
    sess.hello = {}

    // Register a handler that captures ping messages
    const pings: any[] = []
    server.handlers.push(async (req, send) => {
      if (req.method === pingConst) pings.push(req)
    })

    // craft a raw ping frame payload
    const payload = Buffer.from([FRAME_PING])
    // call the registered 'message' listeners
    for (const fn of listeners.message ?? []) {
      const maybe = fn(payload) as unknown
      if (maybe != null) {
        const maybePromise = Promise.resolve(maybe)
        await maybePromise
      }
    }

    // Wait a tick for async handlers to run
    await new Promise((resolve) => setImmediate(resolve))
    expect(pings.length).toBeGreaterThan(0)
  })

  it('send waits for backpressure then sends binary data', async () => {
    const ctx = createFakeCtx()
    const server = new ClisrServer(ctx, async () => true, '1.0.0')

    // Fake ws that simulates backpressure first, then clears it
    const ws: any = {
      bufferedAmount: 999999,
      readyState: 1,
      OPEN: 1,
      CLOSED: 2,
      CLOSING: 3,
      send: jest.fn((_buf: any, _opts: any, cb: any) => cb?.()),
      close: jest.fn(),
      terminate: jest.fn(),
      // Minimal event registration support required by handleConnection
      on: (_name: string, _fn: (...args: any[]) => void) => {}
    }

    await server.handleConnection(ws, { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as any)

    const sess = Array.from((server as any).sessions.values())[0] as any
    sess.hello = {}

    // schedule clearing of backpressure on next tick
    setImmediate(() => {
      ws.bufferedAmount = 0
    })

    const msg = { id: 'test-id', result: { method: 'x', params: [], meta: {} }, time: Date.now() }
    await sess.socket.send((server as any).ctx, msg)
    // send should have been called with binary true
    expect(ws.send).toHaveBeenCalled()
    const opts = (ws.send as jest.Mock).mock.calls[0][1]
    expect(opts.binary).toBe(true)
  })

  it('ConnectionSocket.send logs and reports errors via Analytics.handleError when send callback reports error', async () => {
    const ctx = createFakeCtx()
    const rpc = new RPCHandler()
    const ws: any = {
      bufferedAmount: 0,
      readyState: 1,
      OPEN: 1,
      CLOSED: 2,
      CLOSING: 3,
      send: (_buf: any, _opts: any, cb: any) => {
        cb(new Error('unexpected failure'))
      },
      close: jest.fn(),
      terminate: jest.fn()
    }
    const compressSpy = jest.fn().mockResolvedValue(Buffer.from('x'))
    const cs = createConnectionSocket(ws, { remoteAddress: '127.0.0.1', userAgent: '', language: '' }, rpc, {
      compress: compressSpy
    })
    const errSpy = jest.spyOn(ctx as any, 'error')
    const analyticsSpy = jest.spyOn(Analytics, 'handleError').mockImplementation(() => {})
    const msg: any = { id: 'e1', result: { method: 'x', params: [], meta: {} }, time: Date.now() }
    await cs.send(ctx, msg)
    expect(errSpy).toHaveBeenCalled()
    expect(analyticsSpy).toHaveBeenCalled()
    compressSpy.mockReset()
    analyticsSpy.mockRestore()
  })

  it('ConnectionSocket.send ignores "WebSocket is not open" errors and does not report them', async () => {
    const ctx = createFakeCtx()
    const rpc = new RPCHandler()
    const ws: any = {
      bufferedAmount: 0,
      readyState: 1,
      OPEN: 1,
      CLOSED: 2,
      CLOSING: 3,
      send: (_buf: any, _opts: any, cb: any) => {
        cb(new Error('WebSocket is not open'))
      },
      close: jest.fn(),
      terminate: jest.fn()
    }
    const compressSpy = jest.fn().mockResolvedValue(Buffer.from('x'))
    const cs = createConnectionSocket(ws, { remoteAddress: '127.0.0.1', userAgent: '', language: '' }, rpc, {
      compress: compressSpy
    })
    const errSpy = jest.spyOn(ctx as any, 'error')
    const analyticsSpy = jest.spyOn(Analytics, 'handleError').mockImplementation(() => {})
    const id = 'e3'
    const result = { method: 'x', params: [], meta: {} }
    const time = Date.now()
    await cs.send(ctx, { id, result, time })
    expect(errSpy).not.toHaveBeenCalled()
    expect(analyticsSpy).not.toHaveBeenCalled()
    compressSpy.mockReset()
    analyticsSpy.mockRestore()
  })

  it('ConnectionSocket.checkState terminates socket when CLOSED or CLOSING and returns false', () => {
    const rpc = new RPCHandler()
    const ws: any = { readyState: 3, CLOSED: 3, CLOSING: 2, terminate: jest.fn() }
    const cs = createConnectionSocket(ws, { remoteAddress: '127.0.0.1', userAgent: '', language: '' }, rpc)
    expect(cs.checkState()).toBe(false)
    expect(ws.terminate).toHaveBeenCalled()
  })

  it('readRequest recognizes ping buffers and returns ping request', () => {
    const rpc = new RPCHandler()
    const ws: any = {
      bufferedAmount: 0,
      readyState: 1,
      OPEN: 1,
      CLOSED: 2,
      CLOSING: 3,
      send: jest.fn(),
      close: jest.fn(),
      terminate: jest.fn()
    }
    const cs = createConnectionSocket(ws, { remoteAddress: '127.0.0.1', userAgent: '', language: '' }, rpc)

    const rr = cs.readRequest(Buffer.from([FRAME_PING]), false)
    expect(rr.method).toBe(pingConst)
    expect(rr.id).toBe(-1)
  })

  it('ConnectionSocket.sendPong returns early when socket is not OPEN or when connection is closed', () => {
    const rpc = new RPCHandler()
    const ws: any = { readyState: 3, send: jest.fn(), OPEN: 1, CLOSED: 3, CLOSING: 2 }
    const cs = createConnectionSocket(ws, { remoteAddress: '127.0.0.1', userAgent: '', language: '' }, rpc)
    // If not open, sendPong should silently return
    cs.sendPong()
    expect(ws.send).not.toHaveBeenCalled()
  })
})
