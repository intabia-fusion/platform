//
// Copyright © 2023 Hardcore Engineering Inc.
// Copyright © 2025 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { Analytics } from '@hcengineering/analytics'
import { type MeasureContext } from '@hcengineering/measurements'
import { type ReqId, RPCHandler, type Response, type Request } from '@hcengineering/rpc'

import 'bufferutil'
import cors from 'cors'
import express, { type Express, type Response as ExpressResponse, type NextFunction } from 'express'
import http, { type IncomingMessage } from 'http'
import morgan from 'morgan'
import os from 'os'
import { setImmediate } from 'timers/promises'
import 'utf-8-validate'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'

import {
  type ConnectionSocket,
  FRAME_PING,
  FRAME_PONG,
  FRAME_HELLO,
  FRAME_HELLO_RESP,
  FRAME_MSGPACK,
  FRAME_MSGPACK_SNAPPY,
  FRAME_BINARY,
  FRAME_BINARY_RESP,
  RequestPromise,
  type Session,
  type HelloRequest,
  type HelloResponse,
  callbackMethod,
  decodeBinaryRequest,
  encodeBinaryResponse,
  encodeBinaryRequest,
  decodeBinaryResponse
} from './types'
import { randomUUID } from 'crypto'
import { setTimeout } from 'timers'
import { sendFrame as sharedSendFrame } from './frame-utils'
import { unknownError } from '@hcengineering/platform'

// Lazy-import snappy at runtime to avoid initializing native handles during test collection
let _snappyCompress: ((input: any) => Promise<any>) | undefined
let _snappyUncompress: ((input: any) => Promise<any>) | undefined
const lazyCompress = async (input: any): Promise<any> => {
  if (_snappyCompress === undefined) {
    const m = await import('snappy')
    _snappyCompress = m.compress.bind(m)
    _snappyUncompress = m.uncompress.bind(m)
  }
  if (_snappyCompress === undefined) {
    throw new Error('snappy compress function not available')
  }
  return await _snappyCompress(input)
}
const lazyUncompress = async (input: any): Promise<any> => {
  if (_snappyUncompress === undefined) {
    const m = await import('snappy')
    _snappyCompress = _snappyCompress ?? m.compress.bind(m)
    _snappyUncompress = m.uncompress.bind(m)
  }
  if (_snappyUncompress === undefined) {
    throw new Error('snappy uncompress function not available')
  }
  return await _snappyUncompress(input)
}

export type RequestHandler = (req: Request<any>, res: ExpressResponse, next?: NextFunction) => Promise<void>

const backpressureSize = 100 * 1024

const ReconnectTimeout = 10 * 1000 * 1000 // 10 seconds
const OperationTimeout = 2 * 1000 * 1000 // 10 seconds
const HangTimeout = 50 * 1000 * 1000 // 50 seconds

export type ConnectionEventType = 'connected' | 'reconnect' | 'disconnect' | 'timeout'

export class ClisrServer {
  private readonly sessions = new Map<string, Session>()
  private readonly bySessionId = new Map<string, Session>()
  private cindex = 0
  private msgIndex = 0
  rpcHandler = new RPCHandler()

  private readonly requests = new Map<ReqId, RequestPromise>()

  // Binary request handler for incoming binary requests from clients
  // Can return Uint8Array for binary response, or any other type for JSON response
  public binaryHandler?: (
    session: Session,
    method: string,
    data: Uint8Array,
    headers?: Record<string, any>
  ) => Promise<Uint8Array | any>

  // Allow overriding compression functions (default to snappy).
  // Tests can override the instance methods instead of mocking the native module.
  compress: (input: any) => Promise<any> = lazyCompress
  uncompress: (input: any) => Promise<any> = lazyUncompress

  public eventHandlers: ((session: string, event: ConnectionEventType) => Promise<void>)[] = []

  reconnectQueue = new Map<string, Session>()

  wss?: WebSocketServer
  httpServer?: http.Server
  private tickTimer?: ReturnType<typeof setInterval>

  constructor (
    readonly ctx: MeasureContext,
    readonly validateToken: (token: string) => Promise<boolean>,
    readonly serverVersion: string,
    readonly app: Express = express(),
    readonly messageHandler?: (ctx: MeasureContext, method: string, params: any[], session: Session) => Promise<any>
  ) {}

  async handleTick (): Promise<void> {
    const now = Date.now()
    for (const [sid, session] of this.reconnectQueue.entries()) {
      if (now - session.lastRequest > ReconnectTimeout) {
        await this.handleSessionDisconnect(sid, session)
      }
    }
    for (const [sid, session] of this.sessions.entries()) {
      if (now - session.lastRequest > OperationTimeout) {
        await this.handleSessionTimeout(sid, session)
      }
    }
    // Check and log hang requests
    for (const r of this.requests.values()) {
      if (r.session !== undefined && now - r.startTime > HangTimeout && now - r.session.lastPing > OperationTimeout) {
        // Operation is hang, send ping, maybe socket is broken.
        r.session.lastPing = now
        try {
          void r.session.socket.sendRaw(this.ctx, Buffer.from([FRAME_PING]))
        } catch (err: any) {
          this.ctx.error('failed to send ping frame', { err })
        }
        this.ctx.warn('found hang request', { request: r.method, data: r.session.socket.data })
      }
    }
  }

  private async handleSessionTimeout (sid: string, session: Session): Promise<void> {
    this.sessions.delete(sid)
    session.socket.close()
    this.reconnectQueue.set(sid, session)
    this.ctx.info('session timed out', { sessionId: session.sessionId, client: session.clientHost })
    for (const eh of this.eventHandlers) {
      try {
        await eh(session.sessionId, 'timeout')
      } catch (err: any) {
        this.ctx.error('event handler error', { err })
      }
    }
  }

  private async handleSessionDisconnect (sessionId: string, session: Session): Promise<void> {
    this.reconnectQueue.delete(sessionId)
    this.bySessionId.delete(session.sessionId)
    const clientInfo = session.clientHost ?? session.sessionId
    this.ctx.info('session reconnect timed out', { sessionId: session.sessionId, client: session.clientHost })

    for (const rr of session.requests.values()) {
      rr.reject(new Error(`Session reconnect timeout (client: ${clientInfo})`))
    }

    for (const eh of this.eventHandlers) {
      try {
        await eh(session.sessionId, 'disconnect')
      } catch (err: any) {
        this.ctx.error('event handler error', { err })
      }
    }
  }

  async broadcast (msg: any): Promise<void> {
    for (const session of this.sessions.values()) {
      try {
        await session.socket.send(this.ctx, msg)
      } catch (err: any) {
        this.ctx.error('broadcast error', { err })
      }
    }
  }

  private sendRequest (
    socket: Session,
    data: {
      method: string
      params: any[]
      handleResult?: (result: any) => Promise<void>
    }
  ): Promise<any> {
    return this.ctx.with(
      'send-request',
      {},
      async (ctx) => {
        const id = `#${this.msgIndex++}`
        const promise = new RequestPromise(data.method, data.params, data.handleResult)
        promise.session = socket

        this.requests.set(id, promise)
        promise.onDone = () => {
          socket.requests.delete(id.toString())
        }

        promise.sendData = (): void => {
          if (!socket.socket.isClosed) {
            promise.startTime = Date.now()

            const msg: Response<any> = {
              result: {
                method: data.method,
                params: data.params,
                meta: ctx.extractMeta()
              },
              id,
              time: Date.now()
            }

            socket.requests.set(id.toString(), promise)
            void socket.socket.send(this.ctx, msg)
          }
        }
        promise.sendData()
        return await promise.promise
      },
      { method: data.method },
      {
        span: 'skip'
      }
    )
  }

  // Perform a round robin call to one of the connected clients and wait for response from it
  // if client is not responding for a timeout, try next one client.
  async request (ctx: MeasureContext, method: string, params: any[]): Promise<any> {
    return await this.requestWithFilter(ctx, method, params)
  }

  /**
   * Perform a round robin call to one of the connected clients that matches the filter.
   * If sessionFilter is provided, only sessions that pass the filter will be considered.
   * @param ctx - measure context
   * @param method - method name to invoke
   * @param params - parameters to pass to the method
   * @param sessionFilter - optional filter function to select eligible sessions
   * @returns Promise with response data
   */
  async requestWithFilter (
    ctx: MeasureContext,
    method: string,
    params: any[],
    sessionFilter?: (session: Session) => boolean
  ): Promise<any> {
    while (true) {
      // Keep trying indefinitely
      let sessions = Array.from(this.sessions.values())
      if (sessionFilter !== undefined) {
        sessions = sessions.filter(sessionFilter)
      }
      if (sessions.length === 0) {
        // No sessions available, wait a bit and try again
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }

      const num = this.cindex++
      const s = sessions[num % sessions.length]
      const clientInfo = s.clientHost ?? s.sessionId
      try {
        return await ctx.with(method, {}, (ctx) =>
          this.sendRequest(s, {
            method,
            params
          })
        )
      } catch (err: any) {
        ctx.error('request send error', { err, client: clientInfo })
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }
    }
  }

  /**
   * Send a binary request to a specific session and wait for response.
   * Response can be either binary (Uint8Array) or JSON, depending on client handler.
   * @param session - target session
   * @param method - method name to invoke
   * @param data - binary payload
   * @param headers - optional headers to pass to the client handler
   * @returns Promise with response data (binary or JSON based on client handler)
   */
  private async sendBinaryRequest<T = Uint8Array>(
    session: Session,
    method: string,
    data: Uint8Array,
    headers?: Record<string, any>
  ): Promise<T> {
    return await this.ctx.with('binary-request', { method }, async (ctx) => {
      const clientInfo = session.clientHost ?? session.sessionId
      if (session.socket.isClosed) {
        throw new Error(`session is closed (client: ${clientInfo}), cannot send binary request ${method}`)
      }

      const id = `#b${this.msgIndex++}`
      const promise = new RequestPromise(method, [])
      promise.session = session

      this.requests.set(id, promise)

      // Pass meta separately from headers
      const meta = ctx.extractMeta()

      try {
        const frame = encodeBinaryRequest(id, method, data, meta, headers)
        void session.socket.sendRaw(ctx, frame)
      } catch (err: any) {
        this.requests.delete(id)
        throw err
      }

      return (await promise.promise) as T
    })
  }

  /**
   * Send a binary request to any connected session (round-robin) and wait for response.
   * Response can be either binary (Uint8Array) or JSON, depending on client handler.
   * @param ctx - measure context
   * @param method - method name to invoke
   * @param data - binary payload
   * @param headers - optional headers to pass to the client handler
   * @returns Promise with response data (binary or JSON based on client handler)
   */
  async binaryRequest<T = Uint8Array>(
    ctx: MeasureContext,
    method: string,
    data: Uint8Array,
    headers?: Record<string, any>,
    sessionCheck?: (session: Session) => boolean
  ): Promise<T> {
    while (true) {
      let sessions = Array.from(this.sessions.values())
      if (sessionCheck !== undefined) {
        sessions = sessions.filter(sessionCheck)
      }
      if (sessions.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }

      const num = this.cindex++
      const s = sessions[num % sessions.length]
      const clientInfo = s.clientHost ?? s.sessionId

      try {
        return await this.sendBinaryRequest<T>(s, method, data, headers)
      } catch (err: any) {
        ctx.error('binary request send error', { err, client: clientInfo })
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }
    }
  }

  async start (ctx: MeasureContext, port: number): Promise<void> {
    ctx.info('starting server on', {
      port,
      parallel: os.availableParallelism()
    })

    this.tickTimer = setInterval(() => {
      void this.handleTick()
    }, 1000)
    // tickTimer will be cleared in `close()`; ensure tests call `server.close()` to cleanup timers
    this.app.use(cors())

    class MyStream {
      write (text: string): void {
        ctx.info(text)
      }
    }

    const myStream = new MyStream()

    this.app.use(morgan('short', { stream: myStream }))

    this.httpServer = http.createServer(this.app)
    this.wss = this.createWebsocketServer()

    this.wss.on('connection', (ws, request) => {
      void this.handleConnection(ws, request)
    })

    const wss = this.wss
    this.httpServer.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        void this.handleConnection(ws, request)
      })
    })
    this.httpServer.on('error', (err) => {
      ctx.error('server error', err)
    })

    this.httpServer.listen(port)
  }

  private createWebsocketServer (): WebSocketServer {
    return new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
      skipUTF8Validation: true,
      maxPayload: 250 * 1024 * 1024,
      clientTracking: false
    })
  }

  async handleConnection (ws: WebSocket, request: IncomingMessage): Promise<void> {
    const data = {
      remoteAddress: request.socket.remoteAddress ?? '',
      userAgent: request.headers['user-agent'] ?? '',
      language: request.headers['accept-language'] ?? ''
    }
    const cs: ConnectionSocket = createWebsocketClientSocket(ws, data, this.rpcHandler, {
      compress: this.compress,
      uncompress: this.uncompress
    })

    const sid = randomUUID().toString()
    const session: Session = this.createSession(sid, cs)
    this.sessions.set(sid, session)

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    ws.on('message', async (msg: RawData) => {
      await this.handleMessage(session, msg)
    })
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    ws.on('close', (code: number, reason: Buffer) => {
      this.sessions.delete(sid)
      // Put into reconnect queue
      this.reconnectQueue.set(session.sessionId, session)
      this.ctx.info('connection closed', { code, reason: reason.toString(), user: session.sessionId })
    })

    ws.on('error', (err) => {
      Analytics.handleError(err)
      this.ctx.error('ws error', { err })
    })
  }

  private payloadToString (buf: Buffer): string {
    return buf.toString('utf-8')
  }

  private async unpackMessage (buff: any): Promise<any> {
    // Require compressed data. Decompress before parsing and fail fast if decompression errors.
    try {
      const uncmp: unknown = await this.uncompress(buff)
      if (Buffer.isBuffer(uncmp)) {
        return uncmp
      } else if (uncmp instanceof Uint8Array) {
        // Convert Uint8Array to Buffer (preserve bytes without assuming a specific backing ArrayBuffer)
        return Buffer.from(uncmp.buffer, uncmp.byteOffset, uncmp.byteLength)
      } else if (typeof uncmp === 'string') {
        // Unexpected but handle gracefully: convert UTF-8 string to Buffer so we can at least attempt parsing.
        return Buffer.from(uncmp, 'utf-8')
      } else {
        throw new Error(`decompress returned unexpected type: ${JSON.stringify({ type: typeof uncmp })}`)
      }
    } catch (err: any) {
      // Log detailed context and close the socket to surface the protocol error.
      throw new Error(`decompress failed unexpected type: ${err.message}`)
    }
  }

  private async handleMessage (session: Session, msg: RawData): Promise<void> {
    try {
      let buff: Buffer | undefined
      if (msg instanceof Buffer) {
        buff = msg
      } else if (Array.isArray(msg)) {
        buff = Buffer.concat(msg as any)
      }
      if (buff !== undefined) {
        try {
          // Inspect first byte frame type
          const ft = buff[0]
          if (ft === FRAME_PING || ft === FRAME_PONG) {
            session.lastPing = Date.now()
            if (ft === FRAME_PING) {
              // Send pong back
              try {
                session.socket.sendPong()
              } catch (err: any) {
                this.ctx.error('failed to send pong', { err })
              }
            }
            return
          }

          if (ft === FRAME_HELLO || ft === FRAME_HELLO_RESP) {
            // Hello frames carry RPC-serialized payload (no compression)
            const payload = buff.slice(1)
            const request = session.socket.readRequest(payload, true)
            await this.handleRequest(session, request)
            return
          }

          if (ft === FRAME_BINARY) {
            // Handle incoming binary request from client
            try {
              const binaryRequest = decodeBinaryRequest(
                new Uint8Array(buff.buffer, buff.byteOffset + 1, buff.byteLength - 1)
              )
              await this.handleBinaryRequest(
                session,
                binaryRequest.id,
                binaryRequest.method,
                binaryRequest.data,
                binaryRequest.meta,
                binaryRequest.headers
              )
            } catch (err: any) {
              this.ctx.error('failed to handle binary request', { err })
            }
            return
          }

          if (ft === FRAME_BINARY_RESP) {
            // Handle binary response from client (for server-initiated binary requests)
            try {
              const response = decodeBinaryResponse(
                new Uint8Array(buff.buffer, buff.byteOffset + 1, buff.byteLength - 1)
              )
              const promise = this.requests.get(response.id)
              if (promise !== undefined) {
                this.requests.delete(response.id)
                if (response.error !== undefined) {
                  promise.reject(new Error(response.error))
                } else {
                  promise.resolve(response.data ?? new Uint8Array(0))
                }
              } else {
                this.ctx.error('unknown binary response id', { id: response.id })
              }
            } catch (err: any) {
              this.ctx.error('failed to parse binary response', { err })
            }
            return
          }

          if (ft === FRAME_MSGPACK) {
            // Direct msgpack frame (uncompressed)
            try {
              const request = session.socket.readRequest(buff.slice(1), true)
              await this.handleRequest(session, request)
            } catch (err: any) {
              this.ctx.error('failed to parse msgpack frame', { err })
              session.socket.close()
            }
            return
          }

          if (ft === FRAME_MSGPACK_SNAPPY) {
            // Body is compressed msgpack data - decompress first
            let requestBuffer: Buffer
            try {
              const dec = await this.uncompress(buff.slice(1))
              if (Buffer.isBuffer(dec)) {
                requestBuffer = dec
              } else if (dec instanceof Uint8Array) {
                requestBuffer = Buffer.from(dec.buffer, dec.byteOffset, dec.byteLength)
              } else {
                throw new Error('decompress returned unexpected type')
              }
            } catch (err: any) {
              this.ctx.error('failed to decompress incoming message', {
                err,
                len: buff.length,
                sid: session.sid,
                preview: buff.slice(0, Math.min(20, buff.length)).toString('hex')
              })
              session.socket.close()
              return
            }

            const request = session.socket.readRequest(requestBuffer, true)
            await this.handleRequest(session, request)
            return
          }

          // Unknown frame - try to parse as compressed message (backwards compatibility)
          let requestBuffer: Buffer
          try {
            requestBuffer = await this.unpackMessage(buff)
          } catch (err: any) {
            // Log detailed context and close the socket to surface the protocol error.
            this.ctx.error('failed to decompress incoming message', {
              err,
              len: buff.length,
              sid: session.sid,
              preview: buff.slice(0, Math.min(20, buff.length)).toString('hex')
            })
            session.socket.close()
            return
          }

          const request = session.socket.readRequest(requestBuffer, true)

          await this.handleRequest(session, request)
        } catch (err: any) {
          if (((err.message as string) ?? '').includes('Data read, but end of buffer not reached')) {
            // ignore it
          } else {
            throw err
          }
        }
      }
    } catch (err: any) {
      Analytics.handleError(err)
      this.ctx.error('message error', { err })
    }
  }

  /**
   * Handle incoming binary request from client
   * Handler can return Uint8Array for binary response, or any other type for JSON response
   */
  private async handleBinaryRequest (
    session: Session,
    id: string,
    method: string,
    data: Uint8Array,
    meta?: Record<string, any>,
    headers?: Record<string, any>
  ): Promise<void> {
    session.lastRequest = Date.now()

    const handler = this.binaryHandler
    if (handler === undefined) {
      this.ctx.error('no binary handler registered', { method })
      const responseFrame = encodeBinaryResponse(id, undefined, 'No binary handler registered')
      await session.socket.sendRaw(this.ctx, responseFrame)
      return
    }

    try {
      const result = await this.ctx.with(
        'handle-binary',
        { method },
        async () => await handler(session, method, data, headers),
        {},
        {
          meta: meta ?? {}
        }
      )

      // Check if result is binary (Uint8Array) or JSON
      if (result instanceof Uint8Array) {
        // Send binary response
        const responseFrame = encodeBinaryResponse(id, result)
        await session.socket.sendRaw(this.ctx, responseFrame)
      } else {
        // Send JSON response via standard RPC mechanism
        const response: Response<any> = {
          id,
          result,
          time: Date.now()
        }
        await session.socket.send(this.ctx, response)
      }
    } catch (err: any) {
      const responseFrame = encodeBinaryResponse(id, undefined, err.message ?? 'Unknown error')
      await session.socket.sendRaw(this.ctx, responseFrame)
    }
  }

  private async handleRequest (session: Session, request: Request<any>): Promise<void> {
    // Check if hello is not received yet.
    if (session.hello === undefined) {
      // Assume request is hello one
      const hello = request as HelloRequest
      void this.checkHello(session, hello, session.socket)
      return
    }

    // Handle responses to server's previous requests (client -> server reply to '#...' messages)
    if (request.id !== undefined && request.method === callbackMethod) {
      const rr = this.requests.get(request.id)
      this.requests.delete(request.id)
      if (rr !== undefined) {
        const [response, error] = request.params
        if (error !== undefined) {
          // Handle error response from client
          const errorMessage = error.message ?? 'Unknown error from client callback'
          const err = new Error(errorMessage)
          if (error.stack !== undefined) {
            err.stack = error.stack
          }
          rr.reject(err)
        } else {
          // Handle successful response
          void rr.handleResult?.(response)
          rr.resolve(response)
        }
        rr.onDone?.()
        return
      }
    }

    // Ok we authorized - invoke registered handlers
    void this.messageHandler?.(this.ctx, request.method, request.params, session)
      .then((result) => {
        const resp: Response<any> = {
          id: request.id,
          result
        }
        void session.socket.send(this.ctx, resp)
      })
      .catch((err) => {
        const resp: Response<any> = {
          id: request.id,
          result: undefined,
          error: unknownError(err)
        }
        void session.socket.send(this.ctx, resp)
      })
  }

  private createSession (sid: string, cs: ConnectionSocket, clientHost?: string): Session {
    return {
      hello: undefined,
      createTime: Date.now(),
      sid,
      sessionId: sid,
      clientHost,
      requests: new Map<string, any>(),
      lastRequest: Date.now(),
      lastPing: Date.now(),
      socket: cs,
      options: {}
    }
  }

  async close (): Promise<void> {
    if (this.tickTimer !== undefined) {
      clearInterval(this.tickTimer)
      this.tickTimer = undefined
    }
    if (this.wss !== undefined) {
      const wss = this.wss
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => {
          if (err != null) {
            reject(err)
          }
          resolve()
        })
      })
    }
    if (this.httpServer !== undefined) {
      const httpServer = this.httpServer
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => {
          if (err != null) {
            reject(err)
          }
          resolve()
        })
      )
    }
  }

  async checkHello (session: Session, hello: HelloRequest, cs: ConnectionSocket): Promise<void> {
    try {
      if (!(await this.validateToken(hello.token))) {
        throw new Error('Invalid token')
      }
      session.hello = hello
      session.sessionId = hello.sessionId ?? session.sessionId
      session.clientHost = hello.clientHost

      const oldSession = this.reconnectQueue.get(session.sessionId) ?? this.bySessionId.get(session.sessionId)
      this.reconnectQueue.delete(session.sessionId)

      let event: ConnectionEventType = 'connected'
      if (oldSession !== undefined) {
        event = 'reconnect'
        // Transfer pending requests from old session to new session
        if (oldSession.requests != null) {
          for (const [reqId, request] of oldSession.requests) {
            session.requests.set(reqId, request)
            // Update the session reference in the request
            request.session = session
          }
        }
        // Update the server's main requests map - replace requests that were from the old session
        // with references to the new session
        for (const [, /* _reqId */ request] of this.requests) {
          if (request.session === oldSession) {
            request.session = session
          }
        }
        oldSession.socket.close() // Just in case
      }
      for (const eh of this.eventHandlers) {
        try {
          await eh(session.sessionId, event)
        } catch (err: any) {
          this.ctx.error('event handler error', { err })
        }
      }

      this.bySessionId.set(session.sessionId, session)

      // Log client connection
      this.ctx.info('client connected', {
        sessionId: session.sessionId,
        client: session.clientHost,
        reconnect: oldSession !== undefined
      })

      const resp: HelloResponse = {
        reconnect: oldSession !== undefined,
        serverVersion: this.serverVersion,
        sessionId: session.sessionId,
        id: hello.id,
        result: 'hello'
      }

      // Send hello response framed as FRAME_HELLO_RESP with serialized payload (no extra compression)
      const sresp = this.rpcHandler.serialize(resp, true)
      const out = Buffer.concat([Buffer.from([FRAME_HELLO_RESP]), Buffer.from(sresp)])
      await cs.sendRaw(this.ctx, out)
    } catch (err: any) {
      this.ctx.error('hello parse error', { err })
      this.sessions.delete(session.sid)
      cs.close()
    }
  }
}
export function createWebsocketClientSocket (
  ws: WebSocket,
  data: {
    remoteAddress: string
    userAgent: string
    language: string
  },
  rpcHandler: RPCHandler,
  opts?: { compress?: (input: any) => Promise<any>, uncompress?: (input: any) => Promise<any> }
): ConnectionSocket {
  const cs: ConnectionSocket = {
    id: randomUUID().toString(),
    isClosed: false,
    close: () => {
      cs.isClosed = true
      ws.close()
      ws.terminate()
    },
    isBackpressure: () => ws.bufferedAmount > backpressureSize,
    backpressure: async (ctx) => {
      if (ws.bufferedAmount < backpressureSize) {
        return
      }
      await ctx.with('backpressure', {}, async () => {
        while (ws.bufferedAmount > backpressureSize) {
          await setImmediate()
        }
      })
    },
    checkState: () => {
      if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) {
        ws.terminate()
        return false
      }
      return true
    },
    readRequest: (buffer: Buffer, binary: boolean) => {
      return rpcHandler.readRequest(buffer, binary)
    },
    data: () => data,
    sendPong: () => {
      if (ws.readyState !== ws.OPEN || cs.isClosed) {
        return
      }
      const buf = Buffer.from([FRAME_PONG])
      ws.send(buf, { binary: true })
    },
    // Send raw Uint8/Buffer frame (first byte is frame type)
    sendRaw: async (ctx: MeasureContext, buf: Uint8Array | Buffer): Promise<void> => {
      if (ws.readyState !== ws.OPEN || cs.isClosed) {
        return
      }
      if (cs.isBackpressure()) {
        await cs.backpressure(ctx)
      }
      const st = performance.now()
      await new Promise<void>((resolve) => {
        const handleErr = (err?: Error): void => {
          ctx.measure('msg-send-delta', performance.now() - st)
          if (err != null) {
            if (!`${err.message}`.includes('WebSocket is not open')) {
              ctx.error('send error', { err })
              Analytics.handleError(err)
            }
          }
          resolve()
        }
        ws.send(Buffer.from(buf as Buffer), { binary: true }, handleErr)
      })
    },
    // Send an RPC message, compressing only if larger than 1024 bytes
    send: async (ctx: MeasureContext, msg): Promise<void> => {
      if (ws.readyState !== ws.OPEN || cs.isClosed) {
        return
      }

      // We need to be sure all data is send before we will send more.
      if (cs.isBackpressure()) {
        await cs.backpressure(ctx)
      }

      // Use shared sendFrame utility
      const compressFn = opts?.compress ?? lazyCompress
      const sendFn = (data: Uint8Array): void => {
        const out = Buffer.from(data)
        const st = performance.now()
        ws.send(out, { binary: true }, (err?: Error) => {
          ctx.measure('msg-send-delta', performance.now() - st)
          if (err != null) {
            if (!`${err.message}`.includes('WebSocket is not open')) {
              ctx.error('send error', { err })
              Analytics.handleError(err)
            }
          }
        })
      }

      await sharedSendFrame(ctx, sendFn, msg, compressFn, true)
    }
  }
  return cs
}
