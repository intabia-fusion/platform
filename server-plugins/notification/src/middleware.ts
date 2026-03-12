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
  Ref,
  type SessionData,
  systemAccountUuid,
  TxFactory
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import notification, { ReadState } from '@hcengineering/notification'
import chunter, { ThreadMessage } from '@hcengineering/chunter'

export class NotificationMiddleware extends BaseMiddleware {
  private readonly activeStates = new Map<Ref<ReadState>, ReadState>()
  private intervalId: number | null = null

  private constructor (context: PipelineContext, next?: Middleware) {
    super(context, next)

    // // Clear if no updates 10 minutes, check every 20 minutes
    this.intervalId = setInterval(
      () => {
        const now = Date.now()
        for (const [key, value] of this.activeStates) {
          if (value.modifiedOn < now - 10 * 60 * 1000) {
            this.activeStates.delete(key)
          }
        }
      },
      20 * 60 * 1000
    )
  }

  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new NotificationMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const account = ctx.contextData.account
    const factory = new TxFactory(core.account.System, true)

    for (const _tx of txes) {
      if (!TxProcessor.isExtendsCUD(_tx._class)) continue
      const tx = _tx as TxCUD<Doc>

      if (tx._class === core.class.TxCreateDoc && tx.objectClass === notification.class.ReadState) {
        const createTx = tx as TxCreateDoc<ReadState>
        const state = TxProcessor.createDoc2Doc(createTx)
        this.activeStates.set(state._id, state)
      }

      if (tx._class === core.class.TxCreateDoc && tx.objectClass === chunter.class.ThreadMessage) {
        const createTx = tx as TxCreateDoc<ThreadMessage>
        const message = TxProcessor.createDoc2Doc(createTx)

        const attachedTo = message.attachedTo
        const attachedToClass = message.attachedToClass
        const state = await this.getStateByDoc(ctx, attachedTo)
        if (state == null) {
          const ttx = factory.createTxCreateDoc(notification.class.ReadState, message.space, {
            attachedTo,
            attachedToClass,
            collection: 'readStates'
          })
          await this.context.derived?.tx(ctx, [ttx])
        }
      }

      if (tx._class === core.class.TxUpdateDoc && tx.objectClass === notification.class.ReadState) {
        if (account.uuid === systemAccountUuid) continue
        if (ctx.contextData.isTriggerCtx === true) continue
        const updateTx = tx as TxUpdateDoc<ReadState>
        if (
          updateTx.operations[account.uuid]?.timestamp == null ||
          updateTx.operations[account.uuid]?.messageId == null
        ) {
          this.throwForbidden()
          continue
        }
        const state = await this.getState(ctx, updateTx.objectId)
        if (state != null) {
          updateTx.operations = {
            [account.uuid]: updateTx.operations[account.uuid]
          }

          const currentTimestamp = state[account.uuid]?.timestamp ?? 0
          const updateTimestamp = updateTx.operations[account.uuid]?.timestamp ?? 0

          if (currentTimestamp > updateTimestamp) {
            this.throwForbidden()
            continue
          }

          this.activeStates.set(state._id, TxProcessor.updateDoc2Doc(state, updateTx))
        } else {
          this.throwForbidden()
        }
      }

      if (tx._class === core.class.TxRemoveDoc && tx.objectClass === notification.class.ReadState) {
        this.activeStates.delete(tx.objectId as Ref<ReadState>)
      }
    }

    return await this.provideTx(ctx, txes)
  }

  private async getState (ctx: MeasureContext<SessionData>, _id: Ref<ReadState>): Promise<ReadState | undefined> {
    const current = this.activeStates.get(_id)
    if (current != null) {
      return current
    }

    const state = (await this.findAll(ctx, notification.class.ReadState, { _id }))[0]
    if (state != null) {
      this.activeStates.set(state._id, state)
      return state
    }

    return undefined
  }

  private async getStateByDoc (ctx: MeasureContext<SessionData>, attachedTo: Ref<Doc>): Promise<ReadState | undefined> {
    const current = Array.from(this.activeStates.values()).find((state) => state.attachedTo === attachedTo)

    if (current != null) {
      return current
    }

    const state = (await this.findAll(ctx, notification.class.ReadState, { attachedTo }))[0]
    if (state != null) {
      this.activeStates.set(state._id, state)
      return state
    }

    return undefined
  }

  private throwForbidden (): void {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
  }

  async close (): Promise<void> {
    if (this.intervalId != null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}
