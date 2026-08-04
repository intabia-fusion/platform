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

import activity, { type Poll, type PollAnswer, type PollOption } from '@hcengineering/activity'
import core, { type Doc, type Ref, type Tx, type TxCreateDoc, type TxCUD } from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import { hashQuizAnswerServer } from '@hcengineering/server-activity'

export async function OnPollVoted (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []

  for (const tx of txes) {
    if (tx._class === core.class.TxCreateDoc && tx.objectClass === activity.class.PollAnswer) {
      const createTx = tx as TxCreateDoc<PollAnswer>
      const instanceId = createTx.attributes.attachedTo as Ref<Poll> | undefined
      const selectedOptions: string[] = createTx.attributes.options ?? []

      if (instanceId === undefined || selectedOptions.length === 0) continue

      const instances = await control.findAll(control.ctx, activity.class.AppletInstance, { _id: instanceId })
      const poll = instances[0] as Poll | undefined
      if (poll == null) continue

      const now = Date.now()
      if (poll.startAt != null && now < poll.startAt) continue
      if (poll.endAt != null && now > poll.endAt) continue

      const validOptionIds = new Set((poll.options ?? []).map((it: PollOption) => it.id))
      const isValidOptions = selectedOptions.every((id) => validOptionIds.has(id))
      if (!isValidOptions) continue

      if (poll.mode === 'single' && selectedOptions.length !== 1) continue

      const votes: Record<string, number> = { ...(poll.votes ?? {}) }
      for (const optId of selectedOptions) {
        votes[optId] = (votes[optId] ?? 0) + 1
      }
      const totalVotes = (poll.totalVotes ?? 0) + 1

      result.push(
        control.txFactory.createTxUpdateDoc<Poll>(activity.class.AppletInstance, poll.space, poll._id, {
          totalVotes,
          votes
        })
      )

      if (poll.quiz === true && poll.quizAnswerHash !== undefined && poll.quizAnswerHash !== '') {
        const quizAnswerHash = poll.quizAnswerHash
        const correctOption = (poll.options ?? []).find(
          (opt) => hashQuizAnswerServer(poll._id, opt.id) === quizAnswerHash
        )

        if (correctOption != null) {
          result.push(
            control.txFactory.createTxUpdateDoc(activity.class.PollAnswer, createTx.space, createTx.objectId, {
              quizAnswer: correctOption.id
            })
          )
        }
      }
    }
  }

  return result
}
