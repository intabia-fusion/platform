/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const { GO_CRASH } = require('../phases/build')

// Verbatim from pipeline 57371, where tsgo died on a different package each run.
const SEGFAULT = `unexpected fault address 0x3dd607931a88
fatal error: fault
[signal SIGSEGV: segmentation violation code=0x1 addr=0x3dd607931a88 pc=0x6862a5]

goroutine 3352 gp=0x3dd7072ffc20 m=11 mp=0x3dd70773e008 [running]:
runtime.throw({0xfdfe0a?, 0x3dd709aad2e0?})`

const PANIC = `panic: runtime error: index out of range [4294968347] with length 2799 [recovered, repanicked]

goroutine 1566 [running]:
sync.(*WaitGroup).Go.func1.1()`

const TYPE_ERROR = `src/index.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/index.ts(40,1): error TS2554: Expected 2 arguments, but got 1.`

describe('GO_CRASH', () => {
  test('matches a tsgo segfault', () => {
    assert.ok(GO_CRASH.test(SEGFAULT))
  })

  test('matches a tsgo panic', () => {
    assert.ok(GO_CRASH.test(PANIC))
  })

  test('leaves plain type errors alone', () => {
    assert.ok(!GO_CRASH.test(TYPE_ERROR))
  })

  test('leaves an empty output alone', () => {
    assert.ok(!GO_CRASH.test(''))
  })
})
