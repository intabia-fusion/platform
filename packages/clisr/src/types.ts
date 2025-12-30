//
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

import { type MeasureContext } from '@hcengineering/measurements'
import { type Response, type Request } from '@hcengineering/rpc'

/**
 * @public
 */
export type ClientSocketFactory = (url: string) => ClientSocket

/**
 * @public
 */
export interface ClientSocket {
  onmessage?: ((this: ClientSocket, ev: MessageEvent) => any) | null
  onclose?: ((this: ClientSocket, ev: CloseEvent) => any) | null
  onopen?: ((this: ClientSocket, ev: Event) => any) | null
  onerror?: ((this: ClientSocket, ev: Event) => any) | null

  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void

  close: (code?: number) => void

  readyState: ClientSocketReadyState

  bufferedAmount?: number
}

/**
 * @public
 */
export enum ClientSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3
}

export interface ClientFactoryOptions {
  socketFactory?: ClientSocketFactory
  connectionTimeout?: number
  onHello?: (serverVersion?: string) => boolean
  onError?: (err: any) => void
  onUpgrade?: (version: string) => void
  onConnect?: (event: ClientConnectEvent, data: any) => Promise<void>
  onDialTimeout?: () => void | Promise<void>

  useGlobalRPCHandler?: boolean

  // Optional overrides for compression (useful in tests)
  compress?: (input: any) => Promise<any>
  uncompress?: (input: any) => Promise<any>

  // If false, do not auto-open the connection; tests may set to false to avoid background timers
  autoStart?: boolean
}

/**
 * @public
 */
export enum ClientConnectEvent {
  Connected, // In case we just connected to server, and receive a full model
  Reconnected, // In case we re-connected to server and receive and apply diff.

  // Client could cause back a few more states.
  Upgraded, // In case client code receive a full new model and need to be rebuild.
  Refresh, // In case we detect query refresh is required
  Maintenance // In case workspace are in maintenance mode
}

export const pingConst = 'ping'
export const pongConst = 'pong!'

// Frame type codes for wire protocol
export const FRAME_PING = 0
export const FRAME_PONG = 1
export const FRAME_HELLO = 2
export const FRAME_HELLO_RESP = 3
export const FRAME_MSGPACK = 4 // Serialized msgpack data (uncompressed)
export const FRAME_MSGPACK_SNAPPY = 5 // Serialized msgpack data compressed with snappy

export type OperationHandler = (data: any[]) => void

/**
 * @public
 */
export interface HelloRequest extends Request<any[]> {
  token: string
  sessionId?: string
}
/**
 * @public
 */
export interface HelloResponse extends Response<any> {
  reconnect?: boolean
  serverVersion: string
  sessionId: string // A sessionid to reconnect
}

/**
 * @public
 */
export interface ConnectionSocket {
  id: string
  isClosed: boolean
  close: () => void
  send: (ctx: MeasureContext, msg: Response<any>) => Promise<void>

  // Send a raw framed Uint8/Buffer payload where first byte is the frame type
  sendRaw: (ctx: MeasureContext, buf: Uint8Array | Buffer) => Promise<void>

  sendPong: () => void
  data: () => Record<string, any>

  readRequest: (buffer: Buffer, binary: boolean) => Request<any>

  isBackpressure: () => boolean // In bytes
  backpressure: (ctx: MeasureContext) => Promise<void>
  checkState: () => boolean
}

/**
 * @public
 */
export interface Session {
  hello?: HelloRequest
  createTime: number

  socket: ConnectionSocket

  sid: string // Uniq session identifier
  // Session restore information
  sessionId: string

  requests: Map<string, RequestPromise>

  lastRequest: number
  lastPing: number
}

export class RequestPromise {
  startTime: number = Date.now()
  handleTime?: (diff: number, result: any, serverTime: number, queue: number, toRecieve: number) => void
  readonly promise: Promise<any>
  resolve!: (value?: any) => void
  reject!: (reason?: any) => void
  reconnect?: () => void

  // Required to properly handle rate limits
  sendData: () => void = () => {}

  onDone?: () => void

  session?: Session
  constructor (
    readonly method: string,
    readonly params: any[],

    readonly handleResult?: (result: any) => Promise<void>
  ) {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }

  chunks?: { index: number, data: any[] }[]
}
