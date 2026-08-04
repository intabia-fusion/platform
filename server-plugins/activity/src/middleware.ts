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

import activity, { type AppletInstance, OptionID, Poll, VotePollAction } from '@hcengineering/activity'
import core, {
  type Doc,
  MeasureContext,
  Ref,
  type SessionData,
  Tx,
  type TxCreateDoc,
  type TxUpdateDoc,
  type TxCUD,
  TxProcessor,
  systemAccountUuid
} from '@hcengineering/core'
import {
  BaseMiddleware,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'

class ActivityMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new ActivityMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const { hierarchy } = this.context

    for (const _tx of txes) {
      if (!TxProcessor.isExtendsCUD(_tx._class)) continue
      const tx = _tx as TxCUD<Doc>

      if (tx._class === core.class.TxCreateDoc && hierarchy.isDerived(tx.objectClass, activity.class.PollAnswer)) {
        if (ctx.contextData.account.uuid !== systemAccountUuid) {
          this.throwForbidden('Direct creation of PollAnswer documents is restricted to system account')
        }
      } else if (
        tx._class === core.class.TxCreateDoc &&
        hierarchy.isDerived(tx.objectClass, activity.class.VotePollAction)
      ) {
        ;(tx as TxCreateDoc<VotePollAction>).attributes.account = ctx.contextData.account.uuid
      } else if (
        tx._class === core.class.TxCreateDoc &&
        hierarchy.isDerived(tx.objectClass, activity.class.AppletInstance)
      ) {
        const createTx = tx as TxCreateDoc<AppletInstance>

        if (createTx.attributes.applet === activity.applet.Poll) {
          this.validatePollCreate(ctx, createTx as TxCreateDoc<Poll>)
        }
      } else if (
        tx._class === core.class.TxUpdateDoc &&
        hierarchy.isDerived(tx.objectClass, activity.class.AppletInstance)
      ) {
        const updateTx = tx as TxUpdateDoc<AppletInstance>
        const instance = (await this.findAll(ctx, activity.class.AppletInstance, { _id: updateTx.objectId }))[0] as
          | AppletInstance
          | undefined
        if (instance == null) {
          this.throwNotFound(`AppletInstance not found: ${updateTx.objectId}`)
        }

        if (instance.applet === activity.applet.Poll) {
          this.validatePollUpdate(ctx, updateTx as TxUpdateDoc<Poll>, instance as Poll)
        }
      }
    }

    return this.next != null ? await this.next.tx(ctx, txes) : { txes }
  }

  private validatePollUpdate (ctx: MeasureContext<SessionData>, tx: TxUpdateDoc<Poll>, poll: Poll): void {
    const sessionAccount = ctx.contextData?.account
    if (sessionAccount == null) {
      this.throwUnauthorized('User session not found')
    }

    if (sessionAccount.uuid === systemAccountUuid) {
      return
    }

    if (!sessionAccount.socialIds.includes(poll.createdBy ?? poll.modifiedBy)) {
      this.throwForbidden('Only the poll creator is allowed to update poll configuration')
    }

    const newPoll = TxProcessor.updateDoc2Doc(this.context.hierarchy.clone(poll), tx)

    if (poll.anonymous !== newPoll.anonymous || poll.quiz !== newPoll.quiz || poll.mode !== newPoll.mode) {
      this.throwBadRequest('Modifying static configuration (anonymous, quiz, mode) is not allowed after poll creation')
    }

    if (
      poll.totalVotes !== newPoll.totalVotes ||
      JSON.stringify(poll.votes) !== JSON.stringify(newPoll.votes) ||
      JSON.stringify(poll.userVotes) !== JSON.stringify(newPoll.userVotes)
    ) {
      this.throwForbidden('Direct modification of poll vote data is not allowed')
    }
  }

  private validatePollCreate (ctx: MeasureContext<SessionData>, tx: TxCreateDoc<Poll>): void {
    if (tx.attributes.question == null || tx.attributes.options == null) {
      this.throwBadRequest('Poll creation requires question and options')
    }

    if (tx.attributes.quiz === true) {
      const pollId = tx.objectId
      const options = tx.attributes.options ?? []
      const quizAnswer = tx.attributes.quizAnswer

      if (quizAnswer != null && options.length > 0) {
        tx.attributes.quizAnswerHash = hashQuizAnswerServer(pollId, quizAnswer)
        delete tx.attributes.quizAnswer
      }
    }
    tx.attributes.totalVotes = 0
    tx.attributes.votes = {}
  }

  private throwForbidden (message?: string): never {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, { message }))
  }

  private throwBadRequest (message?: string): never {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, { message }))
  }

  private throwUnauthorized (message?: string): never {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.Unauthorized, { message }))
  }

  private throwNotFound (message?: string): never {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, { message }))
  }
}

export default ActivityMiddleware

const SERVER_QUIZ_SECRET = process.env.QUIZ_SECRET ?? 'platform_quiz-secret-v1'

export function hashQuizAnswerServer (
  pollId: Ref<Poll>,
  optionId: OptionID,
  secret: string = SERVER_QUIZ_SECRET
): string {
  const str = `${pollId}:${optionId}:${secret}`
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}
