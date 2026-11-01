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
import core, { type Class, type Doc, type DocPreview, type Ref } from '@hcengineering/core'

import { serverActivityPlugin as serverActivity } from '../plugin'
import { getPreviewData, hasPreview, previewSpace, previewUpdate } from '../preview'
import { getDocIcon, getDocIdentifier, getDocProps, getDocTitle, getTitlePresenter } from '../utils'
import type { PresenterControl } from '../types'

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  getDocTitle: jest.fn(),
  getDocIdentifier: jest.fn(),
  getDocLabel: jest.fn(async () => undefined),
  getDocIcon: jest.fn(),
  getDocProps: jest.fn(),
  getTitlePresenter: jest.fn(),
  getIconPresenter: jest.fn()
}))

const issueClass = 'class:Issue' as Ref<Class<Doc>>
const requestClass = 'class:Request' as Ref<Class<Doc>>
const settingClass = 'class:Setting' as Ref<Class<Doc>>
const directClass = 'class:Direct' as Ref<Class<Doc>>
const todoClass = 'class:ToDo' as Ref<Class<Doc>>
const reviewClass = 'class:Review' as Ref<Class<Doc>>
const messageClass = activity.class.ActivityMessage

// Activity: issue, direct (a space), review; collaborators only: request, to-do; `NoPreview`: to-do, review
function makeControl (): PresenterControl {
  const parents: Record<string, string> = { [directClass]: core.class.Space }
  const withActivity: string[] = [issueClass, directClass, reviewClass, messageClass]
  const withCollaborators: string[] = [requestClass, todoClass, reviewClass]
  const noPreview: string[] = [todoClass, reviewClass]
  return {
    ctx: { error: jest.fn() },
    hierarchy: {
      isMixin: () => false,
      isDerived: (_class: string, base: string) => _class === base || parents[_class] === base,
      classHierarchyMixin: (_class: string, mixin: string) => {
        if (mixin === activity.mixin.ActivityDoc) return withActivity.includes(_class) ? {} : undefined
        if (mixin === serverActivity.mixin.NoPreview) return noPreview.includes(_class) ? {} : undefined
        return undefined
      },
      getAncestors: (_class: string) => [_class],
      getDomain: () => 'tracker'
    },
    modelDb: {
      findAllSync: (_class: string, query: any) =>
        _class === core.class.ClassCollaborators
          ? withCollaborators
              .filter((it) => query.attachedTo.$in.includes(it) === true)
              .map((attachedTo) => ({ attachedTo }))
          : []
    }
  } as any as PresenterControl
}

describe('hasPreview', () => {
  const control = makeControl()

  it('keeps a preview for a document with activity or with collaborators', () => {
    expect(hasPreview(control, issueClass)).toBe(true)
    expect(hasPreview(control, requestClass)).toBe(true)
    expect(hasPreview(control, settingClass)).toBe(false)
  })

  it('keeps none for a message: a thread shows the preview of its document', () => {
    expect(hasPreview(control, messageClass)).toBe(false)
  })

  it('keeps none for a class marked NoPreview, unless it has activity and so a chat', () => {
    expect(hasPreview(control, todoClass)).toBe(false)
    expect(hasPreview(control, reviewClass)).toBe(true)
  })
})

describe('getPreviewData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getDocTitle as jest.Mock).mockImplementation(async (_control, doc) => doc.name)
    ;(getDocIdentifier as jest.Mock).mockImplementation(async (_control, doc) => doc.identifier)
    ;(getDocIcon as jest.Mock).mockResolvedValue(undefined)
    ;(getDocProps as jest.Mock).mockResolvedValue(undefined)
    ;(getTitlePresenter as jest.Mock).mockReturnValue(undefined)
  })

  it('asks the title as any text does', async () => {
    const issue = { _id: 'issue-1', _class: issueClass, space: 'space-1', name: 'Fix', identifier: 'TSK-1' } as any
    expect(await getPreviewData(makeControl(), issue)).toEqual({
      objectId: 'issue-1',
      objectClass: issueClass,
      objectDomain: 'tracker',
      title: 'Fix',
      identifier: 'TSK-1',
      label: undefined,
      icon: undefined,
      archived: false,
      props: undefined
    })
    expect(getDocTitle).toHaveBeenCalledWith(expect.anything(), issue)
  })

  it('keeps the props its class presenter gives, and the archived flag of a space', async () => {
    ;(getDocProps as jest.Mock).mockImplementation(async (_control, doc) => ({ members: doc.members, type: doc.type }))
    const direct = {
      _id: 'dm-1',
      _class: directClass,
      name: '',
      type: 'person',
      members: ['a', 'b'],
      archived: true
    } as any
    const data = await getPreviewData(makeControl(), direct)
    expect(data.props).toEqual({ members: ['a', 'b'], type: 'person' })
    expect(data.archived).toBe(true)
  })

  it('leaves the props out without a presenter, and a missing archived flag false', async () => {
    const channel = { _id: 'ch-1', _class: directClass, name: 'general', members: ['a'] } as any
    const data = await getPreviewData(makeControl(), channel)
    expect(data.props).toBeUndefined()
    expect(data.archived).toBe(false)
  })

  it('leaves the field of a failing presenter empty and keeps the rest', async () => {
    ;(getDocIdentifier as jest.Mock).mockRejectedValue(new Error('no project'))
    const control = makeControl()
    const data = await getPreviewData(control, { _id: 'issue-1', _class: issueClass, name: 'Fix' } as any)
    expect(data.title).toBe('Fix')
    expect(data.identifier).toBeUndefined()
    expect(control.ctx.error).toHaveBeenCalledTimes(1)
  })
})

describe('previewUpdate', () => {
  const preview = {
    _id: 'p-1',
    objectId: 'issue-1',
    objectClass: issueClass,
    objectDomain: 'tracker',
    title: 'Old',
    identifier: 'TSK-1',
    archived: false
  } as any as DocPreview

  it('changes what differs and unsets what went away', () => {
    const data = { ...preview, title: 'New', identifier: undefined } as any
    expect(previewUpdate(preview, data)).toEqual({ title: 'New', $unset: { identifier: '' } })
  })

  it('is empty when nothing differs', () => {
    expect(previewUpdate(preview, { ...preview } as any)).toEqual({})
  })

  it('reads stored objects regardless of the order of their keys', () => {
    const stored = {
      ...preview,
      props: { type: 'person', members: ['a', 'b'] },
      icon: { props: { members: ['a', 'b'] }, asset: 'x' }
    } as any
    const built = {
      ...preview,
      props: { members: ['a', 'b'], type: 'person' },
      icon: { asset: 'x', props: { members: ['a', 'b'] } }
    } as any
    expect(previewUpdate(stored, built)).toEqual({})
    expect(previewUpdate(stored, { ...built, props: { members: ['b', 'a'], type: 'person' } })).toEqual({
      props: { members: ['b', 'a'], type: 'person' }
    })
  })
})

describe('previewSpace', () => {
  it('keeps the preview of a space in the space itself', () => {
    const control = makeControl()
    expect(previewSpace(control, { _id: 'dm-1', _class: directClass, space: core.space.Space } as any)).toBe('dm-1')
    expect(previewSpace(control, { _id: 'issue-1', _class: issueClass, space: 'space-1' } as any)).toBe('space-1')
  })
})
