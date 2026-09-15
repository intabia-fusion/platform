//
// Copyright © 2026 Intabia Fusion.
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

import { Packr } from 'msgpackr'
import { RPCHandler } from '../rpc'

// Timing/memory based, so it stays out of regular jest runs - same BENCH=1 gate as the other benches.

/** The parts of node's process this needs - the package is isomorphic, so no @types/node. */
interface BenchProcess {
  env: Record<string, string | undefined>
  hrtime: { bigint: () => bigint }
}

const proc = (globalThis as { process?: BenchProcess }).process
const nowNs = (): bigint => proc?.hrtime.bigint() ?? 0n
const describeBench: jest.Describe = proc?.env.BENCH === '1' || proc?.env.BENCH === 'true' ? describe : describe.skip

// FUSIO-1344: one oversized response left msgpackr holding a 45.7Mb packing buffer for the life of
// the transactor, which is a third of the heap a 512Mb pod had. These numbers are what the release
// buys and what it costs on ordinary traffic.
//
// msgpackr keeps `target` at module scope (pack.js:12), so the buffer is shared by every Packr in
// the process - one handler's release gives it back for all of them, and these cases must run in
// order rather than in parallel instances.
describeBench('RPCHandler packing buffer', () => {
  const mb = 1024 * 1024

  function payload (docs: number, textLen: number): object {
    const text = 'x'.repeat(textLen)
    return {
      id: 1,
      result: Array.from({ length: docs }, (_, i) => ({
        _id: `doc-${i}`,
        _class: 'core:class:TxCUD',
        objectId: `obj-${i}`,
        modifiedOn: 1757000000000 + i,
        text
      }))
    }
  }

  /** The buffer is private to msgpackr; its size shows through the ArrayBuffer behind a result. */
  function bufferSize (packr: Packr, probe: object): number {
    return (packr.pack(probe) as Uint8Array).buffer.byteLength
  }

  function bench (name: string, iterations: number, fn: (i: number) => unknown): number {
    fn(0)
    const start = nowNs()
    for (let i = 0; i < iterations; i++) {
      fn(i)
    }
    const ns = Number(nowNs() - start) / iterations
    // eslint-disable-next-line no-console
    console.log(`${name.padEnd(34)} ${(ns / 1000).toFixed(1).padStart(9)} us/op`)
    return ns
  }

  const small = payload(1, 16)
  // ~8Mb once packed: past the 4Mb release threshold.
  const oversized = payload(512, 16 * 1024)

  it('comes back to arena size after an oversized message', () => {
    const raw = new Packr({ structuredClone: true, bundleStrings: true, copyBuffers: false })

    // Plain msgpackr first: it grows for the 8Mb message and holds on to it.
    raw.pack(oversized)
    const heldByPlain = bufferSize(raw, small)

    // The same shape through the handler comes back to the arena.
    const handler = new RPCHandler()
    handler.serialize(payload(1400, 16 * 1024) as any, true)
    const afterRelease = bufferSize(handler.packr, small)

    // eslint-disable-next-line no-console
    console.log(
      `after an 8Mb message: plain msgpackr holds ${(heldByPlain / mb).toFixed(1)}Mb, arena ${(
        afterRelease / mb
      ).toFixed(1)}Mb`
    )

    expect(heldByPlain).toBeGreaterThan(8 * mb)
    expect(afterRelease).toBe(8 * mb)
  })

  it('holds a bounded arena through a stream of large messages', () => {
    const handler = new RPCHandler()
    // Large enough to grow the arena, small enough to stay under the replace threshold.
    const large = payload(400, 16 * 1024)

    for (let i = 0; i < 20; i++) {
      handler.serialize(large as any, true)
    }
    const held = bufferSize(handler.packr, small)

    // eslint-disable-next-line no-console
    console.log(`held after a stream of ~6Mb messages: ${(held / mb).toFixed(1)}Mb`)

    // It must not ratchet upwards message after message.
    expect(held).toBeLessThanOrEqual(32 * mb)
  })

  it('costs nothing measurable on ordinary traffic', () => {
    const handler = new RPCHandler()
    const raw = new Packr({ structuredClone: true, bundleStrings: true, copyBuffers: false })
    const typical = payload(50, 256)
    const N = 20000

    const rawNs = bench('plain msgpackr pack', N, () => raw.pack(typical))
    const fixedNs = bench('RPCHandler.serialize', N, () => handler.serialize(typical as any, true))

    // serialize copies the result on top of packing; the release check itself is a length compare.
    expect(fixedNs).toBeLessThan(rawNs * 4)
  })
})
