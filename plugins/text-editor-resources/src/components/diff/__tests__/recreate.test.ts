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

import { type MarkupNode, MarkupMarkType, MarkupNodeType, jsonToPmNode } from '@hcengineering/text'
import { ChangeSet } from '@tiptap/pm/changeset'
import { type Node as ProseMirrorNode } from '@tiptap/pm/model'

import { recreateTransform } from '../recreate'

/** what the diff viewer ends up highlighting */
interface Changes {
  inserted: string[]
  deleted: string[]
}

function changesBetween (from: MarkupNode, to: MarkupNode): Changes {
  const docA: ProseMirrorNode = jsonToPmNode(from)
  const docB: ProseMirrorNode = jsonToPmNode(to)

  const tr = recreateTransform(docA, docB)
  const changes = ChangeSet.create(docA).addSteps(tr.doc, tr.mapping.maps, undefined).changes

  const inserted: string[] = []
  const deleted: string[] = []
  for (const change of changes) {
    if (change.inserted.length > 0) {
      const text = tr.doc.textBetween(change.fromB, change.toB, ' ').trim()
      if (text !== '') inserted.push(text)
    }
    if (change.deleted.length > 0) {
      const text = docA.textBetween(change.fromA, change.toA, ' ').trim()
      if (text !== '') deleted.push(text)
    }
  }

  return { inserted, deleted }
}

function doc (...content: MarkupNode[]): MarkupNode {
  const node: MarkupNode = { type: MarkupNodeType.doc, content }
  return node
}

function para (text: string, marks?: MarkupNode['marks']): MarkupNode {
  const node: MarkupNode = { type: MarkupNodeType.paragraph, content: [{ type: MarkupNodeType.text, text, marks }] }
  return node
}

function item (...content: MarkupNode[]): MarkupNode {
  const node: MarkupNode = { type: MarkupNodeType.list_item, content }
  return node
}

function list (...items: string[]): MarkupNode {
  const node: MarkupNode = {
    type: MarkupNodeType.ordered_list,
    attrs: { start: 1 },
    content: items.map((t) => item(para(t)))
  }
  return node
}

describe('recreateTransform', () => {
  it('reports no changes for identical documents', () => {
    const a = doc(para('one'), para('two'))
    expect(changesBetween(a, a)).toEqual({ inserted: [], deleted: [] })
  })

  it('detects an appended paragraph', () => {
    const before = doc(para('one'))
    const after = doc(para('one'), para('two'))

    const { inserted, deleted } = changesBetween(before, after)
    expect(inserted.join(' ')).toContain('two')
    expect(deleted).toEqual([])
  })

  it('detects a removed paragraph', () => {
    const before = doc(para('one'), para('two'))
    const after = doc(para('one'))

    const { inserted, deleted } = changesBetween(before, after)
    expect(deleted.join(' ')).toContain('two')
    expect(inserted).toEqual([])
  })

  it('detects text appended to an existing paragraph', () => {
    const before = doc(para('base text.'))
    const after = doc(para('base text. And more.'))

    const { inserted, deleted } = changesBetween(before, after)
    expect(inserted.join(' ')).toContain('And more.')
    expect(deleted).toEqual([])
  })

  // regression: appending text to one list item must not mark other items as changed
  it('keeps untouched list items out of the diff', () => {
    const before = doc(list('first item', 'second item', 'third item'))
    const after = doc(list('first item', 'second item with more words', 'third item'))

    const { inserted, deleted } = changesBetween(before, after)
    expect(inserted.join(' ')).toContain('with more words')
    expect(inserted.join(' ')).not.toContain('third item')
    expect(deleted.join(' ')).not.toContain('third item')
    expect(deleted.join(' ')).not.toContain('first item')
  })

  it('detects an inserted list item without touching its neighbours', () => {
    const before = doc(list('alpha', 'beta'))
    const after = doc(list('alpha', 'inserted', 'beta'))

    const { inserted, deleted } = changesBetween(before, after)
    expect(inserted.join(' ')).toContain('inserted')
    expect(deleted.join(' ')).not.toContain('alpha')
    expect(deleted.join(' ')).not.toContain('beta')
  })

  it('detects a removed list item without touching its neighbours', () => {
    const before = doc(list('alpha', 'gone', 'beta'))
    const after = doc(list('alpha', 'beta'))

    const { inserted, deleted } = changesBetween(before, after)
    expect(deleted.join(' ')).toContain('gone')
    expect(inserted.join(' ')).not.toContain('alpha')
    expect(inserted.join(' ')).not.toContain('beta')
  })

  it('detects a change in a nested list', () => {
    const build = (inner: string): MarkupNode =>
      doc({
        type: MarkupNodeType.ordered_list,
        attrs: { start: 1 },
        content: [item(para('outer'), list('inner one', inner))]
      })

    const { inserted, deleted } = changesBetween(build('inner two'), build('inner two changed'))
    expect(inserted.join(' ')).toContain('changed')
    expect(deleted.join(' ')).not.toContain('inner one')
  })

  it('detects a paragraph inserted after a list', () => {
    const before = doc(list('a', 'b'), para('tail'))
    const after = doc(list('a', 'b'), para('added'), para('tail'))

    const { inserted, deleted } = changesBetween(before, after)
    expect(inserted.join(' ')).toContain('added')
    expect(deleted.join(' ')).not.toContain('tail')
  })

  it('keeps marked-up neighbours out of the diff', () => {
    // a struck-through sibling must not be reported as deleted just because it carries a mark
    const strike: MarkupNode['marks'] = [{ type: MarkupMarkType.strike, attrs: {} }]
    const before = doc(para('kept'), para('struck', strike))
    const after = doc(para('kept and extended'), para('struck', strike))

    const { inserted, deleted } = changesBetween(before, after)
    expect(inserted.join(' ')).toContain('extended')
    expect(deleted.join(' ')).not.toContain('struck')
  })

  // regression: removing an empty list item produced a change with no visible text
  it('detects a removed empty list item', () => {
    const empty: MarkupNode = { type: MarkupNodeType.paragraph, content: [] }
    const before = doc({
      type: MarkupNodeType.ordered_list,
      attrs: { start: 1 },
      content: [item(para('lorem ipsum')), item(empty)]
    })
    const after = doc({
      type: MarkupNodeType.ordered_list,
      attrs: { start: 1 },
      content: [item(para('lorem ipsum'))]
    })

    const docA = jsonToPmNode(before)
    const tr = recreateTransform(docA, jsonToPmNode(after))
    const changes = ChangeSet.create(docA).addSteps(tr.doc, tr.mapping.maps, undefined).changes

    // the deletion must be reported even though the removed node holds no text
    expect(changes.some((c) => c.deleted.length > 0)).toBe(true)
  })

  // regression: nested lists plus a marked sibling used to make recreateTransform throw
  it('handles nested lists next to a marked sibling', () => {
    const build = (edited: string): MarkupNode =>
      doc(para('Lorem ipsum', [{ type: MarkupMarkType.bold, attrs: {} }]), {
        type: MarkupNodeType.ordered_list,
        attrs: { start: 1 },
        content: [
          item(para('dolor sit amet')),
          item(para('consectetur adipiscing'), list(edited)),
          item(para('sed do eiusmod', [{ type: MarkupMarkType.strike, attrs: {} }]))
        ]
      })

    const { inserted, deleted } = changesBetween(build('tempor incididunt.'), build('tempor incididunt. Ut labore.'))

    expect(inserted.join(' ')).toContain('Ut labore.')
    expect(deleted.join(' ')).not.toContain('sed do eiusmod')
    expect(deleted.join(' ')).not.toContain('dolor sit amet')
  })
})
