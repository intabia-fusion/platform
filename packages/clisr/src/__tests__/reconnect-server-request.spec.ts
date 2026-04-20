/* eslint-env jest */
// Test for server request handling after reconnect: when a server request is sent to a client,
// and the client executes it but experiences a reconnect before the response is delivered,
// the response should still reach the server after the reconnect.

import WebSocket from 'ws'
import { ClisrServer } from '../server'
import { ClisrClient } from '../client'
import { MeasureMetricsContext } from '@hcengineering/measurements'
import { ClientConnectEvent } from '../types'

jest.setTimeout(30000)

describe('Server request handling after reconnect', () => {
  it('delivers server request response to server after client reconnect', async () => {
    const ctx = new MeasureMetricsContext('reconnect-test', {})
    const server = new ClisrServer(ctx, async (token: string) => token === 'valid-token', '1.0.0')

    // Start server
    await server.start(ctx, 0)
    const addr = server.httpServer?.address() as any
    const port = addr?.port ?? 0

    // Create a socket factory that allows us to control the connection
    let currentWs: WebSocket | undefined
    const socketFactory = (url: string): any => {
      const ws = new WebSocket(url)
      currentWs = ws

      // Create a wrapper to intercept events
      const wrapper: any = {
        send: (data: any) => {
          ws.send(data)
        },
        close: (code?: number) => {
          try {
            ws.close(code)
          } catch (err) {
            // Ignore errors during close
          }
        },
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        get readyState () {
          return ws.readyState
        },
        bufferedAmount: 0
      }

      ws.on('open', (event: any) => {
        wrapper.onopen?.(event)
      })

      ws.on('message', (data: any) => {
        wrapper.onmessage?.({ data })
      })

      ws.on('close', (event: any) => {
        wrapper.onclose?.(event)
      })

      ws.on('error', (err: any) => {
        wrapper.onerror?.(err)
      })

      return wrapper
    }

    // Track when client executes the server request
    let executionResolve: (() => void) | null = null
    const executionPromise = new Promise<void>((resolve) => {
      executionResolve = resolve
    })

    // Track when client is connected
    let onConnectResolve: (() => void) | null = null
    const onConnectPromise = new Promise<void>((resolve) => {
      onConnectResolve = resolve
    })

    // Create client
    const client = new ClisrClient(
      ctx,
      `ws://127.0.0.1:${port}`,
      () => {}, // No operation handler needed for this test
      () => 'valid-token',
      {
        socketFactory,
        onConnect: async () => {
          onConnectResolve?.()
        }
      }
    )

    // Set up callback handler to process server requests
    client.callbackHandler = async (_ctx, method, params) => {
      // Simulate work being done
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Indicate that execution has happened
      executionResolve?.()

      // Send response back to server
      return { result: `processed: ${method}`, params }
    }

    // Wait for initial connection
    await onConnectPromise

    // Verify that client is connected
    expect((server as any).sessions.size).toBeGreaterThan(0)

    // Issue a request from server to client
    const serverRequestPromise = server.request(ctx, 'process-data', ['test-payload'])

    // Wait for the client to start executing the request
    await executionPromise

    // At this point, the client has received the request and is processing it
    // Now simulate a network disconnect/reconnect
    if (currentWs != null) {
      currentWs.close()
    }

    // Force client to reconnect
    client.scheduleOpen(ctx, true)

    // Wait for reconnection
    const reconnectedPromise = new Promise<void>((resolve) => {
      const originalOnConnect = client.onConnect
      client.onConnect = async (event, data) => {
        if (event === ClientConnectEvent.Reconnected) {
          resolve()
        }
        if (originalOnConnect != null) {
          await originalOnConnect(event, data)
        }
      }
    })

    await reconnectedPromise

    // The response should still be delivered to the server after reconnect
    const result = await serverRequestPromise
    expect(result).toEqual({ result: 'processed: process-data', params: ['test-payload'] })

    // Clean up
    await client.close()
    await server.close()
  })

  it('handles multiple server requests with reconnects properly', async () => {
    const ctx = new MeasureMetricsContext('reconnect-test', {})
    const server = new ClisrServer(ctx, async (token: string) => token === 'valid-token', '1.0.0')

    // Start server
    await server.start(ctx, 0)
    const addr = server.httpServer?.address() as any
    const port = addr?.port ?? 0

    // Create a socket factory that allows us to control the connection
    let currentWs: WebSocket | undefined
    const socketFactory = (url: string): any => {
      const ws = new WebSocket(url)
      currentWs = ws

      // Create a wrapper to intercept events
      const wrapper: any = {
        send: (data: any) => {
          ws.send(data)
        },
        close: (code?: number) => {
          try {
            ws.close(code)
          } catch (err) {
            // Ignore errors during close
          }
        },
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        get readyState () {
          return ws.readyState
        },
        bufferedAmount: 0
      }

      ws.on('open', (event: any) => {
        wrapper.onopen?.(event)
      })

      ws.on('message', (data: any) => {
        wrapper.onmessage?.({ data })
      })

      ws.on('close', (event: any) => {
        wrapper.onclose?.(event)
      })

      ws.on('error', (err: any) => {
        wrapper.onerror?.(err)
      })

      return wrapper
    }

    // Track connection state
    let onConnectResolve: (() => void) | null = null
    const onConnectPromise = new Promise<void>((resolve) => {
      onConnectResolve = resolve
    })

    // Create client
    const client = new ClisrClient(
      ctx,
      `ws://127.0.0.1:${port}`,
      () => {}, // No operation handler needed for this test
      () => 'valid-token',
      {
        socketFactory,
        onConnect: async () => {
          onConnectResolve?.()
        }
      }
    )

    // Set up callback handler to process server requests
    const responses: any[] = []
    client.callbackHandler = async (_ctx, method, params) => {
      // Simulate work being done
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Send response back to server
      const response = { result: `processed: ${method}`, params, id: params[0] }
      responses.push(response)
      return response
    }

    // Wait for initial connection
    await onConnectPromise

    // Verify that client is connected
    expect((server as any).sessions.size).toBeGreaterThan(0)

    // Issue multiple requests from server to client
    const request1Promise = server.request(ctx, 'task-1', ['id-1', 'data-1'])
    const request2Promise = server.request(ctx, 'task-2', ['id-2', 'data-2'])

    // Wait a bit for the client to start processing
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Simulate a network disconnect/reconnect
    if (currentWs != null) {
      currentWs.close()
    }

    // Force client to reconnect
    client.scheduleOpen(ctx, true)

    // Wait for reconnection
    const reconnectedPromise = new Promise<void>((resolve) => {
      const originalOnConnect = client.onConnect
      client.onConnect = async (event, data) => {
        if (event === ClientConnectEvent.Reconnected) {
          resolve()
        }
        if (originalOnConnect != null) {
          await originalOnConnect(event, data)
        }
      }
    })

    await reconnectedPromise

    // Both responses should still be delivered to the server after reconnect
    const result1 = await request1Promise
    const result2 = await request2Promise

    expect(result1).toEqual({ result: 'processed: task-1', params: ['id-1', 'data-1'], id: 'id-1' })
    expect(result2).toEqual({ result: 'processed: task-2', params: ['id-2', 'data-2'], id: 'id-2' })

    // Clean up
    await client.close()
    await server.close()
  })
})
