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
  type VotePollAction
} from '@hcengineering/activity'
import contact, { type PersonSpace } from '@hcengineering/contact'
import core, {
  AccountRole,
  type AttachedDoc,
  type Doc,
  hasAccountRole,
  type Hierarchy,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type TxUpdateDoc,
  type WorkspaceUuid,
  systemAccountUuid
} from '@hcengineering/core'
import platform, { getMetadata, PlatformError, Severity, Status } from '@hcengineering/platform'
import {
  BaseMiddleware,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import serverToken from '@hcengineering/server-token'

// An applet stays bound to its message and kind, whatever its model lets the author change.
const boundAppletFields = new Set<string>([
  'space',
  'attachedTo',
  'attachedToClass',
  'collection',
  'applet',
  'createdBy',
  'createdOn'
])

class ActivityMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new ActivityMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const { hierarchy } = this.context
    const account = ctx.contextData.account
    const trusted = account.uuid === systemAccountUuid || ctx.contextData.isTriggerCtx === true

    for (const [index, _tx] of txes.entries()) {
      if (!TxProcessor.isExtendsCUD(_tx._class)) continue
      const tx = _tx as TxCUD<Doc>

      if (!trusted && hierarchy.isDerived(tx.objectClass, activity.class.PollAnswer)) {
        // An anonymous poll tells a repeated vote by this answer: removing or changing it would give another ballot.
        this.throwForbidden('PollAnswer is written by the activity service only')
      }
      // A TxMixin writes any top-level field it names (`mixin: 'votes'`), past every check below.
      if (
        !trusted &&
        tx._class === core.class.TxMixin &&
        hierarchy.isDerived(tx.objectClass, activity.class.AppletInstance)
      ) {
        this.throwForbidden('An applet takes no mixins from clients')
      }
      if (
        !trusted &&
        tx._class === core.class.TxUpdateDoc &&
        hierarchy.isDerived(tx.objectClass, activity.class.AppletInstance)
      ) {
        await this.validateAppletUpdate(ctx, tx as TxUpdateDoc<AppletInstance>, txes)
      }
      if (
        !trusted &&
        tx._class === core.class.TxRemoveDoc &&
        hierarchy.isDerived(tx.objectClass, activity.class.AppletInstance)
      ) {
        await this.validateAppletRemove(ctx, tx)
      }

      if (tx._class === core.class.TxCreateDoc) {
        if (hierarchy.isDerived(tx.objectClass, activity.class.VotePollAction)) {
          if (trusted) continue
          this.validateVote((tx as TxCreateDoc<VotePollAction>).attributes)
          const space = (
            await this.findAll(ctx, contact.class.PersonSpace, { _id: tx.objectSpace as Ref<PersonSpace> })
          )[0]
          // Anonymous polls count one answer per personal space, a vote from any other space is a second ballot.
          if (space?.account !== account.uuid) this.throwForbidden('A vote is accepted from own personal space only')
          ;(tx as TxCreateDoc<VotePollAction>).attributes.account = account.uuid
        } else if (!trusted && hierarchy.isDerived(tx.objectClass, activity.class.Poll)) {
          // The system account (imports, tools) writes a poll as is, tallies included.
          await this.validatePollCreate(ctx, tx as TxCreateDoc<Poll>, txes.slice(0, index))
        } else if (!trusted && hierarchy.isDerived(tx.objectClass, activity.class.AppletInstance)) {
          // Each applet kind needs its own rules here; a poll as a bare AppletInstance would skip them.
          this.throwBadRequest('Only polls are created by clients, as activity.class.Poll')
        }
      }
      if (!trusted && hierarchy.isDerived(tx.objectClass, activity.class.AppletInstance)) {
        // Out of the tx log: a create refused by the storage would leave there the quiz hash computed for it.
        tx.space = core.space.DerivedTx
      }
    }

    return await this.provideTx(ctx, txes)
  }

  // The applet model tells whether a sent instance changes at all; tallies of a poll come from the activity service.
  private async validateAppletUpdate (
    ctx: MeasureContext<SessionData>,
    tx: TxUpdateDoc<AppletInstance>,
    batch: Tx[]
  ): Promise<void> {
    // Found by the base class: an update sent as AppletInstance writes the same row as one sent as Poll.
    const instance = (await this.findAll(ctx, activity.class.AppletInstance, { _id: tx.objectId }))[0]
    if (instance === undefined) this.throwBadRequest(`Applet not found: ${tx.objectId}`)
    if (followsParent(this.context.hierarchy, tx, instance, batch)) return

    const applet = this.context.modelDb.findAllSync(activity.class.Applet, { _id: instance.applet })[0]
    if (!applet?.editable) this.throwForbidden('This applet is not changed once sent')
    if (!ctx.contextData.account.socialIds.includes(instance.createdBy ?? instance.modifiedBy)) {
      this.throwForbidden('Only the author changes an applet')
    }
    // Plain fields only, checked before anything applies them: `__proto__.x` would reach Object.prototype.
    const locked = Object.keys(tx.operations).find((it) => boundAppletFields.has(it) || !/^[A-Za-z]\w*$/.test(it))
    if (locked !== undefined) this.throwForbidden(`Applet field ${locked} cannot be changed`)
  }

  // The rule of a message in the UI; removing a message takes its applets along as a trusted cascade.
  private async validateAppletRemove (ctx: MeasureContext<SessionData>, tx: TxCUD<Doc>): Promise<void> {
    const instance = (
      await this.findAll(ctx, activity.class.AppletInstance, { _id: tx.objectId as Ref<AppletInstance> })
    )[0]
    if (instance === undefined) this.throwBadRequest(`Applet not found: ${tx.objectId}`)

    const account = ctx.contextData.account
    const own = account.socialIds.includes(instance.createdBy ?? instance.modifiedBy)
    if (!own && !hasAccountRole(account, AccountRole.Maintainer)) {
      this.throwForbidden('Only the author or a maintainer removes an applet')
    }
    // A bare removeDoc names no message: the triggers would leave its counter, and so the inbox and search, as is.
    if (tx.attachedTo === undefined) {
      tx.attachedTo = instance.attachedTo
      tx.attachedToClass = instance.attachedToClass
      tx.collection = instance.collection
    }
  }

  // A poll goes into an own message only, new in this batch or existing: never into someone else's.
  private async validatePollCreate (
    ctx: MeasureContext<SessionData>,
    tx: TxCreateDoc<Poll>,
    before: Tx[]
  ): Promise<void> {
    const { hierarchy } = this.context
    const attrs = tx.attributes
    // As the storage takes them: all from the tx when it names the message, all from the attributes otherwise.
    const {
      attachedTo: messageId,
      attachedToClass: messageClass,
      collection
    } = tx.attachedTo !== undefined ? tx : attrs
    if (
      messageId === undefined ||
      attrs.applet !== activity.applet.Poll ||
      messageClass === undefined ||
      !hierarchy.isDerived(messageClass, activity.class.ActivityMessage) ||
      collection !== 'applets'
    ) {
      this.throwBadRequest('A poll is attached to a message as an applet')
    }

    const stored = (
      await this.findAll(ctx, activity.class.ActivityMessage, { _id: messageId as Ref<ActivityMessage> }, { limit: 1 })
    )[0]
    if (stored !== undefined) {
      // Checked even when the batch "creates" it again: that insert would fail, the poll must not get in.
      const own = ctx.contextData.account.socialIds.includes(stored.createdBy ?? stored.modifiedBy)
      if (!own || stored.space !== tx.objectSpace) {
        this.throwForbidden('A poll is added to an own message only')
      }
    } else {
      // Earlier in the batch: the storage writes domains in order, so a failed message insert stops the poll too.
      const created = before.some(
        (it) =>
          it._class === core.class.TxCreateDoc &&
          (it as TxCreateDoc<Doc>).objectId === messageId &&
          hierarchy.isDerived((it as TxCreateDoc<Doc>).objectClass, activity.class.ActivityMessage) &&
          (it as TxCreateDoc<Doc>).objectSpace === tx.objectSpace
      )
      if (!created) {
        this.throwBadRequest('The message of the poll is not found')
      }
    }

    // Before hashing: a quiz hash must not be computed for the id of an existing quiz.
    if (await this.isAppletIdTaken(ctx, tx.objectId)) this.throwBadRequest('Applet id is taken')
    // The author has the applet's rights, and IdentityMiddleware checks only `modifiedBy`.
    delete tx.createdBy

    const ids = this.validatePollShape(attrs)
    if (attrs.revote !== undefined && typeof attrs.revote !== 'boolean') {
      this.throwBadRequest('Poll revote is a flag')
    }

    if (attrs.quiz === true) {
      if (attrs.mode !== 'single') this.throwBadRequest('A quiz has a single answer')
      if (attrs.revote === true) this.throwBadRequest('A quiz vote cannot be retracted')
      if (attrs.quizAnswer == null || !ids.has(attrs.quizAnswer)) {
        this.throwBadRequest('A quiz needs a correct option')
      }
      attrs.quizAnswerHash = hashQuizAnswer(this.context.workspace.uuid, tx.objectId, attrs.quizAnswer)
    } else {
      delete attrs.quizAnswerHash
    }
    delete attrs.quizAnswer

    attrs.totalVotes = 0
    attrs.votes = {}
    attrs.userVotes = []
  }

  // Without the session's space filter: an id taken in a space the sender cannot read is taken all the same.
  private async isAppletIdTaken (ctx: MeasureContext<SessionData>, _id: Ref<Doc>): Promise<boolean> {
    const storage = this.context.lowLevelStorage
    if (storage === undefined) {
      return (await this.findAll(ctx, activity.class.AppletInstance, { _id: _id as Ref<AppletInstance> })).length > 0
    }
    const domain = this.context.hierarchy.getDomain(activity.class.AppletInstance)
    return (await storage.rawFindAll(domain, { _id }, { limit: 1 })).length > 0
  }

  // A malformed vote would throw in the activity service, and a failed queue message is retried forever.
  private validateVote (attrs: Partial<VotePollAction>): void {
    const { attachedTo, options, retract, reveal } = attrs
    if (
      typeof attachedTo !== 'string' ||
      attachedTo === '' ||
      !Array.isArray(options) ||
      !options.every((it) => typeof it === 'string') ||
      (retract !== undefined && typeof retract !== 'boolean') ||
      (reveal !== undefined && typeof reveal !== 'boolean')
    ) {
      this.throwBadRequest('Malformed vote')
    }
  }

  private validatePollShape (attrs: Partial<Poll>): Set<OptionID> {
    if (typeof attrs.question !== 'string' || attrs.question.trim() === '') {
      this.throwBadRequest('Poll question is required')
    }
    if (attrs.question.length > pollLimits.question) this.throwBadRequest('Poll question is too long')

    const options = attrs.options
    if (!Array.isArray(options) || options.length < 2 || options.length > pollLimits.options) {
      this.throwBadRequest(`Poll has 2 to ${pollLimits.options} options`)
    }
    const ids = new Set<OptionID>()
    for (const option of options) {
      if (typeof option?.id !== 'string' || option.id === '' || ids.has(option.id)) {
        this.throwBadRequest('Poll option ids must be unique')
      }
      if (typeof option.label !== 'string' || option.label.trim() === '') {
        this.throwBadRequest('Poll option label is required')
      }
      if (option.label.length > pollLimits.option) this.throwBadRequest('Poll option label is too long')
      ids.add(option.id)
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

  private throwForbidden (message?: string): never {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, { message }))
  }

  private throwBadRequest (message?: string): never {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, { message }))
  }
}

export default ActivityMiddleware

/**
 * A move takes attached items along in one batch, as an issue takes its comments; items of a channel stay.
 * @public
 */
export function followsParent (hierarchy: Hierarchy, tx: TxUpdateDoc<Doc>, doc: AttachedDoc, batch: Tx[]): boolean {
  const { space, ...rest } = tx.operations
  if (typeof space !== 'string' || Object.keys(rest).length > 0) return false
  if (hierarchy.isDerived(doc.attachedToClass, core.class.Space)) return false
  const parentDomain = hierarchy.findDomain(doc.attachedToClass)
  if (parentDomain === undefined) return false
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

function isTime (value: unknown): boolean {
  return value == null || (typeof value === 'number' && Number.isFinite(value))
}

// From the token secret the activity service shares, but not the secret itself: that one signs tokens.
function getQuizKey (): Buffer {
  const secret = getMetadata(serverToken.metadata.Secret) ?? 'secret'
  return createHmac('sha256', secret).update('quiz-answer').digest()
}

/**
 * With the workspace: a poll id comes from the client and may repeat in another workspace.
 * @public
 */
export function hashQuizAnswer (workspace: WorkspaceUuid, pollId: Ref<Poll>, optionId: OptionID): string {
  return createHmac('sha256', getQuizKey()).update(`${workspace}:${pollId}:${optionId}`).digest('base64url')
}
