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
import { afterEach, describe, expect, it } from 'vitest'

import { pointerFocus } from '../../ui-kit/utils/pointerFocus'

describe('pointerFocus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function setup (): {
    row: HTMLElement
    first: HTMLButtonElement
    second: HTMLButtonElement
    outside: HTMLButtonElement
    destroy: () => void
  } {
    document.body.innerHTML =
      '<div id="row"><button id="a"></button><button id="b"></button></div><button id="out"></button>'
    const row = document.getElementById('row') as HTMLElement
    const { destroy } = pointerFocus(row, 'row--pointer')
    return {
      row,
      first: document.getElementById('a') as HTMLButtonElement,
      second: document.getElementById('b') as HTMLButtonElement,
      outside: document.getElementById('out') as HTMLButtonElement,
      destroy
    }
  }

  it('marks the node on a click and keeps the mark while the focus stays inside', () => {
    const { row, first, second } = setup()
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    first.focus()
    expect(row.classList.contains('row--pointer')).toBe(true)
    second.focus()
    expect(row.classList.contains('row--pointer')).toBe(true)
  })

  it('clears the mark when the focus leaves or Tab is pressed', () => {
    const { row, first, outside } = setup()
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    first.focus()
    outside.focus()
    expect(row.classList.contains('row--pointer')).toBe(false)

    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    first.focus()
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(row.classList.contains('row--pointer')).toBe(false)
  })

  it('stops listening after destroy', () => {
    const { row, destroy } = setup()
    destroy()
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(row.classList.contains('row--pointer')).toBe(false)
  })
})
