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

import type { WorkspaceLoginInfo } from '@hcengineering/account'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import { createRestClient, type RestClient } from '@hcengineering/api-client'
import { ensureEmployee } from '@hcengineering/contact'
import { AccountRole, generateId, type AttachedDoc, type MeasureContext } from '@hcengineering/core'

import { expect, test, type SharedWorkspace } from '../fixtures'
import { ChatMember, connectOwner, joinWorkspace } from '../API/ChatApi'
import {
  addPoll,
  createPollAnswer,
  getPoll,
  personSpace,
  removePoll,
  sendPoll,
  sendVote,
  updatePoll,
  vote,
  waitForVotes
} from '../API/PollApi'
import { generateUser, LocalUrl } from '../utils'

type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

interface Chat {
  channel: Channel
  me: ChatMember
  other: ChatMember
}

test.describe.configure({ mode: 'parallel' })

const others = new Map<string, ChatMember>()
const owners = new Map<string, ChatMember>()

// The server answers a refused write with 403 (Forbidden) or 400 (BadRequest).
const refusal = /Forbidden|BadRequest/i

// A refusal that did not happen is a product bug: the message says what slipped through.
async function expectRefused (what: string, write: Promise<unknown>): Promise<void> {
  const result = await write.then(
    () => undefined,
    (err: unknown) => err
  )
  expect(result, `The server accepted: ${what}`).toBeDefined()
  expect(String((result as any)?.message ?? result), `Unexpected error for: ${what}`).toMatch(refusal)
}

// ensureEmployee only times its steps with the context.
const noMetrics = {
  with: async (_name: string, _params: unknown, op: (ctx: MeasureContext) => unknown) => await op(noMetrics)
} as unknown as MeasureContext

/** What the web client writes on the first login: without the Person of the owner a joining member never sees it. */
async function createEmployee (client: RestClient, token: string): Promise<void> {
  const account = await client.getAccount()
  const accountClient = getAccountClient(LocalUrl, token)
  const socialIds = await accountClient.getSocialIds()
  // The transactor learns about a new member a moment after the account service does.
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureEmployee(noMetrics, account, client, socialIds, async () => await accountClient.getPerson())
      return
    } catch (err) {
      if (attempt === 21) throw err
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}

/** A guest joins by an invite with the Guest role: what the "Invite guest" link does, without the join page. */
async function joinAsGuest (owner: WorkspaceLoginInfo): Promise<ChatMember> {
  return await test.step('joinAsGuest', async () => {
    const user = generateUser()
    const inviteId = await getAccountClient(LocalUrl, owner.token).createInvite(
      60 * 60 * 1000,
      '',
      1,
      AccountRole.Guest
    )
    const joined = await getAccountClient(LocalUrl).signUpJoin(
      user.email,
      user.password,
      user.firstName,
      user.lastName,
      inviteId,
      owner.workspaceUrl
    )
    if (joined.token === undefined) throw new Error('No guest token')
    const client = createRestClient(joined.endpoint, joined.workspace, joined.token)
    const account = await client.getAccount()
    if (account.role !== AccountRole.Guest) throw new Error(`Joined as ${account.role}, not a guest`)
    await createEmployee(client, joined.token)
    return new ChatMember(client, account.uuid, account.primarySocialId, `${user.lastName} ${user.firstName}`)
  })
}

/** Who may change a poll and its message, and whose vote counts: everything over REST, the server decides. */
test.describe('Poll rights tests', () => {
  let shared: SharedWorkspace
  let uniq: string

  test.beforeEach(async ({ sharedWorkspace }, testInfo) => {
    // The REST member takes a seat like an invited one, once per workspace.
    shared = await sharedWorkspace(0)
    if (!others.has(shared.ws.workspace)) {
      shared = await sharedWorkspace(1)
    }
    uniq = `${testInfo.testId}${testInfo.retry}`
  })

  // No browser logs the owner in, so its employee is written here, once per workspace.
  async function openOwner (): Promise<ChatMember> {
    let me = owners.get(shared.ws.workspace)
    if (me == null) {
      me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
      await createEmployee(me.client, shared.token)
      owners.set(shared.ws.workspace, me)
    }
    return me
  }

  async function openChat (): Promise<Chat> {
    const me = await openOwner()
    const other = others.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    others.set(shared.ws.workspace, other)
    const channel = await me.createChannel(`poll-rights-${uniq}`, [other.account])
    return { channel, me, other }
  }

  test('Another member cannot change my message or my poll, and nobody changes a sent poll', async () => {
    const { channel, me, other } = await openChat()
    const question = `Lunch? ${uniq}`
    const sent = await sendPoll(me, channel, question, { options: ['Pizza', 'Sushi'] })
    const pollBefore = await getPoll(me, sent.poll)
    const messageBefore = await me.getMessage(sent.message)

    await expectRefused('other edits my message', other.editMessage(channel, sent.message, `Hacked ${uniq}`))
    await expectRefused('other changes my poll', updatePoll(other, channel, sent, { question: `Hacked ${uniq}` }))
    await expectRefused('I change my sent poll', updatePoll(me, channel, sent, { question: `Changed ${uniq}` }))
    await expectRefused('other removes my poll', removePoll(other, channel, sent))
    await expectRefused(
      'other adds a poll to my message',
      addPoll(
        other,
        channel,
        sent.message,
        generateId<AttachedDoc>(),
        `Foreign ${uniq}`,
        [
          { id: 'o0', label: 'Yes' },
          { id: 'o1', label: 'No' }
        ],
        { options: ['Yes', 'No'] }
      )
    )

    // An own message stays editable: the refusals above are about authorship, not about the member.
    const own = await other.sendMessage(channel, `Own ${uniq}`)
    await other.editMessage(channel, own, `Own edited ${uniq}`)
    expect((await me.getMessage(own)).message).toContain(`Own edited ${uniq}`)

    const pollAfter = await getPoll(me, sent.poll)
    expect(pollAfter.question).toBe(question)
    expect(pollAfter.modifiedOn).toBe(pollBefore.modifiedOn)
    expect((pollAfter as any).options).toEqual((pollBefore as any).options)
    const messageAfter = await me.getMessage(sent.message)
    expect(messageAfter.message).toBe(messageBefore.message)
    expect(messageAfter.applets).toBe(1)
    const applets = await me.client.findAll('activity:class:Poll' as any, { attachedTo: sent.message } as any)
    expect(applets.map((it) => it._id)).toEqual([sent.poll])
  })

  test('A vote counts only from the own personal space, and no member writes a poll answer', async () => {
    const { channel, me, other } = await openChat()
    const sent = await sendPoll(me, channel, `Lunch? ${uniq}`, { options: ['Pizza', 'Sushi'] })

    await expectRefused(
      'other votes from my personal space',
      sendVote(other, await personSpace(me), sent.poll, { options: [sent.options[0]] })
    )
    await expectRefused('other writes a poll answer', createPollAnswer(other, sent.poll, [sent.options[0]]))

    // The own vote goes through the same pipe: once it is counted, a slipped foreign vote would be counted too.
    await vote(other, sent.poll, [sent.options[1]])
    const counted = await waitForVotes(me, sent.poll, 1)
    expect(counted.votes ?? {}).toEqual({ [sent.options[1]]: 1 })
    expect((counted.userVotes ?? []).map((it) => it.account)).toEqual([other.account])
  })

  test('A guest in a channel creates a poll and votes, and the vote is counted', async () => {
    const me = await openOwner()
    const guest = await joinAsGuest(shared.ws)
    const channel = await me.createChannel(`poll-guest-${uniq}`, [guest.account])
    // The guest sees the channel once the membership reaches its session.
    await expect.poll(async () => await guest.client.findOne(channel._class, { _id: channel._id } as any)).toBeDefined()

    const sent = await sendPoll(guest, channel, `Guest lunch? ${uniq}`, { options: ['Pizza', 'Sushi'] })
    await vote(guest, sent.poll, [sent.options[0]])

    const counted = await waitForVotes(me, sent.poll, 1)
    expect(counted.votes ?? {}).toEqual({ [sent.options[0]]: 1 })
    expect((counted.userVotes ?? []).map((it) => it.account)).toEqual([guest.account])
  })
})
