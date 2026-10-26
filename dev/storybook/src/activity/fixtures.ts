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

import activity, { type OptionID, type Poll, type PollAnswer, type PollOption, type UserVote } from '@hcengineering/activity'
import contact, { type Employee, type Person, type PersonSpace } from '@hcengineering/contact'
import core, { type AccountUuid, type Doc, type PersonId, type Ref, type Space } from '@hcengineering/core'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const me = {
  account: 'story-me' as AccountUuid,
  socialId: 'story-me-social' as PersonId,
  person: 'story-person-me' as Ref<Employee>,
  space: 'story-space-me' as Ref<PersonSpace>
}

const names = [
  ['Kristina', 'Fefelova'],
  ['Anna', 'Smirnova'],
  ['Ivan', 'Petrov'],
  ['Olga', 'Kuznetsova'],
  ['Dmitry', 'Sokolov'],
  ['Maria', 'Volkova'],
  ['Sergey', 'Morozov'],
  ['Elena', 'Novikova'],
  ['Pavel', 'Fedorov'],
  ['Natalia', 'Orlova'],
  ['Alexey', 'Lebedev'],
  ['Irina', 'Kozlova'],
  ['Mikhail', 'Egorov'],
  ['Tatiana', 'Pavlova'],
  ['Andrey', 'Semenov'],
  ['Yulia', 'Golubeva'],
  ['Nikolay', 'Vinogradov'],
  ['Svetlana', 'Bogdanova'],
  ['Roman', 'Vorobyov'],
  ['Ekaterina', 'Zaitseva'],
  ['Denis', 'Solovyov'],
  ['Anastasia', 'Borisova'],
  ['Viktor', 'Yakovlev'],
  ['Polina', 'Grigorieva'],
  ['Kirill', 'Romanov'],
  ['Daria', 'Vasilieva'],
  ['Maxim', 'Nikitin'],
  ['Alina', 'Sorokina'],
  ['Igor', 'Belov'],
  ['Vera', 'Komarova']
]

// The first one is the viewer.
const people = names.map(([first, last], index) => ({
  account: (index === 0 ? me.account : `story-account-${index}`) as AccountUuid,
  person: (index === 0 ? me.person : `story-person-${index}`) as Ref<Employee>,
  name: `${last},${first}`
}))

const channel = 'story-channel' as Ref<Space>

export function baseDocs (): Doc[] {
  const persons = people.map(
    (it) =>
      ({
        _id: it.person,
        _class: contact.class.Person,
        space: contact.space.Contacts,
        modifiedOn: 0,
        modifiedBy: core.account.System,
        name: it.name,
        personUuid: it.account,
        [contact.mixin.Employee]: { active: true }
      }) as unknown as Person
  )
  const space = {
    _id: me.space,
    _class: contact.class.PersonSpace,
    space: core.space.Space,
    modifiedOn: 0,
    modifiedBy: core.account.System,
    name: 'Personal space',
    description: '',
    private: true,
    archived: false,
    members: [me.account],
    person: me.person,
    account: me.account
  } as unknown as PersonSpace
  return [...persons, space]
}

export type PollKind = 'poll' | 'multiple' | 'anonymous' | 'quiz'
export type PollSituation = 'scheduled' | 'open' | 'voted' | 'ended'

export interface PollCaseParams {
  kind: PollKind
  situation: PollSituation
}

export interface PollCase {
  poll: Poll
  docs: Doc[]
  quizAnswer?: OptionID
}

export const defaultLabels = ['Pizza', 'Sushi', 'Burgers', 'Salad']
const defaultOthers = [2, 3, 1, 0]

let counter = 0

export function makePoll (params: PollCaseParams): PollCase {
  const { kind, situation } = params
  const now = Date.now()
  const _id = `story-poll-${++counter}` as Ref<Poll>
  const quiz = kind === 'quiz'
  const anonymous = kind === 'anonymous'
  const options: PollOption[] = defaultLabels.map((label, index) => ({ id: `o${index}`, label }))
  const quizAnswer = quiz ? options[1]?.id : undefined

  const window: Record<PollSituation, { startAt?: number, endAt?: number }> = {
    scheduled: { startAt: now + 20 * MINUTE, endAt: now + DAY },
    open: { startAt: now - HOUR, endAt: now + 3 * HOUR },
    voted: { startAt: now - HOUR, endAt: now + 3 * HOUR },
    ended: { startAt: now - 2 * DAY, endAt: now - HOUR }
  }
  const { startAt, endAt } = window[situation]

  // Nobody votes before the start.
  const others = situation === 'scheduled' ? options.map(() => 0) : defaultOthers
  const userVotes: UserVote[] = []
  const guests: AccountUuid[] = []
  const votes: Record<OptionID, number> = {}
  options.forEach((option, index) => {
    const count = others[index] ?? 0
    votes[option.id] = count
    for (let i = 0; i < count; i++) {
      // Past the people of the workspace the voters are guests.
      const n = userVotes.length + 1
      const account = (n < people.length ? people[n].account : `story-voter-${n}`) as AccountUuid
      userVotes.push({ account, options: [option.id] })
      if (n >= people.length) guests.push(account)
    }
  })
  let totalVotes = userVotes.length

  // A guest has a person but no employee: the results list shows them all the same.
  const docs: Doc[] = guests.map(
    (account) =>
      ({
        _id: `story-person-${account}`,
        _class: contact.class.Person,
        space: contact.space.Contacts,
        modifiedOn: 0,
        modifiedBy: core.account.System,
        name: `${account.replace('story-voter-', '')},Guest`,
        personUuid: account
      }) as unknown as Person
  )
  if (situation === 'voted') {
    const mine = kind === 'multiple' ? [options[0].id, options[1].id] : [options[0].id]
    for (const id of mine) votes[id] = (votes[id] ?? 0) + 1
    totalVotes++
    if (!anonymous) userVotes.push({ account: me.account, options: mine })
    if (anonymous || quiz) {
      docs.push({
        _id: `${_id}-answer` as Ref<PollAnswer>,
        _class: activity.class.PollAnswer,
        space: me.space,
        modifiedOn: now,
        modifiedBy: me.socialId,
        attachedTo: _id,
        options: mine,
        quizAnswer
      } as unknown as PollAnswer)
    }
  }

  const poll = {
    _id,
    _class: activity.class.Poll,
    space: channel,
    modifiedOn: now,
    modifiedBy: me.socialId,
    createdOn: now - 2 * DAY,
    createdBy: me.socialId,
    attachedTo: 'story-message',
    attachedToClass: activity.class.ActivityMessage,
    collection: 'applets',
    applet: activity.applet.Poll,
    mode: kind === 'multiple' ? 'multiple' : 'single',
    anonymous,
    quiz,
    revote: !quiz,
    question: quiz ? 'Which dish is Japanese?' : 'What shall we order for lunch?',
    options,
    startAt,
    endAt,
    totalVotes,
    votes,
    userVotes: anonymous ? [] : userVotes,
    // The answer of a quiz is revealed once it has ended.
    quizAnswer: quiz && situation === 'ended' ? quizAnswer : undefined,
    quizAnswerHash: quiz ? 'story-hash' : undefined
  } as unknown as Poll

  return { poll, docs: [poll, ...docs], quizAnswer }
}
