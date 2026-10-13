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

import activity, { type ActivityMessage } from '@hcengineering/activity'
import { type Class, type Doc, type Ref } from '@hcengineering/core'

jest.mock('@hcengineering/presentation', () => ({}))
jest.mock('@hcengineering/view-resources', () => ({}))

// eslint-disable-next-line import/first
import { attributesFilter } from '../activityMessagesUtils'

const issueClass = 'class:Bug' as Ref<Class<Doc>>
const oldClass = 'class:Issue' as Ref<Class<Doc>>

function message (objectId: string, objectClass: Ref<Class<Doc>>): ActivityMessage {
  return {
    _class: activity.class.DocUpdateMessage,
    attachedTo: 'issue-1',
    objectId,
    objectClass
  } as unknown as ActivityMessage
}

describe('attributesFilter', () => {
  it('keeps own updates recorded under a previous class', () => {
    expect(attributesFilter(message('issue-1', oldClass), issueClass)).toBe(true)
  })

  it('keeps collection updates of the doc class', () => {
    expect(attributesFilter(message('sub-1', issueClass), issueClass)).toBe(true)
  })

  it('drops collection updates of other classes', () => {
    expect(attributesFilter(message('att-1', 'class:Attachment' as Ref<Class<Doc>>), issueClass)).toBe(false)
  })
})
