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
import express, { type Response as ExpressResponse, type NextFunction } from 'express'
import http, { type IncomingMessage } from 'http'
import morgan from 'morgan'
import os from 'os'
import { setImmediate } from 'timers/promises'
import 'utf-8-validate'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'

import {
  type ConnectionSocket,
  pingConst,
  pongConst,
  FRAME_PING,
  FRAME_PONG,
  FRAME_HELLO,
  FRAME_HELLO_RESP,
  FRAME_JSON,
  FRAME_PACKED,
  RequestPromise,
  type Session,
  type HelloRequest,
  type HelloResponse
} from './types'
import { randomUUID } from 'crypto'
import { setTimeout } from 'timers'

// Lazy-import snappy at runtime to avoid initializing native handles during test collection
const lazyCompress = async (input: any): Promise<any> => {
  const m = await import('snappy')
  return await m.compress(input)
}
const lazyUncompress = async (input: any): Promise<any> => {
  const m = await import('snappy')
  return await m.uncompress(input)
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

  public handlers: ((op: any, response: (data: any) => Promise<void>) => Promise<void>)[] = []

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
    readonly serverVersion: string
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
    this.ctx.info('session timed out', { sessionId: session.sessionId })
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
    this.ctx.info('session reconnect timed out', { sessionId: session.sessionId })

    for (const rr of session.requests.values()) {
      rr.reject(new Error('Session reconnect timeout'))
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
    while (true) {
      const num = this.cindex++
      const s = Array.from(this.sessions.values())[num % this.sessions.size]
      try {
        return await ctx.with(method, {}, (ctx) =>
          this.sendRequest(s, {
            method,
            params
          })
        )
      } catch (err: any) {
        ctx.error('request send error', { err })
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

    const app = express()
    app.use(cors())

    const childLogger = ctx.logger.childLogger?.('requests', {
      enableConsole: 'true'
    })
    const requests = ctx.newChild('requests', {}, { logger: childLogger, span: false })

    class MyStream {
      write (text: string): void {
        requests.info(text)
      }
    }

    const myStream = new MyStream()

    app.use(morgan('short', { stream: myStream }))

    this.httpServer = http.createServer(app)
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
            const request = {
              method: ft === FRAME_PING ? pingConst : pongConst,
              params: [],
              id: -1,
              time: Date.now()
            } as any
            await this.handleRequest(session, request)
            return
          }

          if (ft === FRAME_HELLO || ft === FRAME_HELLO_RESP) {
            // Hello frames carry RPC-serialized payload (no compression)
            const payload = buff.slice(1)
            const request = session.socket.readRequest(payload, true)
            await this.handleRequest(session, request)
            return
          }

          if (ft === FRAME_JSON) {
            // Short JSON payload
            try {
              const text = this.payloadToString(buff.slice(1))
              const obj = JSON.parse(text)
              await this.handleRequest(session, obj)
            } catch (err: any) {
              this.ctx.error('failed to parse json frame', { err })
              session.socket.close()
            }
            return
          }

          if (ft === FRAME_PACKED) {
            // Body is compressed packed data - decompress first
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

  private async handleRequest (session: Session, request: Request<any>): Promise<void> {
    if (request.method === pingConst || request.method === pongConst) {
      session.lastPing = Date.now()
      if (request.method === pingConst) {
        // Send pong back
        try {
          session.socket.sendPong()
        } catch (err: any) {
          this.ctx.error('failed to send pong', { err })
        }
      }
      // Do not return here: allow registered handlers to also receive ping/pong requests
    }
    // Check if hello is not received yet.
    if (session.hello === undefined) {
      // Assume request is hello one
      const hello = request as HelloRequest
      void this.checkHello(session, hello, session.socket)
      return
    }

    // Handle responses to server's previous requests (client -> server reply to '#...' messages)
    if (request.id !== undefined && request.method === '##') {
      const rr = this.requests.get(request.id)
      this.requests.delete(request.id)
      if (rr !== undefined) {
        void rr.handleResult?.(request.params[0])
        rr.resolve(request.params[0])
        rr.onDone?.()
        return
      }
    }

    // Ok we authorized - invoke registered handlers
    for (let i = 0; i < this.handlers.length; i++) {
      const h = this.handlers[i]
      void h(request, async (data: any) => {
        const resp: Response<any> = {
          id: request.id,
          result: data
        }
        await session.socket.send(this.ctx, resp)
      })
    }
  }

  private createSession (sid: string, cs: ConnectionSocket): Session {
    return {
      hello: undefined,
      createTime: Date.now(),
      sid,
      sessionId: sid,
      requests: new Map<string, any>(),
      lastRequest: Date.now(),
      lastPing: Date.now(),
      socket: cs
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

      const oldSession = this.reconnectQueue.get(session.sessionId) ?? this.bySessionId.get(session.sessionId)
      this.reconnectQueue.delete(session.sessionId)

      let event: ConnectionEventType = 'connected'
      if (oldSession !== undefined) {
        event = 'reconnect'
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
      // Check if we reconnected

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
      if (buffer.length === 1 && buffer[0] === FRAME_PING) {
        return { method: pingConst, params: [], id: -1, time: Date.now() }
      }
      if (buffer.length === 1 && buffer[0] === FRAME_PONG) {
        return { method: pongConst, params: [], id: -1, time: Date.now() }
      }
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
    // Send an RPC message framed as compressed packed message (FRAME_PACKED)
    send: async (ctx: MeasureContext, msg): Promise<void> => {
      const smsg = rpcHandler.serialize(msg, true)
      if (ws.readyState !== ws.OPEN || cs.isClosed) {
        return
      }

      // We need to be sure all data is send before we will send more.
      if (cs.isBackpressure()) {
        await cs.backpressure(ctx)
      }

      const compressed = await (opts?.compress ?? lazyCompress)(smsg)
      const out = Buffer.concat([Buffer.from([FRAME_PACKED]), Buffer.from(compressed)])
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
          resolve() // In any case we need to resolve.
        }
        ws.send(out, { binary: true }, handleErr)
      })
    }
  }
  return cs
}
