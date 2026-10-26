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

import { generateId, type AttachedDoc, type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
import { test } from '@playwright/test'
import { type ChatMember } from './ChatApi'

const chatMessageClass = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
const pollClass = 'activity:class:Poll' as Ref<Class<Doc>>
const pollAnswerClass = 'activity:class:PollAnswer' as Ref<Class<Doc>>
const voteClass = 'activity:class:VotePollAction' as Ref<Class<Doc>>
const personSpaceClass = 'contact:class:PersonSpace' as Ref<Class<Doc>>
const pollApplet = 'activity:applet:Poll'

type Channel = Awaited<ReturnType<ChatMember['findChannel']>>

export interface PollOptions {
  options: string[]
  multiple?: boolean
  anonymous?: boolean
  quiz?: boolean
  // The index of the correct option of a quiz.
  correct?: number
  revote?: boolean
}

export interface SentPoll {
  message: Ref<Doc>
  poll: Ref<Doc>
  // Option ids in the given order.
  options: string[]
}

export type PollDoc = Doc & {
  question: string
  totalVotes?: number
  votes?: Record<string, number>
  userVotes?: Array<{ account: string, options: string[] }>
  quizAnswer?: string
}

/** A message with a poll, as the message input sends it: the poll follows its own message. */
export async function sendPoll (
  member: ChatMember,
  channel: Channel,
  question: string,
  params: PollOptions
): Promise<SentPoll> {
  return await test.step('PollApi.sendPoll', async () => {
    const message = generateId<AttachedDoc>()
    await member.client.addCollection(
      chatMessageClass,
      channel._id as Ref<Space>,
      channel._id,
      channel._class,
      'messages',
      { message: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) } as any,
      message
    )
    const options = params.options.map((label, i) => ({ id: `o${i}`, label }))
    const poll = generateId<AttachedDoc>()
    await addPoll(member, channel, message, poll, question, options, params)
    return { message, poll, options: options.map((it) => it.id) }
  })
}

/** A poll under a message that is not necessarily the member's own: the server decides. */
export async function addPoll (
  member: ChatMember,
  channel: Channel,
  message: Ref<Doc>,
  poll: Ref<AttachedDoc>,
  question: string,
  options: Array<{ id: string, label: string }>,
  params: PollOptions
): Promise<void> {
  const quiz = params.quiz === true
  await member.client.addCollection(
    pollClass,
    channel._id as Ref<Space>,
    message,
    chatMessageClass,
    'applets',
    {
      applet: pollApplet,
      mode: params.multiple === true && !quiz ? 'multiple' : 'single',
      anonymous: params.anonymous === true,
      quiz,
      revote: !quiz && params.revote !== false,
      question,
      options,
      quizAnswer: quiz ? options[params.correct ?? 0].id : undefined,
      totalVotes: 0,
      votes: {}
    } as any,
    poll
  )
}

/** The member's own personal space: the only place a vote is taken from. */
export async function personSpace (member: ChatMember): Promise<Ref<Space>> {
  let space: Doc | undefined
  // The space comes from a trigger a moment after the employee is created.
  for (let i = 0; i < 100 && space === undefined; i++) {
    space = await member.client.findOne(personSpaceClass, { account: member.account } as any)
    if (space === undefined) await new Promise((resolve) => setTimeout(resolve, 300))
  }
  if (space === undefined) throw new Error(`No personal space of ${member.name}`)
  return space._id as Ref<Space>
}

export async function vote (member: ChatMember, poll: Ref<Doc>, options: string[]): Promise<void> {
  await sendVote(member, await personSpace(member), poll, { options })
}

export async function retractVote (member: ChatMember, poll: Ref<Doc>): Promise<void> {
  await sendVote(member, await personSpace(member), poll, { options: [], retract: true })
}

/** A vote sent from a given space, the own one or not. */
export async function sendVote (
  member: ChatMember,
  space: Ref<Space>,
  poll: Ref<Doc>,
  action: { options: string[], retract?: boolean }
): Promise<void> {
  await member.client.createDoc(voteClass, space, { account: member.account, attachedTo: poll, ...action } as any)
}

/** An answer written by the client, which only the activity service may do. */
export async function createPollAnswer (member: ChatMember, poll: Ref<Doc>, options: string[]): Promise<void> {
  await member.client.createDoc(pollAnswerClass, await personSpace(member), { attachedTo: poll, options } as any)
}

/** The answers of a poll the member can read. */
export async function findPollAnswers (member: ChatMember, poll: Ref<Doc>): Promise<Doc[]> {
  return await member.client.findAll(pollAnswerClass, { attachedTo: poll } as any)
}

export async function getPoll (member: ChatMember, poll: Ref<Doc>): Promise<PollDoc> {
  const found = await member.client.findOne(pollClass, { _id: poll } as any)
  if (found === undefined) throw new Error(`Poll ${poll} not found`)
  return found as PollDoc
}

/** Waits for the activity service to count the votes. */
export async function waitForVotes (member: ChatMember, poll: Ref<Doc>, total: number): Promise<PollDoc> {
  let found: PollDoc | undefined
  for (let i = 0; i < 100; i++) {
    found = await getPoll(member, poll)
    if ((found.totalVotes ?? 0) === total) return found
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Poll ${poll} has ${found?.totalVotes ?? 0} votes, not ${total}`)
}

export async function updatePoll (
  member: ChatMember,
  channel: Channel,
  sent: SentPoll,
  data: Record<string, any>
): Promise<void> {
  await member.client.updateCollection(
    pollClass,
    channel._id as Ref<Space>,
    sent.poll as Ref<AttachedDoc>,
    sent.message,
    chatMessageClass,
    'applets',
    data as any
  )
}

export async function removePoll (member: ChatMember, channel: Channel, sent: SentPoll): Promise<void> {
  await member.client.removeCollection(
    pollClass,
    channel._id as Ref<Space>,
    sent.poll as Ref<AttachedDoc>,
    sent.message,
    chatMessageClass,
    'applets'
  )
}
