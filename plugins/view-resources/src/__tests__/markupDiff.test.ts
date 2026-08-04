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

import { type MarkupNode, MarkupNodeType, jsonToPmNode } from '@hcengineering/text'

import { cleanupDiff } from '../markupDiff'

function doc (...content: MarkupNode[]): MarkupNode {
  const node: MarkupNode = { type: MarkupNodeType.doc, content }
  return node
}

function para (text: string): MarkupNode {
  const node: MarkupNode = { type: MarkupNodeType.paragraph, content: [{ type: MarkupNodeType.text, text }] }
  return node
}

function item (...content: MarkupNode[]): MarkupNode {
  const node: MarkupNode = { type: MarkupNodeType.list_item, content }
  return node
}

function list (...items: MarkupNode[]): MarkupNode {
  const node: MarkupNode = { type: MarkupNodeType.ordered_list, attrs: { start: 1 }, content: items }
  return node
}

function textOf (node: MarkupNode): string {
  const parts: string[] = []
  const walk = (n: MarkupNode): void => {
    if (n.text !== undefined) parts.push(n.text)
    for (const c of n.content ?? []) walk(c)
  }
  walk(node)
  return parts.join(' ')
}

/** the pruned result must still be a document prosemirror accepts */
function expectValid (node: MarkupNode): void {
  expect(() => {
    jsonToPmNode(node).check()
  }).not.toThrow()
}

describe('cleanupDiff', () => {
  it('keeps documents without changes intact', () => {
    const a = doc(para('lorem'), para('ipsum'))
    const [x, y] = cleanupDiff(a, a)

    expect(textOf(x)).toBe(textOf(y))
    expectValid(x)
    expectValid(y)
  })

  it('drops blocks far away from the change', () => {
    const before = doc(para('one'), para('two'), para('three'), para('four'), para('five'))
    const after = doc(para('one'), para('two'), para('three edited'), para('four'), para('five'))

    const [x] = cleanupDiff(after, before)
    expect(textOf(x)).toContain('three edited')
    expect(textOf(x)).not.toContain('five')
  })

  it('keeps context around the change', () => {
    const before = doc(para('one'), para('two'), para('three'), para('four'), para('five'))
    const after = doc(para('one'), para('two'), para('three edited'), para('four'), para('five'))

    const [x] = cleanupDiff(after, before)
    // the immediate neighbours stay so the reader can place the change
    expect(textOf(x)).toContain('two')
    expect(textOf(x)).toContain('four')
  })

  it('prunes a list down to the changed item', () => {
    const before = doc(list(item(para('a')), item(para('b')), item(para('c')), item(para('d'))))
    const after = doc(list(item(para('a')), item(para('b')), item(para('c edited')), item(para('d'))))

    const [x, y] = cleanupDiff(after, before)
    expect(textOf(x)).toContain('c edited')
    expect(textOf(x)).not.toContain('a')
    expectValid(x)
    expectValid(y)
  })

  it('preserves the original numbering of kept list items', () => {
    const before = doc(list(item(para('a')), item(para('b')), item(para('c')), item(para('d'))))
    const after = doc(list(item(para('a')), item(para('b')), item(para('c edited')), item(para('d'))))

    const [x] = cleanupDiff(after, before)
    const kept = (x.content ?? [])[0]
    // items a/b were dropped, so numbering must start where the kept ones actually sit
    expect(kept.attrs?.start).toBe(2)
  })

  // regression: a list item left holding only a nested list is invalid and breaks the diff
  it('never leaves a list item without a leading block', () => {
    const build = (edited: string): MarkupNode =>
      doc(
        list(
          item(para('outer one'), list(item(para('inner one')), item(para('inner two')))),
          item(para('outer two'), list(item(para(edited))))
        )
      )

    const [x, y] = cleanupDiff(build('changed text'), build('original text'))

    expectValid(x)
    expectValid(y)
    expect(textOf(x)).toContain('changed text')
  })

  it('handles an inserted block between lists', () => {
    const before = doc(list(item(para('a')), item(para('b'))), para('tail'))
    const after = doc(list(item(para('a')), item(para('b'))), para('inserted'), para('tail'))

    const [x, y] = cleanupDiff(after, before)
    expect(textOf(x)).toContain('inserted')
    expect(textOf(y)).not.toContain('inserted')
    expectValid(x)
    expectValid(y)
  })

  it('prunes a table down to the changed row', () => {
    const cell = (text: string): MarkupNode => ({ type: MarkupNodeType.table_cell, content: [para(text)] })
    const row = (...cells: MarkupNode[]): MarkupNode => ({ type: MarkupNodeType.table_row, content: cells })
    const table = (...rows: MarkupNode[]): MarkupNode => ({ type: MarkupNodeType.table, content: rows })

    const before = doc(table(row(cell('head one'), cell('head two')), row(cell('lorem'), cell('ipsum'))))
    const after = doc(
      table(row(cell('head one'), cell('head two')), row(cell('lorem'), cell('ipsum')), row(cell('dolor'), cell('sit')))
    )

    const [x, y] = cleanupDiff(after, before)
    expect(textOf(x)).toContain('dolor')
    // rows are never split: dropping cells would shift the rest into the wrong columns
    const keptTable = (x.content ?? [])[0]
    for (const r of keptTable.content ?? []) {
      expect((r.content ?? []).length).toBe(2)
    }
    expectValid(x)
    expectValid(y)
  })

  it('keeps only the list item adjacent to a following change', () => {
    const before = doc(list(item(para('alpha')), item(para('beta')), item(para('gamma'))), para('tail'))
    const after = doc(
      list(item(para('alpha')), item(para('beta')), item(para('gamma'))),
      para('inserted'),
      para('tail')
    )

    const [x] = cleanupDiff(after, before)
    // the whole list as context is noise, only its last item anchors the change
    expect(textOf(x)).toContain('gamma')
    expect(textOf(x)).not.toContain('alpha')
    expect(textOf(x)).toContain('inserted')
  })
})
