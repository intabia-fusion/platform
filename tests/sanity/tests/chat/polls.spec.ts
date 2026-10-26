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

import { expect, test, type SharedWorkspace } from '../fixtures'
import { type ChatMember, connectOwner, joinWorkspace } from '../API/ChatApi'
import { getPoll, sendPoll, vote, waitForVotes } from '../API/PollApi'
import { ChannelPage } from '../model/channel-page'
import { PollPage } from '../model/poll-page'
import { generateUser, loginByToken } from '../utils'

type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

interface Chat {
  channel: Channel
  me: ChatMember
  other: ChatMember
}

test.describe.configure({ mode: 'parallel' })

const others = new Map<string, ChatMember>()

/** Polls in a channel: I use the browser, the other member votes over REST and the activity service counts. */
test.describe('Poll tests', () => {
  let shared: SharedWorkspace
  let uniq: string
  let polls: PollPage
  let channelPage: ChannelPage

  test.beforeEach(async ({ page, sharedWorkspace }, testInfo) => {
    // The REST member takes a seat like an invited one, once per workspace.
    shared = await sharedWorkspace(0)
    if (!others.has(shared.ws.workspace)) {
      shared = await sharedWorkspace(1)
    }
    uniq = `${testInfo.testId}${testInfo.retry}`
    polls = new PollPage(page)
    channelPage = new ChannelPage(page)
    await loginByToken(page, shared.token, shared.ws, 'chunter')
  })

  async function openChat (): Promise<Chat> {
    const me = await connectOwner(shared.ws, `${shared.data.lastName} ${shared.data.firstName}`)
    const other = others.get(shared.ws.workspace) ?? (await joinWorkspace(shared.ws, generateUser()))
    others.set(shared.ws.workspace, other)
    const channel = await me.createChannel(`poll-${uniq}`, [other.account])
    await channelPage.clickChannel(channel.name)
    return { channel, me, other }
  }

  test('A poll is created in the form and sent from the message input', async () => {
    await openChat()
    const question = `Lunch? ${uniq}`
    await polls.sendPoll({ question, options: ['Pizza', 'Sushi'] })

    await expect(polls.optionControl(question, 'Pizza')).toBeVisible()
    await expect(polls.optionControl(question, 'Sushi')).toBeVisible()
    await polls.checkVotes(question, 0)
  })

  test('A vote shows the results, and a vote of another member arrives live', async () => {
    const chat = await openChat()
    const question = `Lunch? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, { options: ['Pizza', 'Sushi'] })
    await expect(polls.poll(question)).toBeVisible()

    await polls.voteFor(question, 'Pizza')
    await polls.checkVoted(question, true)
    await polls.checkPercent(question, 'Pizza', 100)
    await expect(polls.avatars(question).locator('.hulyAvatar-container, [class*="avatar"]').first()).toBeVisible()

    await vote(chat.other, sent.poll, [sent.options[1]])
    await waitForVotes(chat.me, sent.poll, 2)
    await polls.checkPercent(question, 'Pizza', 50)
    await polls.checkPercent(question, 'Sushi', 50)
  })

  test('Several options are checked and sent with the Vote button', async () => {
    const chat = await openChat()
    const question = `Toppings? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, {
      options: ['Cheese', 'Olives', 'Ham'],
      multiple: true
    })
    await expect(polls.poll(question)).toBeVisible()

    await polls.voteFor(question, 'Cheese', 'Olives')
    await polls.checkVoted(question, true)
    // The total counts voters, so each chosen option has the whole of one vote.
    await polls.checkPercent(question, 'Cheese', 100)
    await polls.checkPercent(question, 'Olives', 100)
    await polls.checkPercent(question, 'Ham', 0)
    const counted = await waitForVotes(chat.me, sent.poll, 1)
    expect(counted.userVotes?.find((it) => it.account === chat.me.account)?.options.sort()).toEqual([
      sent.options[0],
      sent.options[1]
    ])

    await vote(chat.other, sent.poll, [sent.options[0]])
    await waitForVotes(chat.me, sent.poll, 2)
    await polls.checkPercent(question, 'Cheese', 100)
    await polls.checkPercent(question, 'Olives', 50)
  })

  test('A retracted vote brings the controls back and lowers the results', async () => {
    const chat = await openChat()
    const question = `Lunch? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, { options: ['Pizza', 'Sushi'] })
    await vote(chat.other, sent.poll, [sent.options[1]])
    await waitForVotes(chat.me, sent.poll, 1)

    await polls.voteFor(question, 'Pizza')
    await polls.checkVoted(question, true)
    await waitForVotes(chat.me, sent.poll, 2)

    await polls.retract(question)
    await polls.checkVoted(question, false)
    await expect(polls.optionControl(question, 'Pizza')).toBeEnabled()
    await expect
      .poll(async () => {
        const poll = await getPoll(chat.me, sent.poll)
        return { total: poll.totalVotes, pizza: poll.votes?.[sent.options[0]] ?? 0 }
      })
      .toEqual({ total: 1, pizza: 0 })

    await polls.voteFor(question, 'Sushi')
    await polls.checkVoted(question, true)
    await polls.checkPercent(question, 'Sushi', 100)
    await polls.checkPercent(question, 'Pizza', 0)
    await waitForVotes(chat.me, sent.poll, 2)
  })

  test('A poll without revoting offers no retract and ignores a repeated vote', async () => {
    const chat = await openChat()
    const question = `Lunch? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, { options: ['Pizza', 'Sushi'], revote: false })

    await polls.voteFor(question, 'Pizza')
    await polls.checkVoted(question, true)
    await polls.openMenu(question)
    // The menu still opens with the results, only the retract is gone.
    await expect(polls.menuItem('Show results')).toBeVisible()
    await expect(polls.menuItem('Retract vote')).toBeHidden()
    await polls.page.keyboard.press('Escape')

    await vote(chat.other, sent.poll, [sent.options[0]])
    await waitForVotes(chat.me, sent.poll, 2)
    await vote(chat.other, sent.poll, [sent.options[1]])
    // Votes of a workspace are counted in order: once a later one is in, the repeated one was handled.
    const marker = await sendPoll(chat.me, chat.channel, `Marker ${uniq}`, { options: ['Yes', 'No'] })
    await vote(chat.other, marker.poll, [marker.options[0]])
    await waitForVotes(chat.me, marker.poll, 1)

    const poll = await getPoll(chat.me, sent.poll)
    expect(poll.totalVotes).toBe(2)
    expect(poll.votes?.[sent.options[0]]).toBe(2)
    expect(poll.votes?.[sent.options[1]] ?? 0).toBe(0)
    expect(poll.userVotes?.find((it) => it.account === chat.other.account)?.options).toEqual([sent.options[0]])
    await polls.checkPercent(question, 'Pizza', 100)
  })

  test('An anonymous poll shows only percents, and the own vote keeps the row height after a reload', async ({
    page
  }) => {
    const chat = await openChat()
    const question = `Secret? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, { options: ['Yes', 'No'], anonymous: true })
    await vote(chat.other, sent.poll, [sent.options[0]])
    await waitForVotes(chat.me, sent.poll, 1)
    await polls.checkVotes(question, 1)
    const before = await rowHeight(question, 'Yes')

    await polls.voteFor(question, 'No')
    await polls.checkVoted(question, true)
    await polls.checkPercent(question, 'Yes', 50)
    await polls.checkPercent(question, 'No', 50)
    await polls.checkVotes(question, 2)
    await expect(polls.avatars(question)).toHaveCount(0)
    await expect(polls.footer(question).getByRole('button', { name: 'Show results' })).toHaveCount(0)
    await polls.openMenu(question)
    await expect(polls.menuItem('Retract vote')).toBeVisible()
    await expect(polls.menuItem('Show results')).toBeHidden()
    await polls.page.keyboard.press('Escape')

    await page.reload()
    await channelPage.clickChannel(chat.channel.name)
    await expect(polls.poll(question)).toBeVisible()
    // The own answer comes by its own query, possibly after the poll is drawn.
    const first = await rowHeight(question, 'Yes')
    await polls.checkVoted(question, true)
    await polls.checkPercent(question, 'No', 50)
    expect(first).toBe(before)
    expect(await rowHeight(question, 'Yes')).toBe(before)
    await expect(polls.avatars(question)).toHaveCount(0)
  })

  test('A quiz shows the voter the correct option and the own wrong one, and keeps the answer from others', async () => {
    const chat = await openChat()
    const question = `Capital? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, {
      options: ['Paris', 'Lyon', 'Nice'],
      quiz: true,
      correct: 0
    })
    await expect(polls.poll(question)).toBeVisible()
    await expect(polls.poll(question).locator('.progress-track')).toHaveCount(0)

    await polls.voteFor(question, 'Lyon')
    await polls.checkVoted(question, true)
    await expect(polls.option(question, 'Paris').locator('.poll-option__result .progress-track')).toHaveClass(
      /\bpositive\b/
    )
    const wrong = polls.option(question, 'Lyon').locator('.poll-option__result')
    await expect(wrong.locator('.progress-track')).toHaveClass(/\bnegative\b/)
    await expect(wrong.locator('.checkbox')).toHaveClass(/checkbox--negative/)
    // Only the own choice is marked, the correct one shows by its color.
    await expect(polls.option(question, 'Paris').locator('.checkbox')).toHaveCount(0)
    await expect(polls.option(question, 'Nice').locator('.checkbox')).toHaveCount(0)
    await waitForVotes(chat.me, sent.poll, 1)

    const poll = await getPoll(chat.other, sent.poll)
    expect(poll.quizAnswer == null).toBe(true)
  })

  test('The results popup lists the voters and updates live', async () => {
    const chat = await openChat()
    const question = `Lunch? ${uniq}`
    const sent = await sendPoll(chat.me, chat.channel, question, { options: ['Pizza', 'Sushi'] })

    await polls.voteFor(question, 'Pizza')
    await polls.checkVoted(question, true)
    await polls.footer(question).getByRole('button', { name: 'Show results' }).click()
    const results = polls.results()
    await expect(results).toBeVisible()
    await expect(results).toContainText(question)
    await expect(results).toContainText(chat.me.name)
    await expect(results).toContainText('1 vote')
    await expect(results).not.toContainText('Sushi')

    await vote(chat.other, sent.poll, [sent.options[1]])
    await expect(results).toContainText('Sushi')
    await expect(results).toContainText(chat.other.name)
    await expect(results).toContainText('2 votes')

    await polls.page.keyboard.press('Escape')
    await expect(results).toBeHidden()
  })

  async function rowHeight (question: string, label: string): Promise<number | undefined> {
    return (await polls.option(question, label).boundingBox())?.height
  }
})
