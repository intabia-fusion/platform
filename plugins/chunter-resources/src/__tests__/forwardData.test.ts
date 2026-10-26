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

import activity from '@hcengineering/activity'
import { type ChatMessage } from '@hcengineering/chunter'
import { EmptyMarkup } from '@hcengineering/text'

const findAll = jest.fn()
const pollApplet = { snapshotFields: ['question', 'options', 'totalVotes', 'votes'] }

jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({
    findAll,
    getModel: () => ({ findObject: (_id: string) => (_id === activity.applet.Poll ? pollApplet : undefined) })
  })
}))

// Imported after the mock, as the module takes the client from it.
// eslint-disable-next-line import/first
import { getForwardData } from '../forwardData'

const textMarkup = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hi"}]}]}'

function message (data: Partial<ChatMessage>): ChatMessage {
  return {
    _id: 'msg-1',
    _class: 'chunter:class:ChatMessage',
    space: 'channel-1',
    attachedTo: 'channel-1',
    attachedToClass: 'chunter:class:Channel',
    collection: 'messages',
    message: EmptyMarkup,
    attachments: 0,
    createdBy: 'author',
    createdOn: 100,
    modifiedBy: 'author',
    modifiedOn: 100,
    ...data
  } as unknown as ChatMessage
}

describe('getForwardData', () => {
  beforeEach(() => {
    findAll.mockReset()
  })

  it('forwards a message that has only a poll, as a copy without voters and the quiz answer', async () => {
    findAll.mockResolvedValue([
      {
        _id: 'poll-1',
        _class: activity.class.Poll,
        space: 'channel-1',
        attachedTo: 'msg-1',
        attachedToClass: 'chunter:class:ChatMessage',
        collection: 'applets',
        applet: activity.applet.Poll,
        question: 'Lunch?',
        options: [{ id: 'a', label: 'Pizza' }],
        totalVotes: 1,
        votes: { a: 1 },
        userVotes: [{ account: 'voter', options: ['a'] }],
        quizAnswer: 'a',
        quizAnswerHash: 'hash'
      }
    ])

    const data = await getForwardData(message({ applets: 1 }))

    expect(findAll).toHaveBeenCalledWith(activity.class.AppletInstance, { attachedTo: 'msg-1' })
    expect(data.forwardedMessage).toBe('msg-1')
    expect(data.forwardFromId).toBe('channel-1')
    expect(data.forwardContent?.attachments).toEqual([])
    expect(data.forwardContent?.applets).toEqual([
      {
        _id: 'poll-1',
        _class: activity.class.Poll,
        collection: 'applets',
        applet: activity.applet.Poll,
        question: 'Lunch?',
        options: [{ id: 'a', label: 'Pizza' }],
        totalVotes: 1,
        votes: { a: 1 }
      }
    ])
  })

  it('keeps only the binding of an applet whose kind lists no fields', async () => {
    findAll.mockResolvedValue([
      { _id: 'note-1', _class: 'test:class:Note', collection: 'applets', applet: 'unknown', secret: 'x' }
    ])
    const data = await getForwardData(message({ applets: 1 }))
    expect(data.forwardContent?.applets).toEqual([
      { _id: 'note-1', _class: 'test:class:Note', collection: 'applets', applet: 'unknown' }
    ])
  })

  it('does not look for applets of a message without them', async () => {
    const data = await getForwardData(message({ message: textMarkup, applets: 0 }))

    expect(findAll).not.toHaveBeenCalled()
    expect(data.forwardedMessage).toBe('msg-1')
    expect(data.forwardContent?.applets).toEqual([])
  })

  it('passes on the forward of a message that has no content of its own', async () => {
    const forwardContent = { author: 'origin-author', message: textMarkup, createdOn: 50, attachments: [] }
    const data = await getForwardData(
      message({
        forwardedMessage: 'origin' as any,
        forwardFromId: 'channel-2' as any,
        forwardFromClass: 'chunter:class:Channel' as any,
        forwardContent: forwardContent as any
      })
    )

    expect(data).toEqual({
      forwardedMessage: 'origin',
      forwardFromId: 'channel-2',
      forwardFromClass: 'chunter:class:Channel',
      forwardContent
    })
  })

  it('forwards nothing for an empty message', async () => {
    expect(await getForwardData(message({}))).toEqual({})
  })
})
