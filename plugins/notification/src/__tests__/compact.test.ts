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

import core, { type Class, type Doc, type Hierarchy, type Ref } from '@hcengineering/core'
import activity, {
  type ActivityMessage,
  type DocAttributeUpdates,
  type DocUpdateMessage
} from '@hcengineering/activity'

import {
  EMBEDDED_TEXT_PLACEHOLDER,
  EMBEDDED_MARKUP_LIMIT,
  EMBEDDED_EXCERPT_LENGTH,
  isTextAttributeUpdate,
  isCompactAttributeUpdates,
  compactAttributeUpdates,
  compactNotificationMessage,
  excerptMarkup,
  needsMessageCompaction,
  getUnreadMessagesTotal
} from '../utils'
import {
  collapseUnreadMessages,
  appendAndCollapseUnreadMessages,
  UNREAD_MESSAGES_FLAT_LIMIT,
  UNREAD_MESSAGES_TAIL
} from '../collapse'
import { type UnreadMessage, type UnreadMessageId } from '../types'

type HierarchyStub = Pick<Hierarchy, 'isDerived' | 'findAttribute'>

function makeHierarchy (
  typeClass: string | undefined,
  opts?: { throwOnFind?: boolean, isDerivedResult?: boolean }
): HierarchyStub {
  return {
    isDerived: ((_c: Ref<Class<Doc>>, _p: Ref<Class<Doc>>) => opts?.isDerivedResult ?? true) as Hierarchy['isDerived'],
    findAttribute: ((_cls: Ref<Class<Doc>>, _key: string) => {
      if (opts?.throwOnFind === true) {
        throw new Error('no such class')
      }
      if (typeClass === undefined) return undefined
      return { type: { _class: typeClass } } as any
    }) as Hierarchy['findAttribute']
  }
}

function makeAttributeUpdates (overrides: Partial<DocAttributeUpdates> = {}): DocAttributeUpdates {
  return {
    attrKey: 'description',
    attrClass: core.class.TypeString,
    set: ['hello'],
    prevValue: undefined,
    added: [],
    removed: [],
    isMixin: false,
    ...overrides
  }
}

describe('isTextAttributeUpdate', () => {
  it('is true when the model attribute type is TypeMarkup', () => {
    const hierarchy = makeHierarchy(core.class.TypeMarkup)
    const updates = makeAttributeUpdates({ attrClass: core.class.TypeString })
    expect(isTextAttributeUpdate(hierarchy as Hierarchy, 'some:class' as Ref<Class<Doc>>, updates)).toBe(true)
  })

  it('is true when the model attribute type is TypeCollaborativeDoc', () => {
    const hierarchy = makeHierarchy(core.class.TypeCollaborativeDoc)
    const updates = makeAttributeUpdates({ attrClass: core.class.TypeString })
    expect(isTextAttributeUpdate(hierarchy as Hierarchy, 'some:class' as Ref<Class<Doc>>, updates)).toBe(true)
  })

  it('is true when findAttribute returns undefined but attrClass is TypeMarkup (collaborator DUM)', () => {
    const hierarchy = makeHierarchy(undefined)
    const updates = makeAttributeUpdates({ attrClass: core.class.TypeMarkup })
    expect(isTextAttributeUpdate(hierarchy as Hierarchy, 'some:class' as Ref<Class<Doc>>, updates)).toBe(true)
  })

  it('is false for TypeString', () => {
    const hierarchy = makeHierarchy(core.class.TypeString)
    const updates = makeAttributeUpdates({ attrClass: core.class.TypeString })
    expect(isTextAttributeUpdate(hierarchy as Hierarchy, 'some:class' as Ref<Class<Doc>>, updates)).toBe(false)
  })

  it('is false when findAttribute throws and attrClass is TypeString', () => {
    const hierarchy = makeHierarchy(undefined, { throwOnFind: true })
    const updates = makeAttributeUpdates({ attrClass: core.class.TypeString })
    expect(isTextAttributeUpdate(hierarchy as Hierarchy, 'some:class' as Ref<Class<Doc>>, updates)).toBe(false)
  })
})

describe('compactAttributeUpdates', () => {
  it('turns non-empty strings in set into the placeholder', () => {
    const updates = makeAttributeUpdates({ set: ['hello world'] })
    const result = compactAttributeUpdates(updates)
    expect(result.set).toEqual([EMBEDDED_TEXT_PLACEHOLDER])
  })

  it('keeps null/empty-string entries in set as-is', () => {
    const updates = makeAttributeUpdates({ set: [null, ''] })
    const result = compactAttributeUpdates(updates)
    expect(result.set).toEqual([null, ''])
  })

  it('compacts a non-empty prevValue to the placeholder', () => {
    const updates = makeAttributeUpdates({ prevValue: 'previous text' })
    const result = compactAttributeUpdates(updates)
    expect(result.prevValue).toBe(EMBEDDED_TEXT_PLACEHOLDER)
  })

  it('leaves an undefined prevValue undefined', () => {
    const updates = makeAttributeUpdates({ prevValue: undefined })
    const result = compactAttributeUpdates(updates)
    expect(result.prevValue).toBeUndefined()
  })

  it('leaves added/removed/attrKey/attrClass/isMixin untouched', () => {
    const updates = makeAttributeUpdates({
      attrKey: 'myKey',
      attrClass: 'some:class' as Ref<Class<Doc>>,
      added: ['a', 1],
      removed: ['b', null],
      isMixin: true
    })
    const result = compactAttributeUpdates(updates)
    expect(result.attrKey).toBe('myKey')
    expect(result.attrClass).toBe('some:class')
    expect(result.added).toEqual(['a', 1])
    expect(result.removed).toEqual(['b', null])
    expect(result.isMixin).toBe(true)
  })

  it('does not mutate the input object', () => {
    const updates = makeAttributeUpdates({ set: ['hello'], prevValue: 'world' })
    const clone = JSON.parse(JSON.stringify(updates))
    compactAttributeUpdates(updates)
    expect(updates).toEqual(clone)
  })
})

describe('isCompactAttributeUpdates', () => {
  it('is true after compaction', () => {
    const updates = makeAttributeUpdates({ set: ['hello world'], prevValue: 'previous' })
    expect(isCompactAttributeUpdates(compactAttributeUpdates(updates))).toBe(true)
  })

  it('is false before compaction', () => {
    const updates = makeAttributeUpdates({ set: ['hello world'], prevValue: 'previous' })
    expect(isCompactAttributeUpdates(updates)).toBe(false)
  })

  it('is true for an empty set and undefined prevValue', () => {
    const updates = makeAttributeUpdates({ set: [], prevValue: undefined })
    expect(isCompactAttributeUpdates(updates)).toBe(true)
  })
})

describe('compactNotificationMessage', () => {
  function makeDocUpdateMessage (attributeUpdates?: DocAttributeUpdates): ActivityMessage {
    return {
      _id: 'msg1' as Ref<Doc>,
      _class: activity.class.DocUpdateMessage,
      objectId: 'obj1' as Ref<Doc>,
      objectClass: 'tracker:class:Issue' as Ref<Class<Doc>>,
      attachedTo: 'obj1' as Ref<Doc>,
      action: 'update',
      history: [],
      attributeUpdates,
      editedOn: 12345,
      replies: 3,
      repliedPersons: ['p1'],
      reactions: [{ emoji: '+1' }],
      isPinned: true,
      lastReply: 999
    } as unknown as ActivityMessage
  }

  it('strips editedOn, replies, repliedPersons, reactions, isPinned, lastReply', () => {
    const hierarchy = makeHierarchy(core.class.TypeString, { isDerivedResult: false })
    const message = makeDocUpdateMessage(makeAttributeUpdates({ attrClass: core.class.TypeString }))
    const result = compactNotificationMessage(message, hierarchy as Hierarchy) as any
    expect(result.editedOn).toBeUndefined()
    expect(result.replies).toBeUndefined()
    expect(result.repliedPersons).toBeUndefined()
    expect(result.reactions).toBeUndefined()
    expect(result.isPinned).toBeUndefined()
    expect(result.lastReply).toBeUndefined()
  })

  it('compacts attributeUpdates for a DUM with a markup attribute, preserving other fields', () => {
    const hierarchy = makeHierarchy(core.class.TypeMarkup, { isDerivedResult: true })
    const attributeUpdates = makeAttributeUpdates({
      attrClass: core.class.TypeString,
      set: ['full markup body'],
      prevValue: 'previous body'
    })
    const message = makeDocUpdateMessage(attributeUpdates)
    const result = compactNotificationMessage(message, hierarchy as Hierarchy) as unknown as DocUpdateMessage

    expect(result.attributeUpdates?.set).toEqual([EMBEDDED_TEXT_PLACEHOLDER])
    expect(result.attributeUpdates?.prevValue).toBe(EMBEDDED_TEXT_PLACEHOLDER)

    expect(result.objectId).toBe('obj1')
    expect(result.objectClass).toBe('tracker:class:Issue')
    expect(result.action).toBe('update')
    expect((result as any).attachedTo).toBe('obj1')
  })

  it('leaves attributeUpdates unchanged for a DUM with a TypeString attribute', () => {
    const hierarchy = makeHierarchy(core.class.TypeString, { isDerivedResult: true })
    const attributeUpdates = makeAttributeUpdates({ attrClass: core.class.TypeString, set: ['plain text'] })
    const message = makeDocUpdateMessage(attributeUpdates)
    const result = compactNotificationMessage(message, hierarchy as Hierarchy) as unknown as DocUpdateMessage

    expect(result.attributeUpdates).toEqual(attributeUpdates)
  })

  it('leaves the message field untouched for a ChatMessage (not derived from DocUpdateMessage)', () => {
    const hierarchy = makeHierarchy(core.class.TypeMarkup, { isDerivedResult: false })
    const chatMessage = {
      _id: 'msg2' as Ref<Doc>,
      _class: 'chunter:class:ChatMessage' as Ref<Class<Doc>>,
      message: '<p>hello world</p>',
      editedOn: 111
    } as unknown as ActivityMessage

    const result = compactNotificationMessage(chatMessage, hierarchy as Hierarchy) as any
    expect(result.message).toBe('<p>hello world</p>')
  })

  it('does not mutate the original message', () => {
    const hierarchy = makeHierarchy(core.class.TypeMarkup, { isDerivedResult: true })
    const attributeUpdates = makeAttributeUpdates({
      attrClass: core.class.TypeString,
      set: ['full markup body'],
      prevValue: 'previous body'
    })
    const message = makeDocUpdateMessage(attributeUpdates)
    const snapshot = JSON.parse(JSON.stringify(message))

    compactNotificationMessage(message, hierarchy as Hierarchy)

    expect(JSON.parse(JSON.stringify(message))).toEqual(snapshot)
  })
})

describe('excerptMarkup', () => {
  it('keeps the structure, marks and mention of a long multi-paragraph markup and ends with an ellipsis', () => {
    const paragraphText = 'word '.repeat(200).trim()
    const markup = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'reference', attrs: { label: 'John Doe' } },
            { type: 'text', text: ', please ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'review this:' }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Section' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: paragraphText }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'never reached' }]
        }
      ]
    })

    const parsed = JSON.parse(excerptMarkup(markup))

    // The first paragraph and the heading fit and are kept as they were, marks included.
    expect(parsed.content[0]).toEqual(JSON.parse(markup).content[0])
    expect(parsed.content[1]).toEqual(JSON.parse(markup).content[1])
    // The long paragraph is cut inside its text node, later nodes are dropped.
    expect(parsed.content).toHaveLength(3)
    const cut: string = parsed.content[2].content[0].text
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThan(paragraphText.length)
    const total = parsed.content
      .flatMap((n: any) => n.content)
      .reduce((acc: number, n: any) => acc + (n.text?.length ?? 1), 0)
    expect(total).toBeLessThanOrEqual(EMBEDDED_EXCERPT_LENGTH + 1)
  })

  it('adds an ellipsis paragraph when the cut falls between nodes', () => {
    const markup = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(EMBEDDED_EXCERPT_LENGTH) }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'dropped' }] }
      ]
    })
    const parsed = JSON.parse(excerptMarkup(markup))
    expect(parsed.content).toHaveLength(2)
    expect(parsed.content[0].content[0].text).toBe('x'.repeat(EMBEDDED_EXCERPT_LENGTH))
    expect(parsed.content[1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: '…' }] })
  })

  it('leaves a short markup untouched', () => {
    const markup = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'short', marks: [{ type: 'italic' }] }] }]
    })
    expect(JSON.parse(excerptMarkup(markup))).toEqual(JSON.parse(markup))
  })

  it('treats invalid JSON input as plain text', () => {
    const result = excerptMarkup('not { valid json')
    const parsed = JSON.parse(result)
    expect(parsed.content[0].content[0].text).toBe('not { valid json')
  })

  it('truncates plain text over the limit and appends an ellipsis', () => {
    const longText = 'a'.repeat(EMBEDDED_EXCERPT_LENGTH + 100)
    const result = excerptMarkup(longText)
    const parsed = JSON.parse(result)
    const text: string = parsed.content[0].content[0].text
    expect(text.endsWith('…')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(EMBEDDED_EXCERPT_LENGTH + 1)
  })
})

describe('needsMessageCompaction', () => {
  it('is false for undefined', () => {
    expect(needsMessageCompaction(makeHierarchy(core.class.TypeString) as Hierarchy, undefined)).toBe(false)
  })

  it('is false for a short chat message', () => {
    const hierarchy = makeHierarchy(core.class.TypeString, { isDerivedResult: false })
    const message = { _class: 'chunter:class:ChatMessage' as Ref<Class<Doc>>, message: 'short message' }
    expect(needsMessageCompaction(hierarchy as Hierarchy, message)).toBe(false)
  })

  it('is true for a chat message longer than EMBEDDED_MARKUP_LIMIT', () => {
    const hierarchy = makeHierarchy(core.class.TypeString, { isDerivedResult: false })
    const message = {
      _class: 'chunter:class:ChatMessage' as Ref<Class<Doc>>,
      message: 'a'.repeat(EMBEDDED_MARKUP_LIMIT + 1)
    }
    expect(needsMessageCompaction(hierarchy as Hierarchy, message)).toBe(true)
  })

  it('is true for a DocUpdateMessage with a not-yet-compacted text attribute update', () => {
    const hierarchy = makeHierarchy(core.class.TypeMarkup, { isDerivedResult: true })
    const message = {
      _class: activity.class.DocUpdateMessage,
      objectClass: 'tracker:class:Issue' as Ref<Class<Doc>>,
      attributeUpdates: makeAttributeUpdates({ attrClass: core.class.TypeString, set: ['full body'] })
    }
    expect(needsMessageCompaction(hierarchy as Hierarchy, message)).toBe(true)
  })

  it('is false for a DocUpdateMessage whose text attribute update is already compacted', () => {
    const hierarchy = makeHierarchy(core.class.TypeMarkup, { isDerivedResult: true })
    const message = {
      _class: activity.class.DocUpdateMessage,
      objectClass: 'tracker:class:Issue' as Ref<Class<Doc>>,
      attributeUpdates: makeAttributeUpdates({
        attrClass: core.class.TypeString,
        set: [EMBEDDED_TEXT_PLACEHOLDER],
        prevValue: EMBEDDED_TEXT_PLACEHOLDER
      })
    }
    expect(needsMessageCompaction(hierarchy as Hierarchy, message)).toBe(false)
  })
})

describe('compactNotificationMessage excerpting oversized chat messages', () => {
  function makeChatMessage (message: string): ActivityMessage {
    return {
      _id: 'msg3' as Ref<Doc>,
      _class: 'chunter:class:ChatMessage' as Ref<Class<Doc>>,
      message
    } as unknown as ActivityMessage
  }

  it('leaves a short chat message untouched (same string)', () => {
    const hierarchy = makeHierarchy(core.class.TypeString, { isDerivedResult: false })
    const shortMessage = '<p>hello world</p>'
    const chatMessage = makeChatMessage(shortMessage)

    const result = compactNotificationMessage(chatMessage, hierarchy as Hierarchy) as any

    expect(result.message).toBe(shortMessage)
  })

  it('replaces a message longer than EMBEDDED_MARKUP_LIMIT with a valid markup excerpt', () => {
    const hierarchy = makeHierarchy(core.class.TypeString, { isDerivedResult: false })
    const longMarkup = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(EMBEDDED_MARKUP_LIMIT + 1) }] }]
    })
    const chatMessage = makeChatMessage(longMarkup)

    const result = compactNotificationMessage(chatMessage, hierarchy as Hierarchy) as any

    expect(result.message).not.toBe(longMarkup)
    const parsed = JSON.parse(result.message)
    expect(parsed).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: expect.any(String) }]
        }
      ]
    })
    expect(parsed.content[0].content.length).toBe(1)
    expect(parsed.content[0].content[0].text.endsWith('…')).toBe(true)
  })
})

describe('collapse re-export sanity (getUnreadMessagesTotal / collapseUnreadMessages)', () => {
  it('counts ids as 1 and chunks by count', () => {
    const ids: UnreadMessage[] = [
      { id: 'a' as any, createdOn: 1 },
      { id: 'b' as any, createdOn: 2 }
    ]
    expect(getUnreadMessagesTotal(ids)).toBe(2)

    const withChunk: UnreadMessage[] = [...ids, { from: 1, to: 2, count: 5 }]
    expect(getUnreadMessagesTotal(withChunk)).toBe(7)
  })

  it('keeps a <=100 flat array untouched by reference', () => {
    const unreads: UnreadMessage[] = Array.from({ length: UNREAD_MESSAGES_FLAT_LIMIT }, (_, i) => ({
      id: `msg-${i}` as any,
      createdOn: 1000 + i
    }))
    const result = collapseUnreadMessages(unreads)
    expect(result).toBe(unreads)
  })

  it('collapses a 150-entry flat array into chunks plus a 20-entry flat tail', () => {
    const unreads: UnreadMessage[] = Array.from({ length: 150 }, (_, i) => ({
      id: `msg-${i}` as any,
      createdOn: 1000 + i
    }))
    const result = collapseUnreadMessages(unreads)

    expect(result.length).toBeLessThan(150)
    expect(getUnreadMessagesTotal(result)).toBe(150)

    const tail = result.slice(-UNREAD_MESSAGES_TAIL)
    expect(tail).toHaveLength(UNREAD_MESSAGES_TAIL)
    expect(tail.every((it) => 'id' in it)).toBe(true)

    const head = result.slice(0, result.length - UNREAD_MESSAGES_TAIL)
    expect(head.some((it) => 'count' in it)).toBe(true)
  })

  it('appendAndCollapseUnreadMessages reports didCollapse correctly', () => {
    const unreads: UnreadMessage[] = Array.from({ length: UNREAD_MESSAGES_FLAT_LIMIT }, (_, i) => ({
      id: `msg-${i}` as any,
      createdOn: 1000 + i
    }))
    const newMessage: UnreadMessageId = { id: 'new' as any, createdOn: 2000 }
    const { collapsed, didCollapse } = appendAndCollapseUnreadMessages(unreads, newMessage)
    expect(didCollapse).toBe(true)
    expect(collapsed.length).toBeLessThan(unreads.length + 1)
  })
})
