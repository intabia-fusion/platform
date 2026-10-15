//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { RPCHandler } from '../rpc'

describe('RPCHandler mode switch', () => {
  const rpc = new RPCHandler()
  const msg = { id: 1, result: { name: 'x', items: [1, 2, 3], when: 1700000000000 } }

  it('reads a JSON frame that arrives after the switch to binary', () => {
    const json = new TextEncoder().encode(rpc.serialize({ ...msg }, false))
    expect(rpc.readResponse(json, true)).toEqual(msg)
  })

  it('never mistakes a msgpack message for JSON', () => {
    const shapes: any[] = [
      msg,
      { id: -1, result: 'hello', binary: true },
      { id: 2, error: { code: 'x' } },
      { id: 3, result: [1, 2] },
      { id: 4, result: 123 }
    ]
    // Twice each: a repeated shape is where a packr reusing its records could start with the record id.
    for (const shape of [...shapes, ...shapes]) {
      const packed = rpc.serialize({ ...shape }, true) as Uint8Array
      expect(packed[0]).not.toBe(0x7b)
      expect(rpc.readResponse(packed, true)).toEqual(shape)
    }
  })
})
