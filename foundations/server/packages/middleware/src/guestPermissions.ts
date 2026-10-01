import {
  BaseMiddleware,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import core, {
  type Account,
  AccountRole,
  type Class,
  type Doc,
  hasAccountRole,
  type MeasureContext,
  type PersonId,
  type Ref,
  type SessionData,
  type Space,
  type Tx,
  type TxApplyIf,
  type TxCUD,
  type TxCreateDoc,
  type TxMixin,
  TxProcessor,
  type TxUpdateDoc
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import contact, { type Channel, type Person } from '@hcengineering/contact'

export class GuestPermissionsMiddleware extends BaseMiddleware implements Middleware {
  static async create (
    ctx: MeasureContext,
    context: PipelineContext,
    next: Middleware | undefined
  ): Promise<GuestPermissionsMiddleware> {
    return new GuestPermissionsMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const account = ctx.contextData.account
    if (hasAccountRole(account, AccountRole.User)) {
      if (!hasAccountRole(account, AccountRole.Maintainer)) {
        for (const tx of txes) {
          await this.processUserTx(ctx, tx)
        }
      }
      return await this.provideTx(ctx, txes)
    }

    if (account.role === AccountRole.DocGuest || account.role === AccountRole.ReadOnlyGuest) {
      throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
    }

    for (const tx of txes) {
      await this.processTx(ctx, tx)
    }

    return await this.provideTx(ctx, txes)
  }

  private async processTx (ctx: MeasureContext<SessionData>, tx: Tx): Promise<void> {
    const h = this.context.hierarchy
    if (tx._class === core.class.TxApplyIf) {
      const applyTx = tx as TxApplyIf
      for (const t of applyTx.txes) {
        await this.processTx(ctx, t)
      }
      return
    }
    if (TxProcessor.isExtendsCUD(tx._class)) {
      const { account } = ctx.contextData
      const cudTx = tx as TxCUD<Doc>
      const isSpace = h.isDerived(cudTx.objectClass, core.class.Space)
      if (isSpace) {
        if (await this.isForbiddenSpaceTx(ctx, cudTx as TxCUD<Space>, account)) {
          throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
        }
      } else if (cudTx.space !== core.space.DerivedTx && (await this.isForbiddenTx(ctx, cudTx, account))) {
        throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
      }
    }
  }

  private async processUserTx (ctx: MeasureContext<SessionData>, tx: Tx): Promise<void> {
    if (tx._class === core.class.TxApplyIf) {
      const applyTx = tx as TxApplyIf
      for (const t of applyTx.txes) {
        await this.processUserTx(ctx, t)
      }
      return
    }

    if (!TxProcessor.isExtendsCUD(tx._class)) return

    const { account } = ctx.contextData
    if (await this.isForbiddenUserContactTx(ctx, tx as TxCUD<Doc>, account)) {
      throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
    }
  }

  private canUserEditPersonContactDetails (person: Person, account: Account): boolean {
    if (person.personUuid === account.uuid) return true
    return !this.context.hierarchy.hasMixin(person, contact.mixin.Employee)
  }

  private async isForbiddenUserContactTx (
    ctx: MeasureContext<SessionData>,
    tx: TxCUD<Doc>,
    account: Account
  ): Promise<boolean> {
    const h = this.context.hierarchy

    if (h.isDerived(tx.objectClass, contact.class.Person)) {
      if (tx._class === core.class.TxCreateDoc) return false

      const persons = await this.findAll(ctx, contact.class.Person, { _id: tx.objectId as Ref<Person> }, { limit: 1 })
      const person = persons[0]
      if (person === undefined) return true
      if (
        tx._class === core.class.TxMixin &&
        (tx as TxMixin<Doc, Doc>).mixin === contact.mixin.Employee &&
        !h.hasMixin(person, contact.mixin.Employee)
      ) {
        return person.personUuid !== account.uuid
      }
      return !this.canUserEditPersonContactDetails(person, account)
    }

    if (h.isDerived(tx.objectClass, contact.class.Channel)) {
      const parentPersonIds = await this.getChannelParentPersonIds(ctx, tx)
      for (const parentPersonId of parentPersonIds) {
        const persons = await this.findAll(ctx, contact.class.Person, { _id: parentPersonId }, { limit: 1 })
        const person = persons[0]
        if (person === undefined || !this.canUserEditPersonContactDetails(person, account)) return true
      }
    }

    return false
  }

  private async getChannelParentPersonIds (
    ctx: MeasureContext<SessionData>,
    tx: TxCUD<Doc>
  ): Promise<Array<Ref<Person>>> {
    const result = new Set<Ref<Person>>()
    const addPerson = (personId: Ref<Doc> | undefined, personClass: Ref<Class<Doc>> | undefined): void => {
      if (
        personId !== undefined &&
        personClass !== undefined &&
        this.context.hierarchy.isDerived(personClass, contact.class.Person)
      ) {
        result.add(personId as Ref<Person>)
      }
    }

    if (tx._class === core.class.TxCreateDoc) {
      const channel = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Channel>)
      addPerson(channel.attachedTo, channel.attachedToClass)
      return Array.from(result)
    }

    const channels = await this.findAll(ctx, contact.class.Channel, { _id: tx.objectId as Ref<Channel> }, { limit: 1 })
    const channel = channels[0]
    if (channel === undefined) return []

    addPerson(channel.attachedTo, channel.attachedToClass)

    if (tx._class === core.class.TxUpdateDoc) {
      const operations = (tx as TxUpdateDoc<Channel>).operations
      addPerson(operations.attachedTo ?? channel.attachedTo, operations.attachedToClass ?? channel.attachedToClass)
    }

    return Array.from(result)
  }

  private async isForbiddenTx (ctx: MeasureContext, tx: TxCUD<Doc>, account: Account): Promise<boolean> {
    if (tx._class === core.class.TxMixin) return false
    return !(await this.hasMixinAccessLevel(ctx, tx, account))
  }

  private async isForbiddenSpaceTx (ctx: MeasureContext, tx: TxCUD<Space>, account: Account): Promise<boolean> {
    if (tx._class === core.class.TxRemoveDoc) return true
    if (tx._class === core.class.TxCreateDoc) {
      return !(await this.hasMixinAccessLevel(ctx, tx, account))
    }
    if (tx._class === core.class.TxUpdateDoc) {
      const updateTx = tx as TxUpdateDoc<Space>
      const ops = updateTx.operations
      const keys = ['members', 'private', 'archived', 'owners', 'autoJoin']
      if (keys.some((key) => (ops as any)[key] !== undefined)) {
        return true
      }
      if (ops.$push !== undefined || ops.$pull !== undefined) {
        return true
      }
    }
    return false
  }

  private async hasMixinAccessLevel (ctx: MeasureContext, tx: TxCUD<Doc>, account: Account): Promise<boolean> {
    const h = this.context.hierarchy
    const accessLevelMixin = h.classHierarchyMixin(tx.objectClass, core.mixin.TxAccessLevel)
    if (accessLevelMixin === undefined) return false
    if (tx._class === core.class.TxCreateDoc) {
      return accessLevelMixin.createAccessLevel === AccountRole.Guest
    }
    if (tx._class === core.class.TxRemoveDoc) {
      return accessLevelMixin.removeAccessLevel === AccountRole.Guest
    }
    if (tx._class === core.class.TxUpdateDoc) {
      if (accessLevelMixin.isIdentity === true && account.socialIds.includes(tx.objectId as unknown as PersonId)) {
        return true
      }
      if (accessLevelMixin.isIdentity === true && h.isDerived(tx.objectClass, contact.class.Person)) {
        const person = (await this.findAll(ctx, tx.objectClass, { _id: tx.objectId }, { limit: 1 }))[0] as
          | Person
          | undefined
        return person?.personUuid === account.uuid
      }
      return accessLevelMixin.updateAccessLevel === AccountRole.Guest
    }
    return false
  }
}
