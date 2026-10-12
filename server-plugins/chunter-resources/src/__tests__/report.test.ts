import activity, { type ActivityInfoMessage } from '@hcengineering/activity'
import chunter, {
  type ChatMessage,
  type ContentReportAction,
  type DirectMessage,
  type ThreadMessage
} from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import core, {
  type Collaborator,
  AccountRole,
  type AccountUuid,
  type Doc,
  type Hierarchy,
  MeasureMetricsContext,
  type PersonId,
  type Ref,
  type Space,
  type Tx,
  type TxCreateDoc,
  TxFactory,
  type TxUpdateDoc,
  systemAccountUuid,
  toFindResult
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import { OnContentReport, OnReportedMessageRemoved } from '../report'

// The trigger asks the account service for the members; by default Alice (User) and three owners.
const allMembers = [
  { person: 'acc-alice', role: 'USER' },
  { person: 'acc-bob', role: 'OWNER' },
  { person: 'acc-owner1', role: 'OWNER' },
  { person: 'acc-owner2', role: 'OWNER' }
]
let mockMembers = allMembers
jest.mock('@hcengineering/server-token', () => ({ generateToken: () => 'system-token' }))
jest.mock('@hcengineering/server-client', () => ({
  getAccountClient: () => ({
    getWorkspaceMembers: async () => mockMembers
  })
}))

const PERSON_SPACE = 'space:alice' as Ref<Space>
const CHANNEL = 'chan1' as Ref<Space>
const ALICE = 'social:alice' as PersonId
const BOB = 'social:bob' as PersonId
const OWNER1 = 'social:owner1' as PersonId
const OWNER2 = 'social:owner2' as PersonId
const ACC_ALICE = 'acc-alice' as AccountUuid
const ACC_BOB = 'acc-bob' as AccountUuid
const ACC_OWNER1 = 'acc-owner1' as AccountUuid
const ACC_OWNER2 = 'acc-owner2' as AccountUuid
const DM_OWNER2 = 'dm:owner2' as Ref<DirectMessage>

const classes = [
  chunter.class.ChatMessage,
  chunter.class.ThreadMessage,
  chunter.class.Channel,
  chunter.class.DirectMessage,
  chunter.class.ContentReportAction
]
const hierarchy = {
  hasClass: (c: Ref<any>) => classes.includes(c),
  isDerived: (c: Ref<any>, base: Ref<any>) =>
    c === base || (c === chunter.class.ThreadMessage && base === chunter.class.ChatMessage),
  // getDocTitle: no TitlePresenter mixins in the test model, the chat is named by its titleKey.
  classHierarchyMixin: () => undefined,
  getClass: () => ({ titleKey: 'name' })
} as unknown as Hierarchy

function chatMessage (fields: Partial<ChatMessage> = {}): ChatMessage {
  return {
    _id: 'msg1' as Ref<ChatMessage>,
    _class: chunter.class.ChatMessage,
    space: CHANNEL,
    attachedTo: CHANNEL,
    attachedToClass: chunter.class.Channel,
    collection: 'messages',
    message: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }]
    }),
    createdBy: BOB,
    modifiedBy: BOB,
    modifiedOn: 1,
    ...fields
  } as unknown as ChatMessage
}

// Report cards already in the owners' direct messages, for OnReportedMessageRemoved.
let infoCards: Array<Partial<ActivityInfoMessage>> = []

interface Stand {
  control: TriggerControl
  txes: Tx[]
}

/** Alice (User) reports Bob (Owner); Owner1 has no system DM yet, Owner2 already has one. */
function stand (message: ChatMessage | undefined): Stand {
  const persons = [
    { _id: 'person:alice', _class: contact.class.Person, personUuid: ACC_ALICE, name: 'Liddell,Alice' },
    { _id: 'person:bob', _class: contact.class.Person, personUuid: ACC_BOB, name: 'Builder,Bob' }
  ]
  const dms = [
    { _id: DM_OWNER2, _class: chunter.class.DirectMessage, members: [systemAccountUuid, ACC_OWNER2] },
    { _id: 'dm:bob', _class: chunter.class.DirectMessage, members: [systemAccountUuid, ACC_BOB] }
  ]
  const findAll = async (_ctx: unknown, _class: Ref<any>, query: any): Promise<any> => {
    if (_class === activity.class.ActivityInfoMessage) {
      const ids: string[] = query['props.messageId']?.$in ?? []
      return toFindResult(infoCards.filter((it) => ids.includes(it.props?.messageId)) as any)
    }
    if (_class === chunter.class.ChatMessage) {
      // The store answers a base-class query with derived docs too: a thread reply is a ChatMessage.
      return toFindResult(query._id === message?._id ? [message as ChatMessage] : [])
    }
    if (_class === chunter.class.Channel) {
      return toFindResult(
        (query._id === CHANNEL ? [{ _id: CHANNEL, _class: chunter.class.Channel, name: 'general' }] : []) as any
      )
    }
    if (_class === contact.class.Person) {
      return toFindResult(persons.filter((it) => it.personUuid === query.personUuid) as any)
    }
    if (_class === core.class.Collaborator) {
      // Owner2's direct message already has its collaborators, Bob's lost them.
      return toFindResult(
        query.attachedTo?.$in?.includes(DM_OWNER2) === true
          ? ([
              { attachedTo: DM_OWNER2, collaborator: systemAccountUuid },
              { attachedTo: DM_OWNER2, collaborator: ACC_OWNER2 }
            ] as any)
          : []
      )
    }
    if (_class === chunter.class.DirectMessage) {
      if (query._id === 'dm:alice-bob') {
        return toFindResult([
          { _id: 'dm:alice-bob', _class: chunter.class.DirectMessage, members: [ACC_ALICE, ACC_BOB] }
        ] as any)
      }
      return toFindResult(dms.filter((it) => it.members.includes(query.members)) as any)
    }
    if (String(_class) === 'attachment:class:Attachment') {
      return toFindResult((query.attachedTo === 'msg1' ? [{ name: 'a.pdf' }, { name: 'b.png' }] : []) as any)
    }
    return toFindResult([])
  }
  const ctx = new MeasureMetricsContext('test', {})
  ;(ctx as any).contextData = {
    account: { uuid: ACC_ALICE, socialIds: [ALICE] },
    socialStringsToUsers: new Map([
      [ALICE, { accountUuid: ACC_ALICE, role: AccountRole.User }],
      [BOB, { accountUuid: ACC_BOB, role: AccountRole.Owner }],
      [OWNER1, { accountUuid: ACC_OWNER1, role: AccountRole.Owner }],
      [OWNER2, { accountUuid: ACC_OWNER2, role: AccountRole.Owner }]
    ])
  }
  const control = {
    ctx,
    hierarchy,
    findAll,
    workspace: { url: 'ws1', uuid: 'ws-1' },
    txFactory: new TxFactory(core.account.System)
  } as unknown as TriggerControl
  return { control, txes: [] }
}

function request (attrs: Record<string, any>): TxCreateDoc<ContentReportAction> {
  return new TxFactory(ALICE).createTxCreateDoc(chunter.class.ContentReportAction, PERSON_SPACE, attrs as any)
}

function cards (txes: Tx[]): Array<TxCreateDoc<ActivityInfoMessage>> {
  return txes.filter(
    (tx) =>
      tx._class === core.class.TxCreateDoc &&
      (tx as TxCreateDoc<Doc>).objectClass === activity.class.ActivityInfoMessage
  ) as Array<TxCreateDoc<ActivityInfoMessage>>
}

function collaborators (txes: Tx[]): string[] {
  const collabs = txes.filter(
    (tx) => tx._class === core.class.TxCreateDoc && (tx as TxCreateDoc<Doc>).objectClass === core.class.Collaborator
  ) as Array<TxCreateDoc<Collaborator>>
  return collabs.map((tx) => `${tx.attributes.attachedTo}:${tx.attributes.collaborator}`).sort()
}

describe('OnContentReport', () => {
  beforeEach(() => {
    mockMembers = allMembers
  })

  it('drops a system card into each owner direct message, skipping the reporter and the reported owner', async () => {
    const s = stand(chatMessage())
    const req = request({ messageId: 'msg1', reason: 'abuse' })
    const txes = await OnContentReport([req], s.control)

    const newDms = txes.filter(
      (tx) =>
        tx._class === core.class.TxCreateDoc && (tx as TxCreateDoc<Doc>).objectClass === chunter.class.DirectMessage
    ) as Array<TxCreateDoc<DirectMessage>>
    expect(newDms).toHaveLength(1)
    expect(newDms[0].attributes.members).toEqual([systemAccountUuid, ACC_OWNER1])

    const created = cards(txes)
    // Bob is an owner too, but the other owners handle a report on him.
    expect(created.map((tx) => tx.attributes.attachedTo).sort()).toEqual([DM_OWNER2, newDms[0].objectId].sort())
    for (const card of created) {
      expect(card.modifiedBy).toBe(core.account.System)
      expect(card.attributes.message).toBe(chunter.string.ContentReport)
      expect(card.attributes.props).toMatchObject({
        reason: 'abuse',
        reporter: ACC_ALICE,
        reporterName: 'Alice Liddell',
        author: ACC_BOB,
        authorName: 'Bob Builder',
        chat: CHANNEL,
        chatClass: chunter.class.Channel,
        chatName: 'general',
        messageId: 'msg1',
        quote: 'hello world',
        attachments: ['a.pdf', 'b.png']
      })
      expect(card.attributes.props?.link).toContain('workbench/ws1/chunter/chan1?message=msg1')
      expect(card.attributes.links).toEqual([{ _class: chunter.class.ChatMessage, _id: 'msg1' }])
      const markup = JSON.parse(card.attributes.markup ?? '')
      expect(JSON.stringify(markup)).toContain('"type":"reference"')
      expect(JSON.stringify(markup)).toContain('person:bob')
      // Reporter and author are both named, labelled, in that order.
      expect(JSON.stringify(markup).indexOf('person:alice')).toBeLessThan(JSON.stringify(markup).indexOf('person:bob'))
    }

    expect(txes.some((tx) => tx._class === core.class.TxRemoveDoc)).toBe(false)

    // Collaborators come from this trigger, the contact one ignores derived creates: both members of the
    // new direct message, none for Owner2 who has them.
    expect(collaborators(txes)).toEqual(
      [`${newDms[0].objectId}:${systemAccountUuid}`, `${newDms[0].objectId}:${ACC_OWNER1}`].sort()
    )
  })

  it('still sends a report on the only owner to that owner', async () => {
    mockMembers = allMembers.filter((m) => m.person === 'acc-alice' || m.person === 'acc-bob')
    const s = stand(chatMessage())
    const txes = await OnContentReport([request({ messageId: 'msg1', reason: 'abuse' })], s.control)
    expect(cards(txes).map((tx) => tx.attributes.attachedTo)).toEqual(['dm:bob'])
    // Bob's direct message lost its collaborators: the trigger restores the missing ones.
    expect(collaborators(txes)).toEqual([`dm:bob:${systemAccountUuid}`, `dm:bob:${ACC_BOB}`].sort())
  })

  it('maps an unknown reason to other', async () => {
    const s = stand(chatMessage())
    const txes = await OnContentReport([request({ messageId: 'msg1', reason: 'nope' })], s.control)
    expect(cards(txes).every((c) => c.attributes.props?.reason === 'other')).toBe(true)
  })

  it('does nothing when the message is gone', async () => {
    const s = stand(undefined)
    const txes = await OnContentReport([request({ messageId: 'msg1', reason: 'spam' })], s.control)
    expect(txes).toEqual([])
  })

  it('links a thread reply through its parent', async () => {
    const reply = chatMessage({
      _id: 'reply1' as Ref<ChatMessage>,
      _class: chunter.class.ThreadMessage,
      attachedTo: 'msg1' as Ref<ChatMessage>,
      attachedToClass: chunter.class.ChatMessage,
      objectId: CHANNEL,
      objectClass: chunter.class.Channel
    } as unknown as Partial<ThreadMessage> as Partial<ChatMessage>)
    const s = stand(reply)
    const txes = await OnContentReport([request({ messageId: 'reply1', reason: 'spam' })], s.control)
    const created = cards(txes)
    expect(created.length).toBeGreaterThan(0)
    expect(created[0].attributes.props?.link).toContain('workbench/ws1/chunter/chan1/msg1?message=reply1')
    expect(created[0].attributes.props?.chatName).toBe('general')
  })

  it('reports a person without quoting anything', async () => {
    const s = stand(undefined)
    const txes = await OnContentReport([request({ account: ACC_BOB, reason: 'abuse' })], s.control)
    const created = cards(txes)
    // Owner1 and Owner2; Bob is the one reported.
    expect(created).toHaveLength(2)
    for (const card of created) {
      expect(card.attributes.props).toMatchObject({
        kind: 'person',
        reason: 'abuse',
        reporter: ACC_ALICE,
        author: ACC_BOB,
        authorName: 'Bob Builder'
      })
      expect(card.attributes.props?.messageId).toBeUndefined()
      expect(card.attributes.links).toEqual([])
      expect(JSON.stringify(JSON.parse(card.attributes.markup ?? ''))).toContain('person:bob')
    }
  })

  it('accepts a message from a direct message - the clients hide the action there, the server does not judge', async () => {
    const s = stand(
      chatMessage({ attachedTo: 'dm:alice-bob' as Ref<Space>, attachedToClass: chunter.class.DirectMessage })
    )
    const txes = await OnContentReport([request({ messageId: 'msg1', reason: 'spam' })], s.control)
    expect(cards(txes).length).toBeGreaterThan(0)
    expect(cards(txes)[0].attributes.props?.chatClass).toBe(chunter.class.DirectMessage)
  })

  it('ignores a report on a non-member account', async () => {
    const s = stand(undefined)
    const txes = await OnContentReport([request({ account: 'acc-stranger', reason: 'spam' })], s.control)
    expect(txes).toEqual([])
  })

  it('strips messageId from the cards of a deleted message, leaving the others alone', async () => {
    const s = stand(chatMessage())
    infoCards = [
      {
        _id: 'card1' as Ref<ActivityInfoMessage>,
        space: DM_OWNER2,
        props: { kind: 'message', messageId: 'msg1', quote: 'hello world', reason: 'spam' }
      },
      {
        _id: 'card2' as Ref<ActivityInfoMessage>,
        space: DM_OWNER2,
        props: { kind: 'message', messageId: 'other', quote: 'x', reason: 'spam' }
      },
      { _id: 'card3' as Ref<ActivityInfoMessage>, space: DM_OWNER2, props: { kind: 'person', reason: 'abuse' } }
    ]
    try {
      const remove = new TxFactory(ALICE).createTxRemoveDoc(
        chunter.class.ChatMessage,
        CHANNEL,
        'msg1' as Ref<ChatMessage>
      )
      const txes = await OnReportedMessageRemoved([remove], s.control)
      expect(txes).toHaveLength(1)
      const update = txes[0] as TxUpdateDoc<ActivityInfoMessage>
      expect(update._class).toBe(core.class.TxUpdateDoc)
      expect(update.objectId).toBe('card1')
      expect(update.modifiedBy).toBe(core.account.System)
      expect(update.operations.props).toEqual({ kind: 'message', quote: 'hello world', reason: 'spam' })
    } finally {
      infoCards = []
    }
  })
})
