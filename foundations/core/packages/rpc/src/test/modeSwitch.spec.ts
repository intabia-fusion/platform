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
    const packed = rpc.serialize({ ...msg }, true) as Uint8Array
    expect(packed[0]).not.toBe(0x7b)
    expect(rpc.readResponse(packed, true)).toEqual(msg)
  })
})
