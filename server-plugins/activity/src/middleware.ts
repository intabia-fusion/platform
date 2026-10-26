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

import { createHmac } from 'crypto'
import activity, {
  type ActivityMessage,
  type AppletInstance,
  type OptionID,
  type Poll,
  pollLimits,
  type PollOption,
  type VotePollAction
} from '@hcengineering/activity'
import contact, { type PersonSpace } from '@hcengineering/contact'
import core, {
  AccountRole,
  type AttachedDoc,
  type Class,
  type Doc,
  type DocumentUpdate,
  hasAccountRole,
  type Hierarchy,
  type LowLevelStorage,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type TxRemoveDoc,
  type TxUpdateDoc,
  type WorkspaceUuid,
  systemAccountUuid
} from '@hcengineering/core'
import platform, { ForbiddenKind, getMetadata, PlatformError, Severity, Status } from '@hcengineering/platform'
import {
  BaseMiddleware,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import serverToken from '@hcengineering/server-token'

class ActivityMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new ActivityMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    if (ctx.contextData.account.uuid === systemAccountUuid || ctx.contextData.isTriggerCtx === true) {
      return await this.provideTx(ctx, txes)
    }

    const { hierarchy } = this.context
    for (const _tx of txes) {
      if (!TxProcessor.isExtendsCUD(_tx._class)) continue
      const tx = _tx as TxCUD<Doc>

      if (hierarchy.isDerived(tx.objectClass, activity.class.PollAnswer)) {
        this.throwForbidden(ctx, tx, ForbiddenKind.SystemOnly, 'PollAnswer is written by the activity service only')
      } else if (hierarchy.isDerived(tx.objectClass, activity.class.VotePollAction)) {
        if (tx._class === core.class.TxCreateDoc) await this.validateVote(ctx, tx as TxCreateDoc<VotePollAction>)
      } else if (hierarchy.isDerived(tx.objectClass, activity.class.AppletInstance)) {
        await this.validateApplet(ctx, tx, txes)
      }
    }

    return await this.provideTx(ctx, txes)
  }

  private async validateApplet (ctx: MeasureContext<SessionData>, tx: TxCUD<Doc>, batch: Tx[]): Promise<void> {
    switch (tx._class) {
      case core.class.TxCreateDoc:
        // The poll first: its own checks need no queries.
        if (this.context.hierarchy.isDerived(tx.objectClass, activity.class.Poll)) {
          await this.validatePollCreate(ctx, tx as TxCreateDoc<Poll>)
        }
        await this.validateAppletCreate(ctx, tx as TxCreateDoc<AppletInstance>, batch)
        break
      case core.class.TxUpdateDoc:
        await this.validateAppletUpdate(ctx, tx as TxUpdateDoc<AppletInstance>, batch)
        break
      case core.class.TxRemoveDoc:
        await this.validateAppletRemove(ctx, tx as TxRemoveDoc<AppletInstance>)
        break
      case core.class.TxMixin:
        this.throwForbidden(ctx, tx, ForbiddenKind.SystemOnly, 'An applet takes no mixins from clients')
    }
    tx.space = core.space.DerivedTx
  }

  private async validateAppletUpdate (
    ctx: MeasureContext<SessionData>,
    tx: TxUpdateDoc<AppletInstance>,
    batch: Tx[]
  ): Promise<void> {
    const instance = await this.findApplet(ctx, tx.objectId)
    if (followsParent(this.context.hierarchy, tx, instance, batch)) return

    const applet = this.context.modelDb.findAllSync(activity.class.Applet, { _id: instance.applet })[0]
    if (!applet?.editable) this.throwForbidden(ctx, tx, ForbiddenKind.SystemOnly, 'This applet is not changed once sent')
    if (!this.isAuthor(ctx, instance)) {
      this.throwForbidden(ctx, tx, ForbiddenKind.AuthorOnly, 'Only the author changes an applet')
    }
    const foreign = getUpdatedFields(tx.operations).find((field) => !this.isOwnAppletField(instance._class, field))
    if (foreign != null) {
      this.throwForbidden(ctx, tx, ForbiddenKind.SystemOnly, `Applet field ${foreign} cannot be changed`)
    }
  }

  private async validateAppletRemove (
    ctx: MeasureContext<SessionData>,
    tx: TxRemoveDoc<AppletInstance>
  ): Promise<void> {
    const instance = await this.findApplet(ctx, tx.objectId)
    if (!this.isAuthor(ctx, instance) && !hasAccountRole(ctx.contextData.account, AccountRole.Maintainer)) {
      this.throwForbidden(ctx, tx, ForbiddenKind.AuthorOnly, 'Only the author or a maintainer removes an applet')
    }
    // The counter trigger trusts these: a client could point them at another message.
    tx.attachedTo = instance.attachedTo
    tx.attachedToClass = instance.attachedToClass
    tx.collection = instance.collection
  }

  private async validateAppletCreate (
    ctx: MeasureContext<SessionData>,
    tx: TxCreateDoc<AppletInstance>,
    batch: Tx[]
  ): Promise<void> {
    if (tx.objectClass === activity.class.AppletInstance) {
      this.throwBadRequest('An applet is created under the class of its kind, not AppletInstance')
    }
    await this.validateAppletMessage(ctx, tx, batch)
  }

  private async validatePollCreate (ctx: MeasureContext<SessionData>, tx: TxCreateDoc<Poll>): Promise<void> {
    if (tx.attributes.applet !== activity.applet.Poll) this.throwBadRequest('A poll is created as the poll applet')
    const ids = this.validatePollShape(tx.attributes)
    // A quiz under the id of an existing one would get back the hash of a chosen option to compare.
    if (tx.attributes.quiz === true && (await this.isAppletIdTaken(tx.objectId))) {
      this.throwBadRequest('Applet id is taken')
    }
    this.sealQuizAnswer(tx, ids)

    tx.attributes.totalVotes = 0
    tx.attributes.votes = {}
    tx.attributes.userVotes = []
  }

  private async validateAppletMessage (
    ctx: MeasureContext<SessionData>,
    tx: TxCreateDoc<AppletInstance>,
    batch: Tx[]
  ): Promise<void> {
    const { hierarchy } = this.context
    // As the storage takes it: the tx level wins once set at all, even to null.
    const {
      attachedTo: messageId,
      attachedToClass: messageClass,
      collection
    } = tx.attachedTo !== undefined ? tx : tx.attributes
    if (
      typeof messageId !== 'string' ||
      typeof messageClass !== 'string' ||
      !hierarchy.isDerived(messageClass, activity.class.ActivityMessage) ||
      collection !== 'applets'
    ) {
      this.throwBadRequest('An applet is attached to a message as an applet')
    }

    const stored = (
      await this.findAll(ctx, activity.class.ActivityMessage, { _id: messageId as Ref<ActivityMessage> }, { limit: 1 })
    )[0]
    if (stored != null) {
      if (!this.isAuthor(ctx, stored)) {
        this.throwForbidden(ctx, tx, ForbiddenKind.AuthorOnly, 'An applet is added to an own message only')
      }
      if (stored.space !== tx.objectSpace) this.throwBadRequest('An applet is created in the space of its message')
      if (stored._class !== messageClass) this.throwBadRequest('An applet names the class of its message')
      return
    }

    const created = batch.slice(0, batch.indexOf(tx)).some((it) => {
      const createTx = it as TxCreateDoc<Doc>
      return (
        it._class === core.class.TxCreateDoc &&
        createTx.objectId === messageId &&
        createTx.objectClass === messageClass &&
        createTx.objectSpace === tx.objectSpace
      )
    })
    if (!created) this.throwBadRequest('The message of the applet is not found')
  }

  private validatePollShape (attrs: Partial<Poll>): Set<OptionID> {
    const { question, options } = attrs
    if (typeof question !== 'string' || question.trim() === '') this.throwBadRequest('Poll question is required')
    if (question.length > pollLimits.maxQuestionLength) this.throwBadRequest('Poll question is too long')

    if (!Array.isArray(options)) this.throwBadRequest('Poll options must be a list')
    if (options.length < 2) this.throwBadRequest('Poll needs at least 2 options')
    if (options.length > pollLimits.maxOptions) this.throwBadRequest(`Poll allows at most ${pollLimits.maxOptions} options`)

    const ids = new Set<OptionID>()
    for (const option of options) {
      const { id, label } = (option ?? {}) as Partial<PollOption>
      if (!isOptionId(id)) this.throwBadRequest('Poll option id is malformed')
      if (ids.has(id)) this.throwBadRequest('Poll option ids must be unique')
      if (typeof label !== 'string' || label.trim() === '') this.throwBadRequest('Poll option label is required')
      if (label.length > pollLimits.maxOptionLength) this.throwBadRequest('Poll option label is too long')
      ids.add(id)
    }

    if (!isFlag(attrs.anonymous) || !isFlag(attrs.quiz) || !isFlag(attrs.revote)) {
      this.throwBadRequest('Poll flags are booleans')
    }

    if (attrs.mode !== 'single' && attrs.mode !== 'multiple') {
      this.throwBadRequest('Poll mode must be single or multiple')
    }
    if (!isTime(attrs.startAt) || !isTime(attrs.endAt)) {
      this.throwBadRequest('Poll start and end are timestamps')
    }
    if (attrs.startAt != null && attrs.endAt != null && attrs.endAt <= attrs.startAt) {
      this.throwBadRequest('Poll must end after it starts')
    }
    return ids
  }

  private sealQuizAnswer (tx: TxCreateDoc<Poll>, ids: Set<OptionID>): void {
    const attrs = tx.attributes
    if (attrs.quiz === true) {
      attrs.mode = 'single'
      attrs.revote = false
      if (attrs.quizAnswer == null || !ids.has(attrs.quizAnswer)) {
        this.throwBadRequest('A quiz needs a correct option')
      }
      attrs.quizAnswerHash = hashQuizAnswer(this.context.workspace.uuid, tx.objectId, attrs.quizAnswer)
    } else {
      delete attrs.quizAnswerHash
    }
    delete attrs.quizAnswer
  }

  private async validateVote (ctx: MeasureContext<SessionData>, tx: TxCreateDoc<VotePollAction>): Promise<void> {
    this.validateVoteFields(tx.attributes)

    const account = ctx.contextData.account
    const space = (
      await this.findAll(ctx, contact.class.PersonSpace, { _id: tx.objectSpace as Ref<PersonSpace> })
    )[0]
    if (space?.account !== account.uuid) {
      this.throwForbidden(ctx, tx, ForbiddenKind.ForeignPrivateWrite, 'A vote is accepted from own personal space only')
    }
    tx.attributes.account = account.uuid
  }

  private validateVoteFields (attrs: Partial<VotePollAction>): void {
    const { attachedTo, options, retract, reveal } = attrs
    if (
      typeof attachedTo !== 'string' ||
      attachedTo === '' ||
      !Array.isArray(options) ||
      !options.every((it) => typeof it === 'string') ||
      !isFlag(retract) ||
      !isFlag(reveal)
    ) {
      this.throwBadRequest('Malformed vote')
    }
  }

  private async findApplet (ctx: MeasureContext<SessionData>, _id: Ref<Doc>): Promise<AppletInstance> {
    const instance = (await this.findAll(ctx, activity.class.AppletInstance, { _id: _id as Ref<AppletInstance> }))[0]
    if (instance == null) this.throwBadRequest(`Applet not found: ${_id}`)
    return instance
  }

  private async isAppletIdTaken (_id: Ref<Doc>): Promise<boolean> {
    const domain = this.context.hierarchy.getDomain(activity.class.AppletInstance)
    const storage = this.context.lowLevelStorage as LowLevelStorage
    return (await storage.rawFindAll(domain, { _id }, { limit: 1 })).length > 0
  }

  private isOwnAppletField (_class: Ref<Class<Doc>>, key: string): boolean {
    const { hierarchy } = this.context
    return (
      hierarchy.findAttribute(_class, key) != null &&
      hierarchy.findAttribute(activity.class.AppletInstance, key) == null
    )
  }

  private isAuthor (ctx: MeasureContext<SessionData>, doc: Doc): boolean {
    return ctx.contextData.account.socialIds.includes(doc.createdBy ?? doc.modifiedBy)
  }

  private throwForbidden (ctx: MeasureContext<SessionData>, tx: Tx, kind: ForbiddenKind, message: string): never {
    throw this.forbiddenTx(ctx, kind, message, tx)
  }

  private throwBadRequest (message: string): never {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, { message }))
  }
}

export default ActivityMiddleware

export function followsParent (hierarchy: Hierarchy, tx: TxUpdateDoc<Doc>, doc: AttachedDoc, batch: Tx[]): boolean {
  const { space, ...rest } = tx.operations
  if (typeof space !== 'string' || Object.keys(rest).length > 0) return false
  if (hierarchy.isDerived(doc.attachedToClass, core.class.Space)) return false
  const parentDomain = hierarchy.findDomain(doc.attachedToClass)
  if (parentDomain == null) return false
  return batch.some((it) => {
    const parentTx = it as TxUpdateDoc<Doc>
    return (
      it._class === core.class.TxUpdateDoc &&
      parentTx.objectId === doc.attachedTo &&
      parentTx.operations.space === space &&
      hierarchy.findDomain(parentTx.objectClass) === parentDomain
    )
  })
}

export function getUpdatedFields (operations: DocumentUpdate<Doc>): string[] {
  const result: string[] = []
  for (const [key, value] of Object.entries(operations)) {
    if (!key.startsWith('$')) {
      result.push(key.split('.')[0])
      continue
    }
    if (value == null || typeof value !== 'object') continue
    for (const [field, target] of Object.entries(value)) {
      result.push(field.split('.')[0])
      if (key === '$rename' && typeof target === 'string') result.push(target.split('.')[0])
    }
  }
  return result
}

function isFlag (value: unknown): boolean {
  return value == null || typeof value === 'boolean'
}

// Option ids key the `votes` record: an inherited name such as `constructor` would break its counts.
function isOptionId (value: unknown): value is OptionID {
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value) && !(value in Object.prototype)
}

function isTime (value: unknown): boolean {
  return value == null || (typeof value === 'number' && Number.isFinite(value))
}

function getQuizKey (): Buffer {
  const secret = getMetadata(serverToken.metadata.Secret) ?? 'secret'
  return createHmac('sha256', secret).update('quiz-answer').digest()
}

export function hashQuizAnswer (workspace: WorkspaceUuid, pollId: Ref<Poll>, optionId: OptionID): string {
  return createHmac('sha256', getQuizKey()).update(`${workspace}:${pollId}:${optionId}`).digest('base64url')
}
