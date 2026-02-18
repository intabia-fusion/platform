import {
  BaseMiddleware,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import core, {
  type Doc,
  Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type TxUpdateDoc,
  MeasureContext,
  TxFactory,
  Ref,
  type Domain
} from '@hcengineering/core'
import chunter, { Chat, ChatMessage } from '@hcengineering/chunter'
import { PersonSpace } from '@hcengineering/contact'

export const DOMAIN_CHUNTER_DOC = 'chunter_doc' as Domain

type ChatData = Pick<Chat, '_id' | '_class' | 'space'>

export class ChunterMiddleware extends BaseMiddleware {
  private readonly hiddenChats = new Map<Ref<Doc>, ChatData[]>()

  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new ChunterMiddleware(context, next)
  }

  async tx (ctx: MeasureContext, txes: Tx[]): Promise<TxMiddlewareResult> {
    const { hierarchy } = this.context
    const factory = new TxFactory(core.account.System, true)

    for (const _tx of txes) {
      if (!TxProcessor.isExtendsCUD(_tx._class)) continue
      const tx = _tx as TxCUD<Doc>
      if (_tx._class === core.class.TxCreateDoc && hierarchy.isDerived(tx.objectClass, chunter.class.ChatMessage)) {
        if (hierarchy.isDerived(tx.objectClass, chunter.class.ThreadMessage)) continue
        const createTx = _tx as TxCreateDoc<ChatMessage>
        const message = TxProcessor.createDoc2Doc(createTx)
        const chats = await this.getHiddenChats(message.attachedTo)

        const ttxes = this.getUnhideChatsTx(factory, message.attachedTo, chats)

        if (ttxes.length > 0) {
          await this.context.derived?.tx(ctx, ttxes)
        }
      }

      if (_tx._class === core.class.TxCreateDoc && hierarchy.isDerived(tx.objectClass, chunter.class.Chat)) {
        const createTx = _tx as TxCreateDoc<Chat>
        const chat = TxProcessor.createDoc2Doc(createTx)
        if (chat.hidden) {
          const current = this.hiddenChats.get(chat.attachedTo)
          if (current != null) current.push(chat)
        }
      }

      if (_tx._class === core.class.TxUpdateDoc && hierarchy.isDerived(tx.objectClass, chunter.class.Chat)) {
        const updateTx = _tx as TxUpdateDoc<Chat>
        console.log('UPDATE TX', updateTx)
        if (updateTx.attachedTo == null) continue

        const hidden = updateTx.operations.hidden
        if (hidden === true) {
          const current = this.hiddenChats.get(updateTx.attachedTo)
          if (current != null) {
            current.push({
              _id: updateTx.objectId,
              _class: updateTx.objectClass,
              space: updateTx.objectSpace as Ref<PersonSpace>
            })
          }
        } else if (hidden === false) {
          const current = this.hiddenChats.get(updateTx.attachedTo)
          if (current == null) continue
          this.hiddenChats.set(updateTx.attachedTo, current.filter(chat => chat._id !== updateTx.objectId))
        }
      }
    }

    return await this.provideTx(ctx, txes)
  }

  private getUnhideChatsTx (factory: TxFactory, doc: Ref<Doc>, chats: ChatData[]): Tx[] {
    this.hiddenChats.set(doc, [])
    return chats.map((chat) => factory.createTxUpdateDoc(chat._class, chat.space, chat._id, { hidden: false }))
  }

  private async getHiddenChats (doc: Ref<Doc>): Promise<ChatData[]> {
    if (this.hiddenChats.has(doc)) return this.hiddenChats.get(doc) ?? []

    const chats = await this.context.lowLevelStorage?.rawFindAll<Chat>(DOMAIN_CHUNTER_DOC, { hidden: true, attachedTo: doc }) ?? []
    this.hiddenChats.set(doc, chats)

    return chats
  }
}
