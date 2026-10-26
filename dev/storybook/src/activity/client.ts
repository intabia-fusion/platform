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

import activity, { type OptionID, type Poll, type PollAnswer, type VotePollAction } from '@hcengineering/activity'
import core, {
  type Class,
  type Client,
  ClientConnectEvent,
  type ClientConnection,
  createClient,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type FindResult,
  generateId,
  Hierarchy,
  ModelDb,
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxFactory,
  TxProcessor,
  type TxResult
} from '@hcengineering/core'

import { buildModel } from './model'

const VOTE_DELAY_MS = 600

const service = new TxFactory(core.account.System)
const hierarchy = new Hierarchy()
const modelTxes = buildModel()
for (const tx of modelTxes) hierarchy.tx(tx)
// Non-model documents: polls, answers, persons, spaces.
const data = new ModelDb(hierarchy)

let notify: ((...tx: Tx[]) => void) | undefined
// The correct option of each quiz, as the service finds it by the hash.
const quizAnswers = new Map<Ref<Poll>, OptionID>()

export function setQuizAnswer (poll: Ref<Poll>, answer: OptionID): void {
  quizAnswers.set(poll, answer)
}

export function seed (docs: Doc[]): void {
  for (const doc of docs) {
    if (data.findObject(doc._id) != null) data.delDoc(doc._id)
    data.addDoc(hierarchy.clone(doc))
  }
}

async function apply (...txes: Tx[]): Promise<void> {
  for (const tx of txes) await data.tx(tx)
  notify?.(...txes)
}

class StoryConnection implements ClientConnection {
  isConnected (): boolean {
    return true
  }

  pushHandler (): void {}

  async findAll<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ): Promise<FindResult<T>> {
    return await data.findAll(_class, query, options)
  }

  async tx (tx: Tx): Promise<TxResult> {
    const cud = tx as TxCUD<Doc>
    if (tx._class === core.class.TxCreateDoc && cud.objectClass === activity.class.VotePollAction) {
      // Applied after a delay, as the activity service does.
      setTimeout(() => {
        void handleVote(TxProcessor.createDoc2Doc(tx as TxCreateDoc<VotePollAction>))
      }, VOTE_DELAY_MS)
      return {}
    }
    if (tx.objectSpace !== core.space.Model) await data.tx(tx)
    notify?.(tx)
    return {}
  }

  async close (): Promise<void> {}
  async loadModel (): Promise<Tx[]> {
    return modelTxes
  }

  async domainRequest (): Promise<any> {
    return { domain: '', value: null }
  }

  async searchFulltext (): Promise<any> {
    return { docs: [] }
  }

  async loadChunk (): Promise<any> {
    return { idx: -1, docs: [], finished: true }
  }

  async getDomainHash (): Promise<string> {
    return generateId()
  }

  async closeChunk (): Promise<void> {}
  async loadDocs (): Promise<Doc[]> {
    return []
  }

  async upload (): Promise<void> {}
  async clean (): Promise<void> {}
  async sendForceClose (): Promise<void> {}

  handler?: (event: ClientConnectEvent, lastTx: string | undefined, data: any) => Promise<void>

  set onConnect (
    handler: ((event: ClientConnectEvent, lastTx: string | undefined, data: any) => Promise<void>) | undefined
  ) {
    this.handler = handler
    void this.handler?.(ClientConnectEvent.Connected, '', {})
  }

  get onConnect (): ((event: ClientConnectEvent, lastTx: string | undefined, data: any) => Promise<void>) | undefined {
    return this.handler
  }
}

export async function createStoryClient (): Promise<Client> {
  return await createClient(async (handler) => {
    notify = handler
    return new StoryConnection() as unknown as ClientConnection
  })
}

// A short version of VotePollHandler in services/activity: enough to see a vote and a retract.
async function handleVote (action: VotePollAction): Promise<void> {
  const poll = data.findObject(action.attachedTo as Ref<Poll>)
  if (poll == null) return
  const now = Date.now()
  const update = (ops: DocumentUpdate<Poll>): Tx => service.createTxUpdateDoc(poll._class, poll.space, poll._id, ops)

  if ((poll.startAt != null && now < poll.startAt) || (poll.endAt != null && now > poll.endAt)) return

  const personal = poll.anonymous === true || poll.quiz === true
  const answers = await data.findAll(activity.class.PollAnswer, { attachedTo: poll._id, space: action.space })
  const own = personal ? answers[0]?.options : poll.userVotes?.find((it) => it.account === action.account)?.options
  const votes = { ...(poll.votes ?? {}) }

  if (action.retract === true) {
    if (own == null || poll.revote !== true || poll.quiz === true) return
    for (const id of own) votes[id] = Math.max(0, (votes[id] ?? 0) - 1)
    const txes: Tx[] = [
      update({
        totalVotes: Math.max(0, poll.totalVotes - 1),
        votes,
        ...(personal ? {} : { $pull: { userVotes: { account: action.account } as any } })
      })
    ]
    if (answers[0] != null) {
      txes.unshift(service.createTxRemoveDoc(activity.class.PollAnswer, action.space, answers[0]._id))
    }
    await apply(...txes)
    return
  }

  if (own != null || action.options.length === 0) return
  for (const id of action.options) votes[id] = (votes[id] ?? 0) + 1
  const txes: Tx[] = []
  if (personal) {
    const answer: Partial<PollAnswer> = { attachedTo: poll._id, options: action.options }
    if (poll.quiz === true) answer.quizAnswer = quizAnswers.get(poll._id)
    txes.push(service.createTxCreateDoc(activity.class.PollAnswer, action.space, answer as PollAnswer))
  }
  txes.push(
    update({
      totalVotes: poll.totalVotes + 1,
      votes,
      ...(poll.anonymous === true ? {} : { $push: { userVotes: { account: action.account, options: action.options } } })
    })
  )
  await apply(...txes)
}
