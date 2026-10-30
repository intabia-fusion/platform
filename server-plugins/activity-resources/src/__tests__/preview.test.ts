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
import core, {
  type AccountUuid,
  type Class,
  type Doc,
  type DocPreview,
  type Ref,
  type Space,
  type Tx,
  type TxCreateDoc,
  type TxUpdateDoc,
  TxFactory,
  toFindResult
} from '@hcengineering/core'
import { getIconPresenter, getPropsPresenter } from '@hcengineering/server-activity'
import { type TriggerControl } from '@hcengineering/server-core'

import plugin from '../index'
import { FieldsIconPresenter, OnDocCreated, OnDocPreviewMoved, OnDocUpdated } from '../preview'

// What a preview shows is server-activity's to compute (tested there); here it comes from the document.
jest.mock('@hcengineering/server-activity', () => {
  const actual = jest.requireActual('@hcengineering/server-activity')
  return {
    ...actual,
    hasPreview: jest.fn((_control: unknown, _class: string) =>
      ['class:Issue', 'class:Task', 'class:DirectMessage'].includes(_class)
    ),
    getPreviewData: jest.fn(async (_control: unknown, doc: any) => ({
      objectId: doc._id,
      objectClass: doc._class,
      objectDomain: 'tracker',
      title: doc.name ?? '',
      identifier: doc.identifier,
      label: undefined,
      icon: doc.icon,
      archived: doc.archived === true,
      props: doc.props
    })),
    getTitlePresenter: jest.fn(),
    getIconPresenter: jest.fn(),
    getIdentifierPresenter: jest.fn(),
    getLabelPresenter: jest.fn(),
    getPropsPresenter: jest.fn()
  }
})

const issueClass = 'class:Issue' as Ref<Class<Doc>>
const taskClass = 'class:Task' as Ref<Class<Doc>>
const directClass = 'class:DirectMessage' as Ref<Class<Space>>
const plainClass = 'class:Setting' as Ref<Class<Doc>>

const txFactory = new TxFactory('test-account' as any)

interface Stored {
  previews?: Partial<DocPreview>[]
  docs?: Doc[]
}

// Issue, Task and DirectMessage (a space) have previews; `findAll` answers from `stored`
function makeControl (stored: Stored = {}): TriggerControl {
  const activityClasses: Ref<Class<Doc>>[] = [issueClass, taskClass, directClass]
  return {
    ctx: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), newChild: jest.fn().mockReturnThis() },
    txFactory,
    hierarchy: {
      classHierarchyMixin: (_class: Ref<Class<Doc>>, mixin: Ref<Doc>) =>
        mixin === activity.mixin.ActivityDoc && activityClasses.includes(_class) ? {} : undefined,
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) =>
        base === core.class.Space ? _class === directClass : _class === base,
      findClass: () => ({ titleKey: 'name' }),
      getAncestors: (_class: Ref<Class<Doc>>) => [_class],
      getDomain: () => 'tracker',
      findDomain: () => 'tracker'
    },
    findAll: jest.fn(async (_ctx: unknown, _class: Ref<Class<Doc>>, query: any) => {
      // A value or `$in`, as the triggers ask by one id or by a batch of them.
      const asked = (cond: any, value: any): boolean =>
        cond === undefined || cond === value || (Array.isArray(cond?.$in) && cond.$in.includes(value))
      if (_class === core.class.DocPreview) {
        return toFindResult(
          (stored.previews ?? []).filter(
            (it) => asked(query.objectId, it.objectId) && asked(query.objectClass, it.objectClass)
          ) as any
        )
      }
      if (_class === activity.class.ActivityMessage) return toFindResult([])
      return toFindResult((stored.docs ?? []).filter((it) => it._class === _class && asked(query._id, it._id)) as any)
    })
  } as any as TriggerControl
}

const previewOf = (doc: Partial<Doc> & Record<string, any>, extra: Partial<DocPreview> = {}): Partial<DocPreview> => ({
  _id: 'preview-1' as Ref<DocPreview>,
  _class: core.class.DocPreview,
  space: 'space-1' as Ref<Space>,
  objectId: doc._id,
  objectClass: doc._class,
  objectDomain: 'tracker' as any,
  title: doc.name,
  archived: false,
  ...extra
})

const updateTx = (doc: Doc, operations: Record<string, any>): TxUpdateDoc<Doc> =>
  txFactory.createTxUpdateDoc(doc._class, doc.space, doc._id, operations as any)

describe('OnDocCreated (preview)', () => {
  const trigger = async (txes: TxCreateDoc<Doc>[]): Promise<TxCreateDoc<DocPreview>[]> =>
    (await OnDocCreated(txes, makeControl())) as TxCreateDoc<DocPreview>[]

  it('gives an activity document a preview in its space', async () => {
    const tx = txFactory.createTxCreateDoc(
      issueClass,
      'space-1' as Ref<Space>,
      { name: 'Fix the login', identifier: 'TSK-1', icon: { asset: 'icon:bug' } } as any,
      'issue-1' as Ref<Doc>
    )
    const [res] = await trigger([tx])

    expect(res._class).toBe(core.class.TxCreateDoc)
    expect(res.objectClass).toBe(core.class.DocPreview)
    expect(res.objectSpace).toBe('space-1')
    expect(res.attributes).toEqual({
      objectId: 'issue-1',
      objectClass: issueClass,
      objectDomain: 'tracker',
      title: 'Fix the login',
      identifier: 'TSK-1',
      label: undefined,
      icon: { asset: 'icon:bug' },
      archived: false,
      props: undefined
    })
  })

  it('keeps the preview of a space in the space itself', async () => {
    const tx = txFactory.createTxCreateDoc(
      directClass,
      core.space.Space,
      { name: '', members: ['acc-a'], archived: true } as any,
      'direct-1' as Ref<Space>
    )
    const [res] = await trigger([tx])

    expect(res.objectSpace).toBe('direct-1')
    expect(res.attributes.objectId).toBe('direct-1')
    expect(res.attributes.archived).toBe(true)
  })

  it('ignores documents without a preview', async () => {
    const tx = txFactory.createTxCreateDoc(plainClass, 'space-1' as Ref<Space>, { name: 'x' } as any)
    expect(await trigger([tx])).toEqual([])
  })
})

describe('OnDocUpdated (preview)', () => {
  const issue = {
    _id: 'issue-1',
    _class: issueClass,
    space: 'space-1',
    name: 'Renamed',
    identifier: 'TSK-1'
  } as any as Doc

  beforeEach(() => {
    ;(getIconPresenter as jest.Mock).mockReset()
    ;(getPropsPresenter as jest.Mock).mockReset()
  })

  const operations = (txes: Tx[]): any => (txes[0] as TxUpdateDoc<DocPreview>).operations

  it('renames the preview when the title key changes, touching nothing else', async () => {
    const control = makeControl({
      previews: [previewOf(issue, { title: 'Old', identifier: 'TSK-1' })],
      docs: [issue]
    })
    const res = await OnDocUpdated([updateTx(issue, { name: 'Renamed' })], control)

    expect(res).toHaveLength(1)
    expect((res[0] as TxUpdateDoc<DocPreview>).objectId).toBe('preview-1')
    expect(operations(res)).toEqual({ title: 'Renamed' })
  })

  it('unsets a display field the document lost', async () => {
    const bare = { ...issue, identifier: undefined } as any as Doc
    const control = makeControl({ previews: [previewOf(issue, { identifier: 'TSK-1' })], docs: [bare] })
    const res = await OnDocUpdated([updateTx(issue, { name: 'Renamed' })], control)
    expect(operations(res)).toEqual({ $unset: { identifier: '' } })
  })

  it('does nothing for a field no presenter watches', async () => {
    const control = makeControl({ previews: [previewOf(issue)], docs: [issue] })
    expect(await OnDocUpdated([updateTx(issue, { description: 'x' })], control)).toEqual([])
    expect(control.findAll).not.toHaveBeenCalled()
  })

  it('follows the fields a presenter watches', async () => {
    ;(getIconPresenter as jest.Mock).mockReturnValue({ triggerFields: ['color'] })
    const withIcon = { ...issue, icon: { asset: 'icon:red' } } as any as Doc
    const control = makeControl({ previews: [previewOf(issue, { identifier: 'TSK-1' })], docs: [withIcon] })
    const res = await OnDocUpdated([updateTx(issue, { color: 'red' })], control)
    expect(operations(res)).toEqual({ icon: { asset: 'icon:red' } })
  })

  it('merges the txes of a batch on one document: archived and the props of a space', async () => {
    ;(getPropsPresenter as jest.Mock).mockReturnValue({ triggerFields: ['members'] })
    const direct = {
      _id: 'direct-1',
      _class: directClass,
      space: core.space.Space,
      name: '',
      props: { members: ['acc-a', 'acc-b'] },
      archived: true
    } as any as Doc
    const control = makeControl({
      previews: [previewOf(direct, { props: { members: ['acc-a'] as AccountUuid[] } })],
      docs: [direct]
    })
    const res = await OnDocUpdated(
      [updateTx(direct, { $push: { members: 'acc-b' } }), updateTx(direct, { archived: true })],
      control
    )
    expect(res).toHaveLength(1)
    expect(operations(res)).toEqual({ archived: true, props: { members: ['acc-a', 'acc-b'] } })
  })

  it('leaves the members of a space without a props presenter alone', async () => {
    const channel = { _id: 'channel-1', _class: directClass, space: core.space.Space, name: 'general' } as any as Doc
    const control = makeControl({ previews: [previewOf(channel)], docs: [channel] })
    expect(await OnDocUpdated([updateTx(channel, { $push: { members: 'acc-b' } })], control)).toEqual([])
    expect(control.findAll).not.toHaveBeenCalled()
  })

  it('leaves a move to OnDocPreviewMoved', async () => {
    const control = makeControl({ previews: [previewOf(issue)], docs: [{ ...issue, space: 'space-2' } as any] })
    expect(await OnDocUpdated([updateTx(issue, { space: 'space-2' })], control)).toEqual([])
    expect(control.findAll).not.toHaveBeenCalled()
  })

  it('creates no preview a document lacks: two requests would make it twice', async () => {
    const control = makeControl({ docs: [issue] })
    expect(await OnDocUpdated([updateTx(issue, { name: 'Renamed' })], control)).toEqual([])
    expect(control.findAll).toHaveBeenCalledTimes(1)
  })
})

describe('OnDocPreviewRemoved and OnDocPreviewMoved', () => {
  const issue = { _id: 'issue-1', _class: issueClass, space: 'space-1', name: 'Fix' } as any as Doc

  it('removes the preview with the document', async () => {
    const control = makeControl({ previews: [previewOf(issue)] })
    const tx = txFactory.createTxRemoveDoc(issue._class, issue.space, issue._id)
    const res = await (await plugin()).trigger.OnDocPreviewRemoved([tx], control)
    expect(res.map((it) => [it._class, (it as any).objectClass, (it as any).objectId])).toEqual([
      [core.class.TxRemoveDoc, core.class.DocPreview, 'preview-1']
    ])
  })

  it('moves the preview to the new class with the display of that class', async () => {
    const asTask = { ...issue, _class: taskClass, name: 'Fix as a task' } as any as Doc
    const control = makeControl({ previews: [previewOf(issue)], docs: [asTask] })
    const tx = updateTx(issue, { _class: taskClass })
    const res = await OnDocPreviewMoved([tx], control)
    expect(res).toHaveLength(1)
    const ops = (res[0] as TxUpdateDoc<DocPreview>).operations as any
    expect(ops.objectClass).toBe(taskClass)
    expect(ops.title).toBe('Fix as a task')
  })

  it('makes the preview of a document whose new class has one', async () => {
    const plain = { ...issue, _class: plainClass } as any as Doc
    const asTask = { ...issue, _class: taskClass } as any as Doc
    const control = makeControl({ docs: [asTask] })
    const [res] = (await OnDocPreviewMoved(
      [updateTx(plain, { _class: taskClass })],
      control
    )) as TxCreateDoc<DocPreview>[]
    expect(res._class).toBe(core.class.TxCreateDoc)
    expect(res.objectSpace).toBe('space-1')
    expect(res.attributes).toMatchObject({ objectId: 'issue-1', objectClass: taskClass })
  })

  it('moves the preview to the space the document is in: a parallel request may have moved it again', async () => {
    const moved = { ...issue, space: 'space-3' } as any as Doc
    const control = makeControl({ previews: [previewOf(issue)], docs: [moved] })
    const res = await OnDocPreviewMoved([updateTx(issue, { space: 'space-2' })], control)
    expect(res.map((it) => (it as TxUpdateDoc<DocPreview>).operations)).toEqual([{ space: 'space-3' }])
    // Sent to the members of the new space
    expect((res[0] as TxUpdateDoc<DocPreview>).objectSpace).toBe('space-3')
  })

  it('reads no document for a move of one without a preview', async () => {
    const control = makeControl({ docs: [issue] })
    expect(await OnDocPreviewMoved([updateTx(issue, { space: 'space-2' })], control)).toEqual([])
    expect((control.findAll as jest.Mock).mock.calls.map(([, _class]) => _class)).toEqual([core.class.DocPreview])
  })

  it('keeps the preview where the document already is and ignores other updates', async () => {
    const control = makeControl({ previews: [previewOf(issue)], docs: [issue] })
    expect(await OnDocPreviewMoved([updateTx(issue, { space: issue.space })], control)).toEqual([])
    expect(await OnDocPreviewMoved([updateTx(issue, { name: 'Renamed' })], control)).toEqual([])
  })

  it('removes the previews of a batch with one query per domain', async () => {
    const other = { ...issue, _id: 'issue-2' } as any as Doc
    const control = makeControl({ previews: [previewOf(issue), previewOf(other, { _id: 'preview-2' as any })] })
    const txes = [issue, other].map((it) => txFactory.createTxRemoveDoc(it._class, it.space, it._id))
    const res = await (await plugin()).trigger.OnDocPreviewRemoved(txes, control)
    expect(res.map((it) => (it as any).objectId)).toEqual(['preview-1', 'preview-2'])
    expect(
      (control.findAll as jest.Mock).mock.calls.filter(([, _class]) => _class === core.class.DocPreview)
    ).toHaveLength(1)
  })
})

describe('FieldsIconPresenter', () => {
  it('gives the icon component the document cut to the fields the presenter watches', async () => {
    ;(getIconPresenter as jest.Mock).mockReturnValue({ triggerFields: ['icon', 'color'] })
    const doc = { _id: 'doc-1', _class: issueClass, space: 'space-1', icon: 'emoji', color: 7, content: 'x' } as any
    expect(await FieldsIconPresenter(doc, makeControl())).toEqual({
      props: { value: { _id: 'doc-1', _class: issueClass, icon: 'emoji', color: 7 } }
    })
  })
})
