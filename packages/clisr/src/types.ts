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

  // Client host identifier (e.g., hostname or service name) for server-side identification
  clientHost?: string
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

/**
 * Frame type codes for wire protocol
 */
export const FRAME_PING = 0
export const FRAME_PONG = 1
export const FRAME_HELLO = 2
export const FRAME_HELLO_RESP = 3
export const FRAME_MSGPACK = 4 // Serialized msgpack data (uncompressed)
export const FRAME_MSGPACK_SNAPPY = 5 // Serialized msgpack data compressed with snappy
export const FRAME_BINARY = 6 // Binary request: method (string) + binary payload
export const FRAME_BINARY_RESP = 7 // Binary response: id + binary payload
export const FRAME_OP_STATUS = 8 // Server -> Client: operation status check (payload: { id: string })

export const callbackMethod = '##'
export const FRAME_OP_STATUS_RESP = 9 // Client -> Server: operation status response (payload: { id: string, executing: boolean })

/**
 * Binary frame format:
 * - 1 byte: frame type (FRAME_BINARY)
 * - 4 bytes: id length (uint32 little-endian)
 * - N bytes: id (utf-8 string)
 * - 4 bytes: info JSON length (uint32 little-endian)
 * - J bytes: info JSON (utf-8 string) - contains { method, meta?, headers? }
 * - rest: binary payload
 */
export interface BinaryRequestInfo {
  method: string
  meta?: Record<string, any>
  headers?: Record<string, any>
}

export interface BinaryRequest {
  id: string
  method: string
  meta?: Record<string, any>
  headers?: Record<string, any>
  data: Uint8Array
}

/**
 * Binary response frame format:
 * - 1 byte: frame type (FRAME_BINARY_RESP)
 * - 4 bytes: id length (uint32 little-endian)
 * - N bytes: id (utf-8 string)
 * - 1 byte: error flag (0 = success, 1 = error)
 * - rest: binary payload (or error message if error flag is 1)
 */
export interface BinaryResponse {
  id: string
  error?: string
  data?: Uint8Array
}

/**
 * Encodes a binary request into a frame buffer
 */
export function encodeBinaryRequest (
  id: string,
  method: string,
  data: Uint8Array,
  meta?: Record<string, any>,
  headers?: Record<string, any>
): Uint8Array {
  const idBytes = new TextEncoder().encode(id)

  // Pack method, meta, headers into single JSON object
  const info: BinaryRequestInfo = { method }
  if (meta !== undefined && Object.keys(meta).length > 0) {
    info.meta = meta
  }
  if (headers !== undefined && Object.keys(headers).length > 0) {
    info.headers = headers
  }
  const infoBytes = new TextEncoder().encode(JSON.stringify(info))

  const totalLength = 1 + 4 + idBytes.length + 4 + infoBytes.length + data.length
  const buffer = new Uint8Array(totalLength)
  const view = new DataView(buffer.buffer)

  let offset = 0
  buffer[offset++] = FRAME_BINARY

  view.setUint32(offset, idBytes.length, true)
  offset += 4
  buffer.set(idBytes, offset)
  offset += idBytes.length

  view.setUint32(offset, infoBytes.length, true)
  offset += 4
  buffer.set(infoBytes, offset)
  offset += infoBytes.length

  buffer.set(data, offset)

  return buffer
}

/**
 * Decodes a binary request from a frame buffer (without frame type byte)
 */
export function decodeBinaryRequest (buffer: Uint8Array): BinaryRequest {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let offset = 0

  const idLength = view.getUint32(offset, true)
  offset += 4
  const id = new TextDecoder().decode(buffer.subarray(offset, offset + idLength))
  offset += idLength

  const infoLength = view.getUint32(offset, true)
  offset += 4
  const infoJson = new TextDecoder().decode(buffer.subarray(offset, offset + infoLength))
  const info: BinaryRequestInfo = JSON.parse(infoJson)
  offset += infoLength

  const data = buffer.subarray(offset)

  return { id, method: info.method, meta: info.meta, headers: info.headers, data }
}

/**
 * Encodes a binary response into a frame buffer
 */
export function encodeBinaryResponse (id: string, data?: Uint8Array, error?: string): Uint8Array {
  const idBytes = new TextEncoder().encode(id)
  const hasError = error !== undefined
  const payloadBytes = hasError ? new TextEncoder().encode(error) : (data ?? new Uint8Array(0))
  const totalLength = 1 + 4 + idBytes.length + 1 + payloadBytes.length
  const buffer = new Uint8Array(totalLength)
  const view = new DataView(buffer.buffer)

  let offset = 0
  buffer[offset++] = FRAME_BINARY_RESP

  view.setUint32(offset, idBytes.length, true)
  offset += 4
  buffer.set(idBytes, offset)
  offset += idBytes.length

  buffer[offset++] = hasError ? 1 : 0
  buffer.set(payloadBytes, offset)

  return buffer
}

/**
 * Decodes a binary response from a frame buffer (without frame type byte)
 */
export function decodeBinaryResponse (buffer: Uint8Array): BinaryResponse {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let offset = 0

  const idLength = view.getUint32(offset, true)
  offset += 4
  const id = new TextDecoder().decode(buffer.subarray(offset, offset + idLength))
  offset += idLength

  const hasError = buffer[offset++] === 1
  const payload = buffer.subarray(offset)

  if (hasError) {
    return { id, error: new TextDecoder().decode(payload) }
  }
  return { id, data: payload }
}

export type OperationHandler = (data: any[]) => void

/**
 * @public
 */
export interface HelloRequest extends Request<any[]> {
  token: string
  sessionId?: string
  clientHost?: string
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

  // Client host identifier (e.g., hostname or service name)
  clientHost?: string

  requests: Map<string, RequestPromise>

  lastRequest: number
  lastPing: number

  // Any user options, could be used to filter callbacks from server.
  options: Record<string, any>
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
