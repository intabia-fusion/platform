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

import activity, { type ActivityReference } from '@hcengineering/activity'
import { type Doc, type Domain } from '@hcengineering/core'
import { type MigrationClient } from '@hcengineering/model'
import { migrateTaskReferenceClasses } from '../referenceClasses'

const taskDomain = 'task' as Domain
const activityDomain = 'activity' as Domain

function reference (id: string, over: Record<string, unknown> = {}): ActivityReference {
  return {
    _id: id,
    _class: activity.class.ActivityReference,
    space: 'space',
    srcDocId: 'issue-1',
    srcDocClass: 'removed-type',
    attachedTo: 'document-1',
    attachedToClass: 'document:class:Document',
    collection: 'references',
    message: 'original text',
    modifiedOn: 1,
    modifiedBy: 'user',
    ...over
  } as any as ActivityReference
}

function makeClient (references: ActivityReference[], tasks: Record<string, string>): MigrationClient {
  let offset = 0
  const docs = Object.entries(tasks).map(([_id, _class]) => ({ _id, _class })) as Doc[]
  return {
    hierarchy: { hasClass: (clazz: string) => clazz !== 'missing-task-class' },
    traverse: jest.fn(async () => {
      offset = 0
      return {
        next: jest.fn(async (limit: number) => {
          const result = references.slice(offset, offset + limit)
          offset += result.length
          return result
        }),
        close: jest.fn(async () => {})
      }
    }),
    find: jest.fn(async (_domain, query) => docs.filter((doc) => query._id.$in.includes(doc._id) === true)),
    bulk: jest.fn(async (_domain, operations) => {
      for (const { filter, update } of operations) {
        Object.assign(references.find((ref) => ref._id === filter._id) ?? {}, update)
      }
    })
  } as unknown as MigrationClient
}

describe('migrateTaskReferenceClasses', () => {
  it('repairs all live pointers to tasks, including removed and still existing old types', async () => {
    const refs = [
      reference('outgoing'),
      reference('incoming', {
        srcDocId: 'document-1',
        srcDocClass: 'document:class:Document',
        attachedTo: 'issue-1',
        attachedToClass: 'existing-old-type'
      }),
      reference('attached', {
        srcDocId: 'document-1',
        srcDocClass: 'document:class:Document',
        attachedDocId: 'issue-1',
        attachedDocClass: 'removed-type'
      })
    ]
    const client = makeClient(refs, { 'issue-1': 'current-type' })
    await migrateTaskReferenceClasses(client, taskDomain, activityDomain)
    expect(client.traverse).toHaveBeenCalledWith(activityDomain,
      { _class: activity.class.ActivityReference }, expect.any(Object))
    expect(client.find).toHaveBeenCalledWith(taskDomain, {
      _id: { $in: ['issue-1', 'document-1'] }
    }, { projection: { _id: 1, _class: 1 } })
    expect(client.bulk).toHaveBeenCalledWith(activityDomain, [
      { filter: { _id: 'outgoing' }, update: { srcDocClass: 'current-type' } },
      { filter: { _id: 'incoming' }, update: { attachedToClass: 'current-type' } },
      { filter: { _id: 'attached' }, update: { attachedDocClass: 'current-type' } }
    ])
    expect(refs[0]).toMatchObject({ message: 'original text', modifiedOn: 1, srcDocClass: 'current-type' })
    const iterator = await (client.traverse as jest.Mock).mock.results[0].value
    expect(iterator.close).toHaveBeenCalledTimes(1)

    ;(client.bulk as jest.Mock).mockClear()
    await migrateTaskReferenceClasses(client, taskDomain, activityDomain)
    expect(client.bulk).not.toHaveBeenCalled()
  })

  it('leaves missing sources, invalid task classes and non-task pointers intact', async () => {
    const refs = [reference('missing'), reference('non-task', { srcDocId: 'document-2' })]
    const before = JSON.stringify(refs)
    const client = makeClient(refs, { 'issue-1': 'missing-task-class' })
    await migrateTaskReferenceClasses(client, taskDomain, activityDomain)
    expect(client.bulk).not.toHaveBeenCalled()
    expect(JSON.stringify(refs)).toBe(before)
  })

  it('continues across batches', async () => {
    const refs = Array.from({ length: 501 }, (_, index) => reference(String(index)))
    const client = makeClient(refs, { 'issue-1': 'current-type' })
    await migrateTaskReferenceClasses(client, taskDomain, activityDomain)
    expect(client.bulk).toHaveBeenCalledTimes(2)
    expect(refs.every((ref) => ref.srcDocClass === 'current-type')).toBe(true)
  })

  it('closes the iterator if a write fails', async () => {
    const client = makeClient([reference('broken')], { 'issue-1': 'current-type' })
    ;(client.bulk as jest.Mock).mockRejectedValue(new Error('write failed'))
    await expect(migrateTaskReferenceClasses(client, taskDomain, activityDomain)).rejects.toThrow('write failed')
    const iterator = await (client.traverse as jest.Mock).mock.results[0].value
    expect(iterator.close).toHaveBeenCalledTimes(1)
  })
})
