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

describe('RPCHandler packing arena', () => {
  const arena = 8 * 1024 * 1024

  it('starts on a fixed arena', () => {
    expect(bufferSize(new RPCHandler(), payload(1, 16))).toBe(arena)
  })

  it('keeps the arena for traffic that fits, model-sized included', () => {
    const handler = new RPCHandler()

    // A packed model is ~1.3Mb, the largest routine message.
    handler.serialize(payload(90, 16 * 1024) as any, true)

    expect(bufferSize(handler, payload(1, 16))).toBe(arena)
  })

  it('replaces an arena an oversized message grew', () => {
    const handler = new RPCHandler()

    // The FUSIO-1344 shape: ~22Mb packed, which makeRoom serves from a 32Mb arena.
    const packed = handler.serialize(payload(1400, 16 * 1024) as any, true)
    expect(packed.length).toBeGreaterThan(20 * 1024 * 1024)

    expect(bufferSize(handler, payload(1, 16))).toBe(arena)
  })

  it('replaces it on the first step above the arena too', () => {
    const handler = new RPCHandler()

    // Growth is coarse: ~11Mb packed already takes a 32Mb arena.
    handler.serialize(payload(700, 16 * 1024) as any, true)

    expect(bufferSize(handler, payload(1, 16))).toBe(arena)
  })

  it('still packs long strings after the buffer was released', () => {
    const handler = new RPCHandler()

    handler.serialize(payload(512, 16 * 1024) as any, true)

    // msgpackr writes anything past a short string via target.utf8Write, which a plain
    // Uint8Array does not have - this is what a released buffer must not break.
    const long = { id: 9, result: { text: 'y'.repeat(4096) } }
    const wire = handler.serialize(long as any, true)
    expect(handler.readResponse(wire, true)).toEqual(long)
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
