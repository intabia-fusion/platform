import core, { type AccountUuid, type Ref, type Doc, systemAccountUuid, TxFactory } from '@hcengineering/core'
import chunter from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import { ChunterMiddleware } from '../middleware'

const OTHER = 'other-account' as AccountUuid

const USER = 'user-account' as AccountUuid
const USER_ID = 'social:user'
const INFO = 'activity:class:ActivityInfoMessage' as Ref<any>
const CARD = 'card-1' as Ref<Doc>

/** Runs the private onInfoMessage with stubbed storage; `existing` is what findAll answers for updates. */
async function onInfoMessage (
  actor: { uuid: AccountUuid, trigger?: boolean },
  tx: unknown,
  existing: unknown[] = []
): Promise<void> {
  const middleware = Object.create(ChunterMiddleware.prototype)
  middleware.findAll = async () => existing
  const ctx = { contextData: { account: { uuid: actor.uuid }, isTriggerCtx: actor.trigger } }
  await middleware.onInfoMessage(ctx, tx)
}

const factory = new TxFactory(USER_ID as any)
const card = (attachedToClass: Ref<any>): unknown =>
  factory.createTxCreateDoc(
    INFO,
    'dm-1' as Ref<any>,
    {
      attachedTo: 'dm-1',
      attachedToClass,
      collection: 'activity',
      message: chunter.string.ContentReport,
      props: {}
    } as any
  )

describe('onInfoMessage', () => {
  it('refuses a user-made card anywhere', async () => {
    await expect(onInfoMessage({ uuid: USER }, card(chunter.class.DirectMessage))).rejects.toThrow()
    await expect(onInfoMessage({ uuid: USER }, card(contact.class.PersonSpace))).rejects.toThrow()
  })
  it('lets the trigger and the system account write cards', async () => {
    await expect(
      onInfoMessage({ uuid: USER, trigger: true }, card(chunter.class.DirectMessage))
    ).resolves.toBeUndefined()
    await expect(onInfoMessage({ uuid: systemAccountUuid }, card(chunter.class.DirectMessage))).resolves.toBeUndefined()
  })
  it('ignores other info messages', async () => {
    const other = factory.createTxCreateDoc(
      INFO,
      'dm-1' as Ref<any>,
      {
        attachedTo: 'dm-1',
        attachedToClass: chunter.class.DirectMessage,
        collection: 'activity',
        message: 'love:string:MeetingStarted',
        props: {}
      } as any
    )
    await expect(onInfoMessage({ uuid: USER }, other)).resolves.toBeUndefined()
  })
  it('refuses a user editing a card or turning a message into one', async () => {
    const edit = factory.createTxUpdateDoc(INFO, 'dm-1' as Ref<any>, CARD, { props: { quote: 'x' } } as any)
    await expect(
      onInfoMessage({ uuid: USER }, edit, [{ _id: CARD, message: chunter.string.ContentReport }])
    ).rejects.toThrow()
    const turn = factory.createTxUpdateDoc(INFO, 'dm-1' as Ref<any>, CARD, {
      message: chunter.string.ContentReport
    } as any)
    await expect(onInfoMessage({ uuid: USER }, turn, [{ _id: CARD, message: 'x' }])).rejects.toThrow()
    const plain = factory.createTxUpdateDoc(INFO, 'dm-1' as Ref<any>, CARD, { props: { a: 1 } } as any)
    await expect(
      onInfoMessage({ uuid: USER }, plain, [{ _id: CARD, message: 'love:string:MeetingStarted' }])
    ).resolves.toBeUndefined()
  })
})

const ENABLED = [{ _id: chunter.ids.ContentReportsConfiguration, enabled: true }]

/** Runs the private onReportAction with stubbed storage: `spaces` and `configs` are what findAll answers. */
async function onReportAction (
  actor: AccountUuid,
  space: string,
  spaces: unknown[],
  configs: unknown[] = ENABLED
): Promise<void> {
  const middleware = Object.create(ChunterMiddleware.prototype)
  middleware.findAll = async (_ctx: unknown, _class: unknown) =>
    _class === core.class.Configuration ? configs : spaces
  const ctx = { contextData: { account: { uuid: actor } } }
  const tx = factory.createTxCreateDoc(chunter.class.ContentReportAction, space as Ref<any>, { reason: 'spam' } as any)
  await middleware.onReportAction(ctx, tx)
}

describe('onReportAction', () => {
  const mine = [{ _id: 'ps-user', account: USER }]
  it('lets a user file a report in their own PersonSpace', async () => {
    await expect(onReportAction(USER, 'ps-user', mine)).resolves.toBeUndefined()
  })
  it("refuses a report in somebody else's PersonSpace or in any other space", async () => {
    await expect(onReportAction(OTHER, 'ps-user', mine)).rejects.toThrow()
    await expect(onReportAction(USER, 'general', [])).rejects.toThrow()
  })
  it('lets the system account through', async () => {
    await expect(onReportAction(systemAccountUuid, 'general', [])).resolves.toBeUndefined()
  })
  it('refuses any report while the workspace has reports off', async () => {
    await expect(onReportAction(USER, 'ps-user', mine, [])).rejects.toThrow()
    await expect(
      onReportAction(USER, 'ps-user', mine, [{ _id: chunter.ids.ContentReportsConfiguration, enabled: false }])
    ).rejects.toThrow()
  })
})
