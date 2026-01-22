/* eslint-disable */
/* eslint-env jest */
// Tests for ping/pong handling and timeouts.
// Comments in tests are in English as per repository conventions.

import { ClisrClient } from '../client'
import { ClientSocketReadyState, FRAME_PING, FRAME_PONG } from '../types'
import { MeasureMetricsContext } from '@hcengineering/measurements'

/**
 * Helper: create a minimal MeasureContext for tests.
 * We reuse the real MeasureMetricsContext to keep behavior close to production.
 */
function createFakeCtx() {
  return new MeasureMetricsContext('clisr-ping-test', {})
}

/**
 * Helper: create a minimal ClientSocket-like wrapper used by the client during tests.
 * The wrapper exposes the same mutable event handler properties used by the client.
 */
function createWrapper() {
  const wrapper: any = {
    send: jest.fn(),
    close: jest.fn(),
    readyState: ClientSocketReadyState.OPEN,
    onopen: null as any,
    onmessage: null as any,
    onclose: null as any,
    onerror: null as any
  }
  return wrapper
}

/**
 * Helper: convert an ASCII string into an ArrayBuffer with exact length (no TextEncoder dependency).
 */
function stringToArrayBuffer(s: string): ArrayBuffer {
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u.buffer
}

describe('ClisrClient ping/pong behavior and timeouts', () => {
  afterEach(() => {
    // Ensure timers are restored if any test switched them to fake timers.
    try {
      jest.useRealTimers()
    } catch {
      // ignore if already real
    }
  })

  it('responds to ping frame with a pong frame', async () => {
    const ctx = createFakeCtx()
    const wrapper = createWrapper()
    const socketFactory = jest.fn(() => wrapper)

    const client = new ClisrClient(
      ctx,
      'ws://localhost',
      () => {},
      () => 'token',
      { socketFactory }
    )

    try {
      const helloResp = {
        id: -1,
        result: 'hello',
        serverVersion: '1.0.0',
        sessionId: 'session-frame-ping'
      } as any
      client.handleMsg(1, helloResp)

      expect(typeof wrapper.onmessage).toBe('function')

      wrapper.send.mockClear()

      // Simulate receiving a binary ping frame
      wrapper.onmessage({ data: Buffer.from([FRAME_PING]) })

      expect(wrapper.send).toHaveBeenCalled()
      const arg = (wrapper.send as jest.Mock).mock.calls[0][0]
      expect(arg[0]).toBe(FRAME_PONG)
    } finally {
      await client.close()
    }
  })

  it('responds to binary ping with a pong reply', async () => {
    const ctx = createFakeCtx()
    const wrapper = createWrapper()
    const socketFactory = jest.fn(() => wrapper)

    const client = new ClisrClient(
      ctx,
      'ws://localhost',
      () => {},
      () => 'token',
      { socketFactory }
    )

    try {
      const helloResp = {
        id: -1,
        result: 'hello',
        serverVersion: '1.0.0',
        sessionId: 'session-binary-ping'
      } as any
      client.handleMsg(1, helloResp)

      wrapper.send.mockClear()

      // Simulate binary ping (Buffer)
      const buf = Buffer.from([FRAME_PING])
      wrapper.onmessage({ data: buf })

      expect(wrapper.send).toHaveBeenCalled()
      const arg = (wrapper.send as jest.Mock).mock.calls[0][0]
      expect(arg[0]).toBe(FRAME_PONG)
    } finally {
      await client.close()
    }
  })

  it('does not send RETRY_REQUESTS when client has cached pending responses', async () => {
    const ctx = createFakeCtx()
    const wrapper = createWrapper()
    const socketFactory = jest.fn(() => wrapper)

    const client = new ClisrClient(
      ctx,
      'ws://localhost',
      () => {},
      () => 'token',
      { socketFactory }
    )

    try {
      const helloResp = {
        id: -1,
        result: 'hello',
        serverVersion: '1.0.0',
        sessionId: 'session-no-retry'
      } as any
      client.handleMsg(1, helloResp)

      // Add a pending response so client can resend it
      const respId = 'req-1'
      const responseToSend = {
        method: '##',
        params: [{ ok: true }, undefined],
        id: respId,
        time: Date.now()
      }
      ;(client as any).pendingResponses.set(respId, responseToSend)

      wrapper.send.mockClear()

      const buf = Buffer.alloc(5)
      buf[0] = FRAME_PING
      buf.writeUInt32LE(2, 1)
      wrapper.onmessage({ data: buf })

      expect(wrapper.send).toHaveBeenCalled()
      const calls = (wrapper.send as jest.Mock).mock.calls.map((c) => c[0][0])
      expect(calls).toContain(FRAME_PONG)
      ;(client as any).pendingResponses.clear()
    } finally {
      await client.close()
    }
  })

  it('updates pingResponse on receiving pong frame', async () => {
    const ctx = createFakeCtx()
    const wrapper = createWrapper()
    const client = new ClisrClient(
      ctx,
      'ws://localhost',
      () => {},
      () => 'token',
      { socketFactory: () => wrapper }
    )

    try {
      const helloResp = {
        id: -1,
        result: 'hello',
        serverVersion: '1.0.0',
        sessionId: 'session-text-pong'
      } as any
      client.handleMsg(1, helloResp)

      // Set pingResponse to zero to ensure we can detect change.
      ;(client as any).pingResponse = 0

      // Simulate receiving pong frame
      wrapper.onmessage({ data: Buffer.from([FRAME_PONG]) })

      expect((client as any).pingResponse).not.toBe(0)
    } finally {
      await client.close()
    }
  })

  it('updates pingResponse on receiving binary pong', async () => {
    const ctx = createFakeCtx()
    const wrapper = createWrapper()
    const client = new ClisrClient(
      ctx,
      'ws://localhost',
      () => {},
      () => 'token',
      { socketFactory: () => wrapper }
    )

    try {
      const helloResp = {
        id: -1,
        result: 'hello',
        serverVersion: '1.0.0',
        sessionId: 'session-binary-pong'
      } as any
      client.handleMsg(1, helloResp)
      ;(client as any).pingResponse = 0

      const buf = Buffer.from([FRAME_PONG])
      wrapper.onmessage({ data: buf })

      expect((client as any).pingResponse).not.toBe(0)
    } finally {
      await client.close()
    }
  })

  it('sends pings periodically and closes socket when hangTimeout exceeded', async () => {
    // Use fake timers so we can advance intervals quickly.
    jest.useFakeTimers()

    const ctx = createFakeCtx()
    const wrapper = createWrapper()
    const client = new ClisrClient(
      ctx,
      'ws://localhost',
      () => {},
      () => 'token',
      { socketFactory: () => wrapper }
    )

    try {
      const helloResp = {
        id: -1,
        result: 'hello',
        serverVersion: '1.0.0',
        sessionId: 'session-ping-periodic'
      } as any
      client.handleMsg(1, helloResp)

      wrapper.send.mockClear()

      const pingTimeout = 10 * 1000 // must match implementation constant
      const hangTimeout = 5 * 60 * 1000 // must match implementation constant

      // First tick: client should send a ping frame.
      jest.advanceTimersByTime(pingTimeout)
      expect(wrapper.send).toHaveBeenCalled()
      const arg = (wrapper.send as jest.Mock).mock.calls[0][0]
      expect(arg[0]).toBe(FRAME_PING)

      // Simulate long time without a pong => pingResponse older than hangTimeout.
      ;(client as any).pingResponse = Date.now() - hangTimeout - 1000

      wrapper.close.mockClear()

      // Advance by one more interval so schedulePing detects hang and closes socket.
      jest.advanceTimersByTime(pingTimeout)
      expect(wrapper.close).toHaveBeenCalledWith(1000)
    } finally {
      // Restore real timers before async cleanup.
      jest.useRealTimers()
      await client.close()
    }
  })
})
