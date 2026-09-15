//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { RPCHandler } from '../rpc'

// The packing buffer is private to msgpackr; its size is only observable through the byteLength
// of the ArrayBuffer backing a packed result.
function bufferSize (handler: RPCHandler, payload: object): number {
  return (handler.packr.pack(payload) as Uint8Array).buffer.byteLength
}

function payload (docs: number, textLen: number): object {
  const text = 'x'.repeat(textLen)
  return {
    id: 1,
    result: Array.from({ length: docs }, (_, i) => ({ _id: `doc-${i}`, _class: 'test:class:Doc', text }))
  }
}

describe('RPCHandler packing buffer', () => {
  it('releases the buffer after an oversized message', () => {
    const handler = new RPCHandler()

    handler.serialize(payload(1, 16) as any, true)
    const small = bufferSize(handler, payload(1, 16))

    // ~8Mb of payload: well past the 4Mb release threshold.
    handler.serialize(payload(512, 16 * 1024) as any, true)

    expect(bufferSize(handler, payload(1, 16))).toBeLessThanOrEqual(small)
  })

  it('keeps the buffer for ordinary messages', () => {
    const handler = new RPCHandler()

    handler.serialize(payload(64, 1024) as any, true)
    const grown = bufferSize(handler, payload(1, 16))

    expect(grown).toBeGreaterThan(8192)
  })

  it('round-trips a message that crossed the threshold', () => {
    const handler = new RPCHandler()

    const big = payload(512, 16 * 1024)
    const wire = handler.serialize({ id: 7, result: big } as any, true)
    expect(handler.readResponse(wire, true)).toEqual({ id: 7, result: big })

    // The released buffer must not break the next message.
    const wire2 = handler.serialize({ id: 8, result: { a: 1 } } as any, true)
    expect(handler.readResponse(wire2, true)).toEqual({ id: 8, result: { a: 1 } })
  })
})
