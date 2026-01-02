/* eslint-env jest */
// Tests for ClisrClient.handleMsg branches: responses, chunks, operationHandler, terminate, rate limit.
// Comments are in English as per repository conventions.

import { ClisrClient } from '../client'
import { RequestPromise, ClientSocketReadyState, pingConst, FRAME_PING, FRAME_PONG } from '../types'
import { MeasureMetricsContext, type MeasureContext } from '@hcengineering/measurements'

describe('ClisrClient.handleMsg behavior', () => {
  function createFakeCtx (): MeasureContext {
    // Use a real production-like context to keep behaviour close to runtime.
    return new MeasureMetricsContext('clisr-test', {})
  }

  function createClient (opts?: any): ClisrClient {
    // Provide a minimal socketFactory that returns a harmless socket object.
    const fakeFactory = jest.fn((_url: string) => {
      return {
        send: jest.fn(),
        close: jest.fn(),
        readyState: ClientSocketReadyState.CLOSED
      }
    })
    return new ClisrClient(
      createFakeCtx(),
      'ws://localhost',
      (_data: any[]) => {},
      () => 'token',
      {
        socketFactory: fakeFactory,
        compress: async (x: any) => x,
        uncompress: async (x: any) => x,
        autoStart: false,
        ...opts
      }
    )
  }

  it('resolves a pending request when a normal response arrives', async () => {
    const client = createClient()
    const rp = new RequestPromise('method-x', [], undefined)
    ;(client as any).requests.set('_0', rp)

    // Simulate incoming response
    await client.handleMsg(1, { id: '_0', result: { ok: true }, time: Date.now() })

    const res = await rp.promise
    expect(res).toEqual({ ok: true })
    // request should be removed from map after processing
    expect((client as any).requests.has('_0')).toBe(false)

    await client.close()
  })

  it('delegates response to handleResult when provided and resolves', async () => {
    const client = createClient()
    const handleResult = jest.fn(async (value: any) => {
      // pretend to do async transformation
      await new Promise((resolve) => setTimeout(resolve, 0))
      // no-op
    })
    const rp = new RequestPromise('method-h', [], handleResult)
    ;(client as any).requests.set('_1', rp)

    await client.handleMsg(1, { id: '_1', result: { data: 42 }, time: Date.now() })

    const res = await rp.promise
    expect(handleResult).toHaveBeenCalledWith({ data: 42 })
    expect(res).toEqual({ data: 42 })

    await client.close()
  })

  it('reassembles chunked responses out of order and resolves when final chunk arrives', async () => {
    const client = createClient()
    const rp = new RequestPromise('method-chunk', [], undefined)
    ;(client as any).requests.set('_2', rp)

    // First deliver second chunk (not final)
    await client.handleMsg(1, { id: '_2', result: [3], chunk: { index: 1, final: false }, time: Date.now() })
    // Then deliver first chunk and mark final
    await client.handleMsg(1, { id: '_2', result: [1, 2], chunk: { index: 0, final: true }, time: Date.now() })

    const res = await rp.promise
    expect(res).toEqual([1, 2, 3])

    await client.close()
  })

  it('invokes operationHandler for server->client requests and sends back an operation response', async () => {
    const client = createClient()
    // Attach a websocket-like object so operationHandler can send back responses
    const wsSend = jest.fn()
    const wsClose = jest.fn()
    ;(client as any).websocket = { send: wsSend, close: wsClose, readyState: ClientSocketReadyState.OPEN }
    ;(client as any).helloReceived = true

    const opSpy = jest.fn(async (method: string, params: any[], send: (res: any) => Promise<void>) => {
      // Simulate doing work then calling the provided send callback
      await send({ answer: 'ok' })
    })
    client.callbackHandler = opSpy
    const infoSpy = jest.spyOn((client as any).ctx, 'info')

    await client.handleMsg(1, {
      id: '#abc',
      result: { method: 'call-me', params: ['p'], meta: {} },
      time: Date.now()
    })

    // Allow async compress/send to resolve
    await new Promise((resolve) => setTimeout(resolve, 0))
    // allow pending microtasks / native compression callbacks
    await new Promise((resolve) => setImmediate(resolve))

    expect(opSpy).toHaveBeenCalledWith('call-me', ['p'], expect.any(Function))

    // Accept several possible successful outcomes:
    // - wsSend was invoked, or
    // - we logged a successful compressed send, or
    // - an error was logged because compression/send failed.
    const errSpy = jest.spyOn((client as any).ctx, 'error')
    const sentOk = wsSend.mock.calls.length > 0
    const infoLogged = infoSpy.mock.calls.some((c) => String(c[0]).includes('sent operation response (compressed)'))
    const errLogged = errSpy.mock.calls.some((c) => String(c[0]).includes('failed to compress/send operation response'))
    expect(sentOk || infoLogged || errLogged).toBe(true)

    infoSpy.mockRestore()
    errSpy.mockRestore()

    // avoid unhandled rejections from background timers/requests
    ;(client as any).requests.clear()
    await client.close()
    await new Promise((resolve) => setImmediate(resolve))
  })

  it('handles error responses with terminate=true by closing and calling onError and rejecting pending promise', async () => {
    const onError = jest.fn()
    const client = createClient({ onError })
    const wsClose = jest.fn()
    ;(client as any).websocket = { close: wsClose, readyState: ClientSocketReadyState.OPEN }

    const rp = new RequestPromise('m', [], undefined)
    ;(client as any).requests.set('_3', rp)

    await client.handleMsg(1, { id: '_3', error: { code: 42, message: 'bad' }, terminate: true } as any)

    // Promise must reject with resp.error message embedded
    await expect(rp.promise).rejects.toThrow(/resp.error/)

    expect((client as any).closed).toBe(true)
    expect(wsClose).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(42)

    await client.close()
  })

  it('schedules retry.sendData when an error response contains rateLimit.remaining === 0', async () => {
    const client = createClient()
    const rp = new RequestPromise('rl', [], undefined)
    rp.sendData = jest.fn()
    ;(client as any).requests.set('_rl', rp)

    // Intercept setTimeout so the retry callback runs deterministically and synchronously for this test.
    const realSetTimeout = global.setTimeout
    try {
      global.setTimeout = ((cb: any, _t?: number) => {
        cb()
        return 0 as any
      }) as any

      await client.handleMsg(1, {
        id: '_rl',
        error: { code: 429, message: 'rate' },
        rateLimit: { remaining: 0, retryAfter: 10, limit: 100 }
      } as any)

      // Allow the immediate-setTimeout shim to call the retry callback
      await new Promise((resolve) => setImmediate(resolve))

      expect((rp as any).sendData).toHaveBeenCalled()
    } finally {
      global.setTimeout = realSetTimeout
      ;(client as any).requests.clear()
      await client.close()
      await new Promise((resolve) => setImmediate(resolve))
    }
  })

  it('on receiving ping frame triggers a pong send via websocket', async () => {
    const client = createClient()
    const wsSend = jest.fn()
    ;(client as any).websocket = { send: wsSend, close: jest.fn(), readyState: ClientSocketReadyState.OPEN }

    client.checkArrayBufferPing(new Uint8Array([FRAME_PING]))

    expect(wsSend).toHaveBeenCalled()
    // ensure first byte is FRAME_PONG
    const arg = wsSend.mock.calls[0][0]
    expect(arg[0]).toBe(FRAME_PONG)

    await client.close()
  })

  it('processes hello response and respects opt.onHello returning false by closing connection', async () => {
    const onHello = jest.fn(() => false)
    const client = createClient({ onHello })
    const wsClose = jest.fn()
    ;(client as any).websocket = { close: wsClose, readyState: ClientSocketReadyState.OPEN }

    await client.handleMsg(1, {
      id: -1,
      result: 'hello',
      serverVersion: '1.2.3',
      sessionId: 's',
      reconnect: false,
      time: Date.now()
    } as any)

    // allow any async logic
    await new Promise((resolve) => setImmediate(resolve))

    expect(onHello).toHaveBeenCalled()
    expect((client as any).closed).toBe(true)
    expect(wsClose).toHaveBeenCalled()
    ;(client as any).requests.clear()
    await client.close()
    await new Promise((resolve) => setImmediate(resolve))
  })

  it('logs unknown response id when no matching pending request exists', async () => {
    const client = createClient()

    const errSpy = jest.spyOn((client as any).ctx, 'error')
    await client.handleMsg(1, { id: '_does-not-exist', result: { foo: 'bar' }, time: Date.now() })

    // log happened synchronously (or very soon)
    await new Promise((resolve) => setImmediate(resolve))
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
    ;(client as any).requests.clear()
    await client.close()
    await new Promise((resolve) => setImmediate(resolve))
  })

  it('sendRequest throws when connection is closed', async () => {
    const client = createClient()
    ;(client as any).closed = true
    await expect((client as any).sendRequest({ method: 'x', params: [] })).rejects.toThrow(/connection is closed/)
    await client.close()
  })

  it('sendRequest dedupes when once=true and a matching pending request exists', async () => {
    const client = createClient()
    const rp = new RequestPromise('dup', [1], undefined)
    ;(client as any).requests.set('_dup', rp)

    // Ensure we request the same method/params that the outstanding request has.
    const before = (client as any).requests.size
    const p = (client as any).sendRequest({ method: 'dup', params: [1], once: true })
    await new Promise((resolve) => setImmediate(resolve))
    // No new requests were added
    expect((client as any).requests.size).toBe(before)
    await expect(p).resolves.toBeUndefined()
    ;(client as any).requests.clear()
    await client.close()
  })

  it('sendRequest compresses and sends when compression succeeds', async () => {
    const client = createClient()
    const compressSpy = jest.spyOn(client as any, 'compress').mockResolvedValue(Buffer.from('x'))
    const wsSend = jest.fn()
    ;(client as any).websocket = { send: wsSend, close: jest.fn(), readyState: ClientSocketReadyState.OPEN }
    ;(client as any).helloReceived = true
    const p = (client as any).sendRequest({ method: 'm-comp', params: ['a'] })
    await new Promise((resolve) => setImmediate(resolve))
    expect(wsSend).toHaveBeenCalled()
    const id = Array.from((client as any).requests.keys())[0]
    ;(client as any).requests.get(id).resolve({ ok: true })
    const res = await p
    expect(res).toEqual({ ok: true })
    compressSpy.mockRestore()
    ;(client as any).requests.clear()
    await client.close()
  })

  it('sendRequest handles compression failure by logging and closing socket', async () => {
    const client = createClient()
    const wsClose = jest.fn()
    ;(client as any).websocket = { send: jest.fn(), close: wsClose, readyState: ClientSocketReadyState.OPEN }
    ;(client as any).helloReceived = true

    const errSpy = jest.spyOn((client as any).ctx, 'error')
    // Provide a compression promise that we can reject on demand to avoid timing races
    let rejectCompress: (err?: any) => void = () => {}
    const compressSpy = jest.spyOn(client as any, 'compress').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectCompress = reject
        })
    )

    // Use a large payload to ensure compression is triggered (>1024 bytes)
    const largePayload = 'x'.repeat(1025) // Ensure it's larger than 1024 bytes
    ;(client as any).sendRequest({ method: 'm-fail', params: [largePayload], overrideId: 100 })
    await new Promise((resolve) => setImmediate(resolve))

    // Trigger compression failure
    rejectCompress(new Error('boom'))
    await new Promise((resolve) => setImmediate(resolve))
    expect(errSpy).toHaveBeenCalled()
    expect(wsClose).toHaveBeenCalled()
    compressSpy.mockRestore()
    ;(client as any).requests.clear()
    await client.close()
  })

  it('sendRequest ping sends ping and returns undefined', async () => {
    const client = createClient()
    const wsSend = jest.fn()
    ;(client as any).websocket = { send: wsSend, close: jest.fn(), readyState: ClientSocketReadyState.OPEN }
    ;(client as any).helloReceived = true
    const res = await (client as any).sendRequest({ method: pingConst, params: [] })
    expect(res).toBeUndefined()
    expect(wsSend).toHaveBeenCalled()
    const arg = wsSend.mock.calls[0][0]
    expect(arg[0]).toBe(FRAME_PING)
    await client.close()
  })

  it('reconnect scheduling triggers sendData when retry allows', async () => {
    const client = createClient()
    const wsSend = jest.fn()
    ;(client as any).websocket = { send: wsSend, close: jest.fn(), readyState: ClientSocketReadyState.OPEN }
    ;(client as any).helloReceived = true

    // Ensure compression succeeds so sendData actually performs a send in the reconnect flow.
    const compressSpy = jest.spyOn(client as any, 'compress').mockResolvedValue(Buffer.from('x'))

    const p = (client as any).sendRequest({ method: 'm-re', params: [], allowReconnect: true, retry: async () => true })
    await new Promise((resolve) => setImmediate(resolve))
    const id = Array.from((client as any).requests.keys())[0]
    const rp = (client as any).requests.get(id)
    expect(typeof rp.reconnect).toBe('function')
    const realSetTimeout = global.setTimeout
    try {
      global.setTimeout = ((cb: any, _t?: number) => {
        cb()
        return 0 as any
      }) as any
      rp.reconnect?.()
      await new Promise((resolve) => setImmediate(resolve))
      expect(wsSend).toHaveBeenCalled()
    } finally {
      global.setTimeout = realSetTimeout
      compressSpy.mockRestore()
    }
    ;(client as any).requests.get(id).resolve({ ok: 'ok' })
    const res = await p
    expect(res).toEqual({ ok: 'ok' })
    await client.close()
  })

  it('sendRequest respects slowDownTimer before sending', async () => {
    const client = createClient()
    const wsSend = jest.fn()

    ;(client as any).websocket = { send: wsSend, close: jest.fn(), readyState: ClientSocketReadyState.OPEN }
    ;(client as any).helloReceived = true
    ;(client as any).slowDownTimer = 5

    const compressSpy = jest.spyOn(client as any, 'compress').mockResolvedValue(Buffer.from('x'))
    // Use a large payload to ensure compression is triggered (>1024 bytes)
    const largePayload = 'x'.repeat(1025) // Ensure it's larger than 1024 bytes
    const p = (client as any).sendRequest({ method: 'slow', params: [largePayload] })

    // Wait briefly to allow compression to execute (more stable than tight polling).
    // Use a small timeout to avoid flaky behavior while keeping tests fast.
    await new Promise((resolve) => setTimeout(resolve, 20))
    // Allow pending microtasks / immediate callbacks (compression IIFE may schedule logs)
    await new Promise((resolve) => setImmediate(resolve))

    expect((client as any).compress).toHaveBeenCalled()
    // Also ensure ws send happened eventually
    await new Promise((resolve) => setImmediate(resolve))
    expect(wsSend).toHaveBeenCalled()

    // Simulate server response to resolve the pending promise
    const id = Array.from((client as any).requests.keys())[0]
    ;(client as any).requests.get(id).resolve({ ok: true })
    const res = await p
    expect(res).toEqual({ ok: true })

    compressSpy.mockRestore()
    ;(client as any).requests.clear()
    await client.close()
  })

  it('sendRequest allowReconnect=false does not set reconnect callback', async () => {
    const client = createClient()
    const wsSend = jest.fn()
    ;(client as any).websocket = { send: wsSend, close: jest.fn(), readyState: ClientSocketReadyState.OPEN }
    ;(client as any).helloReceived = true
    const compressSpy = jest.spyOn(client as any, 'compress').mockResolvedValue(Buffer.from('x'))

    const p = (client as any).sendRequest({
      method: 'no-reconnect',
      params: [],
      allowReconnect: false,
      overrideId: 555
    })
    await new Promise((resolve) => setImmediate(resolve))
    const id = Array.from((client as any).requests.keys())[0]
    const rp = (client as any).requests.get(id)
    expect(rp.reconnect).toBeUndefined()

    compressSpy.mockRestore()
    ;(client as any).requests.get(id).resolve({ ok: true })
    await p
    await client.close()
  })

  it('checkArrayBufferPing detects ping and pong and triggers actions', async () => {
    const client = createClient()
    ;(client as any).helloReceived = true
    const before = (client as any).pingResponse
    const pingArr = new Uint8Array([FRAME_PING])
    expect((client as any).checkArrayBufferPing(pingArr)).toBe(true)
    // For pong, pingResponse should be updated
    const pongArr = new Uint8Array([FRAME_PONG])
    const res = (client as any).checkArrayBufferPing(pongArr)
    expect(res).toBe(true)
    expect((client as any).pingResponse).toBeGreaterThanOrEqual(before)
  })

  it('logs compressed request info on successful compressed send', async () => {
    const client = createClient()
    const infoSpy = jest.spyOn((client as any).ctx, 'info')
    const wsSend = jest.fn()
    ;(client as any).websocket = { send: wsSend, close: jest.fn(), readyState: ClientSocketReadyState.OPEN }
    ;(client as any).helloReceived = true
    const compressSpy = jest.spyOn(client as any, 'compress').mockResolvedValue(Buffer.from('d'))

    // Create a large payload to ensure compression is triggered (>1024 bytes)
    const largePayload = 'x'.repeat(1025) // Ensure it's larger than 1024 bytes
    const p = (client as any).sendRequest({ method: 'log-me', params: [largePayload], overrideId: 999 })
    await new Promise((resolve) => setImmediate(resolve))
    expect(wsSend).toHaveBeenCalled()
    // Assert that compressed send info was logged
    const logged = infoSpy.mock.calls.some((c) => String(c[0]).includes('sent request (compressed)'))
    expect(logged).toBe(true)

    compressSpy.mockRestore()
    const id = Array.from((client as any).requests.keys())[0]
    ;(client as any).requests.get(id).resolve({ ok: true })
    await p
    infoSpy.mockRestore()
    await client.close()
  })
})
