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

const mockUpdate = jest.fn().mockResolvedValue(undefined)
const mockCommit = jest.fn().mockResolvedValue(undefined)

jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({ apply: () => ({ update: mockUpdate, createDoc: jest.fn(), commit: mockCommit }) })
}))
jest.mock('@hcengineering/core', () => ({
  getCurrentAccount: () => ({ uuid: 'me' })
}))
jest.mock('@hcengineering/activity-resources', () => ({
  sortActivityMessages: (messages: Array<{ createdOn: number }>) =>
    [...messages].sort((a, b) => a.createdOn - b.createdOn)
}))
jest.mock('@hcengineering/notification', () => ({
  __esModule: true,
  default: { class: { ReadNotificationAction: 'notification:class:ReadNotificationAction' } },
  isUnreadMessageId: () => true
}))

// eslint-disable-next-line import/first
import { readViewportMessages } from '../scroll'

const viewport = { top: 0, bottom: 100 }

function element (top: number, bottom: number): any {
  return { getBoundingClientRect: () => ({ top, bottom }) }
}

function view (elements: Record<string, any>): { scrollDiv: any, contentDiv: any } {
  return {
    scrollDiv: { getBoundingClientRect: () => viewport },
    contentDiv: { getElementsByClassName: () => elements }
  }
}

function message (id: string, createdOn: number): any {
  return { _id: id, createdOn, modifiedOn: createdOn }
}

async function settle (): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('readViewportMessages', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockUpdate.mockClear()
    mockCommit.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('reads the messages on screen after the debounce', async () => {
    const readState: any = { _id: 'rs', attachedTo: 'chat-debounced' }
    const { scrollDiv, contentDiv } = view({ m1: element(10, 30), m2: element(40, 60), below: element(150, 170) })
    const messages = [message('m1', 1000), message('m2', 2000), message('below', 3000)]

    readViewportMessages('chat-debounced' as any, messages, scrollDiv, contentDiv, undefined, readState)
    await settle()
    expect(mockUpdate).not.toHaveBeenCalled()

    jest.advanceTimersByTime(500)
    await settle()

    // Up to the last message on screen, not to the one below the viewport.
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(readState, { me: { messageId: 'm2', timestamp: 2000 } })
  })

  it('reads at once when the view is going away, and leaves nothing for the timer', async () => {
    const readState: any = { _id: 'rs', attachedTo: 'chat-closing' }
    const { scrollDiv, contentDiv } = view({ m1: element(10, 30) })

    readViewportMessages(
      'chat-closing' as any,
      [message('m1', 1000)],
      scrollDiv,
      contentDiv,
      undefined,
      readState,
      true
    )
    await settle()

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(readState, { me: { messageId: 'm1', timestamp: 1000 } })

    jest.advanceTimersByTime(1000)
    await settle()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it('takes over what an earlier debounced pass has collected', async () => {
    const readState: any = { _id: 'rs', attachedTo: 'chat-both' }
    const first = view({ m1: element(10, 30) })
    readViewportMessages(
      'chat-both' as any,
      [message('m1', 1000)],
      first.scrollDiv,
      first.contentDiv,
      undefined,
      readState
    )

    const second = view({ m2: element(40, 60) })
    const messages = [message('m1', 1000), message('m2', 2000)]
    readViewportMessages('chat-both' as any, messages, second.scrollDiv, second.contentDiv, undefined, readState, true)
    await settle()

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(readState, { me: { messageId: 'm2', timestamp: 2000 } })

    jest.advanceTimersByTime(1000)
    await settle()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })
})
