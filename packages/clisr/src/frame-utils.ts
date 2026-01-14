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
import { type Response, type Request, RPCHandler } from '@hcengineering/rpc'
import { FRAME_MSGPACK, FRAME_MSGPACK_SNAPPY, FRAME_PING, FRAME_PONG, FRAME_HELLO, FRAME_HELLO_RESP } from './types'

// Shared RPC handler for serialization/deserialization
const rpcHandler = new RPCHandler()

/**
 * Send a frame based on message size - compress if larger than 1024 bytes
 */
export async function sendFrame (
  ctx: MeasureContext,
  sendFn: (data: Uint8Array) => void,
  msg: Response<any> | Request<any>,
  compressFn: (input: any) => Promise<any>,
  isResponse: boolean = true
): Promise<void> {
  // Serialize the message
  const dta = rpcHandler.serialize(msg, isResponse)

  if (dta.byteLength > 1024) {
    // Compress if message is larger than 1024 bytes
    const compressed = await compressFn(dta)
    const out = new Uint8Array(1 + compressed.length)
    out[0] = FRAME_MSGPACK_SNAPPY // Use msgpack-snappy frame for compressed messages
    out.set(new Uint8Array(compressed), 1)
    sendFn(out)
  } else {
    // Send without compression for smaller messages
    const out = new Uint8Array(1 + dta.byteLength)
    out[0] = FRAME_MSGPACK // Use msgpack frame for smaller messages
    out.set(new Uint8Array(dta), 1)
    sendFn(out)
  }
}

/**
 * Send a hello frame using simple JSON serialization
 */
export function sendHelloFrame (
  sendFn: (data: Uint8Array) => void,
  msg: Response<any> | Request<any>,
  frameType: number
): void {
  // Serialize as simple JSON for hello frames
  const jsonStr = JSON.stringify(msg)
  const jsonBytes = new TextEncoder().encode(jsonStr)
  const out = new Uint8Array(1 + jsonBytes.length)
  out[0] = frameType
  out.set(jsonBytes, 1)
  sendFn(out)
}

/**
 * Handle incoming frames based on frame type
 */
export async function handleFrame (
  ctx: MeasureContext,
  u8: Uint8Array,
  handleMsg: (resp: Response<any>) => Promise<void>,
  handleRequest: (req: Request<any>) => Promise<void>,
  uncompressFn: (input: any) => Promise<any>
): Promise<void> {
  const ft = u8[0]

  if (ft === FRAME_PING) {
    // respond with pong frame
    // This would be handled by the caller
    return
  }
  if (ft === FRAME_PONG) {
    // Update ping response time
    // This would be handled by the caller
    return
  }
  if (ft === FRAME_HELLO || ft === FRAME_HELLO_RESP) {
    // Hello frames carry JSON payload (no compression)
    const payload = u8.subarray(1)
    try {
      // Parse as JSON string
      const text = new TextDecoder().decode(payload)
      const obj = JSON.parse(text)
      if (ft === FRAME_HELLO_RESP) {
        await handleMsg(obj as Response<any>)
      } else {
        // FRAME_HELLO - treat as request
        await handleRequest(obj as Request<any>)
      }
    } catch (err: any) {
      ctx.error('failed to parse hello frame', { err })
      throw err
    }
    return
  }
  if (ft === FRAME_MSGPACK) {
    // Direct msgpack frame (uncompressed)
    try {
      const resp = rpcHandler.readResponse<any>(u8.subarray(1), true)
      await handleMsg(resp)
    } catch (err: any) {
      ctx.error('failed to parse msgpack frame', { err })
      throw err
    }
    return
  }
  if (ft === FRAME_MSGPACK_SNAPPY) {
    // Body is compressed msgpack data - decompress first
    try {
      const dec = await uncompressFn(u8.subarray(1))
      let u8dec: Uint8Array
      if (Buffer.isBuffer(dec)) {
        u8dec = new Uint8Array(dec.buffer, dec.byteOffset, dec.byteLength)
      } else {
        u8dec = dec as unknown as Uint8Array
      }
      const resp = rpcHandler.readResponse<any>(u8dec, true)
      await handleMsg(resp)
    } catch (err: any) {
      ctx.error('failed to parse msgpack-snappy frame', { err })
      throw err
    }
  }
}
