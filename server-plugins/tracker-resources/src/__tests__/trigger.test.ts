/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import core, {
  type Data,
  type Doc,
  generateId,
  type Ref,
  type Space,
  type Tx,
  TxFactory,
  type TxCreateDoc,
  type TxUpdateDoc,
  type TxRemoveDoc,
  type WithLookup,
  type MeasureContext,
  type PersonId,
  type Class,
  toFindResult
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import tracker, {
  type Issue,
  type IssueParentInfo,
  type IssueChildInfo,
  type TimeSpendReport
} from '@hcengineering/tracker'
import { OnIssueUpdate } from '../index'

// -- Helpers --

const testSpace = 'test-space' as Ref<Space>
const testAccount = 'test-account' as PersonId

interface MockIssueData {
  _id: Ref<Issue>
  title: string
  identifier: string
  estimation: number
  reportedTime: number
  remainingTime: number
  parents: IssueParentInfo[]
  childInfo: IssueChildInfo[]
  space: Ref<Space>
  attachedTo: Ref<Issue>
}

function createMockIssue (data: Partial<MockIssueData> = {}): WithLookup<Issue> {
  return {
    _id: data._id ?? generateId(),
    _class: tracker.class.Issue,
    space: data.space ?? testSpace,
    title: data.title ?? 'Test Issue',
    identifier: data.identifier ?? 'TEST-1',
    estimation: data.estimation ?? 0,
    reportedTime: data.reportedTime ?? 0,
    remainingTime: data.remainingTime ?? 0,
    parents: data.parents ?? [],
    childInfo: data.childInfo ?? [],
    modifiedOn: Date.now(),
    modifiedBy: testAccount,
    createdBy: testAccount,
    createdOn: Date.now(),
    // Required Issue fields
    attachedTo: data.attachedTo ?? tracker.ids.NoParent,
    description: null,
    status: '' as any,
    priority: 0,
    component: null,
    subIssues: 0,
    number: 1,
    kind: '' as any,
    reports: 0
  } as unknown as WithLookup<Issue>
}

function createIssueTx (issue: WithLookup<Issue>): TxCreateDoc<Issue> {
  const { _id, _class, space, ...attributes } = issue
  return {
    _id: generateId(),
    _class: core.class.TxCreateDoc,
    space: core.space.DerivedTx,
    objectId: _id,
    objectClass: _class,
    objectSpace: space,
    modifiedOn: Date.now(),
    modifiedBy: testAccount,
    createdBy: testAccount,
    attributes: attributes as unknown as Data<Issue>
  } satisfies TxCreateDoc<Issue>
}

function createIssueUpdateTx (
  issueId: Ref<Issue>,
  operations: Partial<Issue> & Record<string, any>,
  space: Ref<Space> = testSpace
): TxUpdateDoc<Issue> {
  return {
    _id: generateId(),
    _class: core.class.TxUpdateDoc,
    space: core.space.DerivedTx,
    objectId: issueId,
    objectClass: tracker.class.Issue,
    objectSpace: space,
    modifiedOn: Date.now(),
    modifiedBy: testAccount,
    createdBy: testAccount,
    operations
  } satisfies TxUpdateDoc<Issue>
}

function createIssueRemoveTx (issueId: Ref<Issue>, space: Ref<Space> = testSpace): TxRemoveDoc<Issue> {
  return {
    _id: generateId(),
    _class: core.class.TxRemoveDoc,
    space: core.space.DerivedTx,
    objectId: issueId,
    objectClass: tracker.class.Issue,
    objectSpace: space,
    modifiedOn: Date.now(),
    modifiedBy: testAccount,
    createdBy: testAccount
  } satisfies TxRemoveDoc<Issue>
}

function createTimeReportTx (
  issueId: Ref<Issue>,
  value: number,
  space: Ref<Space> = testSpace
): TxCreateDoc<TimeSpendReport> {
  return {
    _id: generateId(),
    _class: core.class.TxCreateDoc,
    space: core.space.DerivedTx,
    objectId: generateId(),
    objectClass: tracker.class.TimeSpendReport,
    objectSpace: space,
    modifiedOn: Date.now(),
    modifiedBy: testAccount,
    createdBy: testAccount,
    attachedTo: issueId,
    attachedToClass: tracker.class.Issue,
    collection: 'reports',
    attributes: {
      attachedTo: issueId,
      employee: null,
      date: Date.now(),
      value,
      description: ''
    }
  } as unknown as TxCreateDoc<TimeSpendReport>
}

type FindAllFn = (ctx: any, _class: Ref<Class<Doc>>, query: any, options?: any) => Promise<Doc[]>

function createMockControl (findAllImpl: FindAllFn): TriggerControl {
  return {
    ctx: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      newChild: jest.fn().mockReturnThis(),
      contextData: { broadcast: { targets: {} } }
    } as unknown as MeasureContext,
    workspace: { url: 'test-ws', uuid: 'test-ws-uuid', dataId: 'test-data', accountsUrl: '' } as any,
    branding: null,
    findAll: jest.fn(async (...args: Parameters<FindAllFn>) => toFindResult(await findAllImpl(...args))),
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: {
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) => {
        return _class === base
      }
    } as any,
    modelDb: {} as any,
    removedMap: new Map(),
    userStatusMap: new Map(),
    cache: new Map(),
    contextCache: new Map(),
    txes: [],
    apply: jest.fn().mockResolvedValue({}),
    queryFind: jest.fn().mockResolvedValue([]),
    storageAdapter: {} as any,
    serviceAdaptersManager: {} as any,
    lowLevel: {} as any,
    domainRequest: jest.fn().mockResolvedValue({})
  } as unknown as TriggerControl
}

// Helper to extract $push/$pull operations from result transactions
function findChildInfoPush (txes: Tx[], parentId: Ref<Issue>): (IssueChildInfo & { parentId?: Ref<Issue> }) | undefined {
  for (const tx of txes) {
    if (tx._class === core.class.TxUpdateDoc) {
      const upd = tx as TxUpdateDoc<Issue>
      if (upd.objectId === parentId && (upd.operations as any).$push?.childInfo !== undefined) {
        return (upd.operations as any).$push.childInfo
      }
    }
  }
  return undefined
}

function findChildInfoPull (txes: Tx[], parentId: Ref<Issue>): boolean {
  for (const tx of txes) {
    if (tx._class === core.class.TxUpdateDoc) {
      const upd = tx as TxUpdateDoc<Issue>
      if (upd.objectId === parentId && (upd.operations as any).$pull?.childInfo !== undefined) {
        return true
      }
    }
  }
  return false
}

function findReportedTimeInc (txes: Tx[], issueId: Ref<Issue>): number | undefined {
  for (const tx of txes) {
    if (tx._class === core.class.TxUpdateDoc) {
      const upd = tx as TxUpdateDoc<Issue>
      if (upd.objectId === issueId && (upd.operations as any).$inc?.reportedTime !== undefined) {
        return (upd.operations as any).$inc.reportedTime
      }
    }
  }
  return undefined
}

function findRemainingTimeUpdate (txes: Tx[], issueId: Ref<Issue>): number | undefined {
  for (const tx of txes) {
    if (tx._class === core.class.TxUpdateDoc) {
      const upd = tx as TxUpdateDoc<Issue>
      if (upd.objectId === issueId && upd.operations.remainingTime !== undefined) {
        return upd.operations.remainingTime
      }
    }
  }
  return undefined
}

// -- Tests --

describe('OnIssueUpdate trigger', () => {
  describe('Issue creation — childInfo propagation', () => {
    it('should push childInfo to direct parent when sub-issue is created', async () => {
      const parentId: Ref<Issue> = generateId()
      const childIssue = createMockIssue({
        estimation: 5,
        reportedTime: 0,
        attachedTo: parentId,
        parents: [{ parentId, parentTitle: 'Parent', identifier: 'TEST-1', space: testSpace }]
      })

      const control = createMockControl(async () => [])
      const tx = createIssueTx(childIssue)
      const result = await OnIssueUpdate([tx], control)

      const pushed = findChildInfoPush(result, parentId)
      expect(pushed).toBeDefined()
      expect(pushed?.childId).toBe(childIssue._id)
      expect(pushed?.estimation).toBe(5)
      expect(pushed?.reportedTime).toBe(0)
      expect(pushed?.parentId).toBe(parentId)
    })

    it('should push childInfo to ALL ancestors (grandparent included)', async () => {
      const grandparentId: Ref<Issue> = generateId()
      const parentId: Ref<Issue> = generateId()

      const childIssue = createMockIssue({
        estimation: 3,
        reportedTime: 1,
        attachedTo: parentId,
        parents: [
          { parentId, parentTitle: 'Parent', identifier: 'TEST-2', space: testSpace },
          { parentId: grandparentId, parentTitle: 'Grandparent', identifier: 'TEST-1', space: testSpace }
        ]
      })

      const control = createMockControl(async () => [])
      const tx = createIssueTx(childIssue)
      const result = await OnIssueUpdate([tx], control)

      // Both parent and grandparent should get childInfo with correct parentId
      const parentPush = findChildInfoPush(result, parentId)
      expect(parentPush).toBeDefined()
      expect(parentPush?.childId).toBe(childIssue._id)
      expect(parentPush?.estimation).toBe(3)
      expect(parentPush?.parentId).toBe(parentId)

      const grandparentPush = findChildInfoPush(result, grandparentId)
      expect(grandparentPush).toBeDefined()
      expect(grandparentPush?.childId).toBe(childIssue._id)
      expect(grandparentPush?.estimation).toBe(3)
      expect(grandparentPush?.parentId).toBe(parentId)
    })

    it('should push childInfo to 3 levels of ancestors', async () => {
      const greatGrandparentId: Ref<Issue> = generateId()
      const grandparentId: Ref<Issue> = generateId()
      const parentId: Ref<Issue> = generateId()

      const childIssue = createMockIssue({
        estimation: 8,
        reportedTime: 2,
        attachedTo: parentId,
        parents: [
          { parentId, parentTitle: 'Parent', identifier: 'TEST-3', space: testSpace },
          { parentId: grandparentId, parentTitle: 'Grandparent', identifier: 'TEST-2', space: testSpace },
          {
            parentId: greatGrandparentId,
            parentTitle: 'Great Grandparent',
            identifier: 'TEST-1',
            space: testSpace
          }
        ]
      })

      const control = createMockControl(async () => [])
      const tx = createIssueTx(childIssue)
      const result = await OnIssueUpdate([tx], control)

      expect(findChildInfoPush(result, parentId)).toBeDefined()
      expect(findChildInfoPush(result, grandparentId)).toBeDefined()
      expect(findChildInfoPush(result, greatGrandparentId)).toBeDefined()

      // All 3 should have the same estimation/reportedTime for this child
      for (const ancestorId of [parentId, grandparentId, greatGrandparentId]) {
        const push = findChildInfoPush(result, ancestorId)
        expect(push?.estimation).toBe(8)
        expect(push?.reportedTime).toBe(2)
      }
    })

    it('should not push childInfo if issue has no parents (root issue)', async () => {
      const rootIssue = createMockIssue({ estimation: 10, parents: [] })

      const control = createMockControl(async () => [])
      const tx = createIssueTx(rootIssue)
      const result = await OnIssueUpdate([tx], control)

      // No $push childInfo transactions should be generated
      const pushTxes = result.filter((t) => {
        if (t._class !== core.class.TxUpdateDoc) return false
        const upd = t as TxUpdateDoc<Issue>
        return (upd.operations as any).$push?.childInfo !== undefined
      })
      expect(pushTxes).toHaveLength(0)
    })
  })

  describe('Issue deletion — childInfo cleanup', () => {
    it('should pull childInfo from all ancestors when issue is deleted', async () => {
      const grandparentId: Ref<Issue> = generateId()
      const parentId: Ref<Issue> = generateId()
      const childId: Ref<Issue> = generateId()

      const parentIssue = createMockIssue({
        _id: parentId,
        title: 'Parent',
        identifier: 'TEST-2',
        childInfo: [{ childId, estimation: 5, reportedTime: 2 }]
      })

      const grandparentIssue = createMockIssue({
        _id: grandparentId,
        title: 'Grandparent',
        identifier: 'TEST-1',
        childInfo: [{ childId, estimation: 5, reportedTime: 2 }]
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        // Return ancestors when searching by childInfo.childId
        if (query['childInfo.childId'] === childId) {
          return [parentIssue, grandparentIssue]
        }
        return []
      })

      const tx = createIssueRemoveTx(childId)
      const result = await OnIssueUpdate([tx], control)

      expect(findChildInfoPull(result, parentId)).toBe(true)
      expect(findChildInfoPull(result, grandparentId)).toBe(true)
    })
  })

  describe('TimeSpendReport creation — reportedTime propagation', () => {
    it('should increment reportedTime on the issue', async () => {
      const issueId: Ref<Issue> = generateId()
      const issue = createMockIssue({
        _id: issueId,
        estimation: 10,
        reportedTime: 0,
        parents: []
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        if (query._id === issueId) return [issue]
        return []
      })

      const tx = createTimeReportTx(issueId, 3)
      const result = await OnIssueUpdate([tx], control)

      const inc = findReportedTimeInc(result, issueId)
      expect(inc).toBe(3)
    })

    it('should propagate reportedTime change to all ancestors via childInfo', async () => {
      const grandparentId: Ref<Issue> = generateId()
      const parentId: Ref<Issue> = generateId()
      const issueId: Ref<Issue> = generateId()

      const issue = createMockIssue({
        _id: issueId,
        estimation: 10,
        reportedTime: 2,
        attachedTo: parentId,
        parents: [
          { parentId, parentTitle: 'Parent', identifier: 'TEST-2', space: testSpace },
          { parentId: grandparentId, parentTitle: 'Grandparent', identifier: 'TEST-1', space: testSpace }
        ]
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        if (query._id === issueId) return [issue]
        return []
      })

      const tx = createTimeReportTx(issueId, 5)
      const result = await OnIssueUpdate([tx], control)

      // reportedTime on issue should be incremented
      expect(findReportedTimeInc(result, issueId)).toBe(5)

      // Both parent and grandparent should get updated childInfo
      // First $pull old, then $push new
      expect(findChildInfoPull(result, parentId)).toBe(true)
      expect(findChildInfoPull(result, grandparentId)).toBe(true)

      const parentPush = findChildInfoPush(result, parentId)
      expect(parentPush).toBeDefined()
      expect(parentPush?.childId).toBe(issueId)
      // After adding 5 to reportedTime (was 2), should be 7
      expect(parentPush?.reportedTime).toBe(7)

      const grandparentPush = findChildInfoPush(result, grandparentId)
      expect(grandparentPush).toBeDefined()
      expect(grandparentPush?.reportedTime).toBe(7)
    })
  })

  describe('Estimation update — remainingTime and childInfo propagation', () => {
    it('should recalculate remainingTime when estimation changes', async () => {
      const issueId: Ref<Issue> = generateId()
      const issue = createMockIssue({
        _id: issueId,
        estimation: 5,
        reportedTime: 3,
        remainingTime: 2,
        parents: []
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        if (query._id === issueId) return [issue]
        return []
      })

      const tx = createIssueUpdateTx(issueId, { estimation: 10 })
      const result = await OnIssueUpdate([tx], control)

      // remainingTime should be max(0, 10 - 3) = 7
      const remaining = findRemainingTimeUpdate(result, issueId)
      expect(remaining).toBe(7)
    })

    it('should set remainingTime to 0 when reportedTime exceeds estimation', async () => {
      const issueId: Ref<Issue> = generateId()
      const issue = createMockIssue({
        _id: issueId,
        estimation: 5,
        reportedTime: 8,
        remainingTime: 0,
        parents: []
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        if (query._id === issueId) return [issue]
        return []
      })

      const tx = createIssueUpdateTx(issueId, { estimation: 3 })
      const result = await OnIssueUpdate([tx], control)

      // remainingTime should be max(0, 3 - 8) = 0
      const remaining = findRemainingTimeUpdate(result, issueId)
      expect(remaining).toBe(0)
    })

    it('should propagate estimation change to all ancestors via childInfo', async () => {
      const grandparentId: Ref<Issue> = generateId()
      const parentId: Ref<Issue> = generateId()
      const issueId: Ref<Issue> = generateId()

      const issue = createMockIssue({
        _id: issueId,
        estimation: 5,
        reportedTime: 2,
        attachedTo: parentId,
        parents: [
          { parentId, parentTitle: 'Parent', identifier: 'TEST-2', space: testSpace },
          { parentId: grandparentId, parentTitle: 'Grandparent', identifier: 'TEST-1', space: testSpace }
        ]
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        if (query._id === issueId) return [issue]
        return []
      })

      const tx = createIssueUpdateTx(issueId, { estimation: 15 })
      const result = await OnIssueUpdate([tx], control)

      // Both ancestors should get $pull + $push with new estimation
      expect(findChildInfoPull(result, parentId)).toBe(true)
      expect(findChildInfoPull(result, grandparentId)).toBe(true)

      const parentPush = findChildInfoPush(result, parentId)
      expect(parentPush?.estimation).toBe(15)
      expect(parentPush?.reportedTime).toBe(2)

      const grandparentPush = findChildInfoPush(result, grandparentId)
      expect(grandparentPush?.estimation).toBe(15)
    })
  })

  describe('Issue reparenting — childInfo migration', () => {
    it('should move childInfo from old ancestors to new ancestors', async () => {
      const oldParentId: Ref<Issue> = generateId()
      const newParentId: Ref<Issue> = generateId()
      const issueId: Ref<Issue> = generateId()

      const issue = createMockIssue({
        _id: issueId,
        estimation: 5,
        reportedTime: 2,
        attachedTo: oldParentId,
        parents: [{ parentId: oldParentId, parentTitle: 'Old Parent', identifier: 'TEST-1', space: testSpace }]
      })

      const newParent = createMockIssue({
        _id: newParentId,
        title: 'New Parent',
        identifier: 'TEST-3',
        parents: []
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        if (query._id === issueId) return [issue]
        if (query._id === newParentId) return [newParent]
        // No sub-issues query
        if (query['parents.parentId'] === issueId) return []
        return []
      })

      const tx = createIssueUpdateTx(issueId, { attachedTo: newParentId } as any)
      const result = await OnIssueUpdate([tx], control)

      // Should pull from old parent
      expect(findChildInfoPull(result, oldParentId)).toBe(true)

      // Should push to new parent with new parentId
      const newPush = findChildInfoPush(result, newParentId)
      expect(newPush).toBeDefined()
      expect(newPush?.childId).toBe(issueId)
      expect(newPush?.estimation).toBe(5)
      expect(newPush?.reportedTime).toBe(2)
      expect(newPush?.parentId).toBe(newParentId)
    })

    it('should migrate childInfo across deep hierarchies on reparent', async () => {
      const oldGrandparentId: Ref<Issue> = generateId()
      const oldParentId: Ref<Issue> = generateId()
      const newGrandparentId: Ref<Issue> = generateId()
      const newParentId: Ref<Issue> = generateId()
      const issueId: Ref<Issue> = generateId()

      const issue = createMockIssue({
        _id: issueId,
        estimation: 7,
        reportedTime: 3,
        attachedTo: oldParentId,
        parents: [
          { parentId: oldParentId, parentTitle: 'Old Parent', identifier: 'TEST-2', space: testSpace },
          { parentId: oldGrandparentId, parentTitle: 'Old Grandparent', identifier: 'TEST-1', space: testSpace }
        ]
      })

      const newParent = createMockIssue({
        _id: newParentId,
        title: 'New Parent',
        identifier: 'TEST-4',
        parents: [
          { parentId: newGrandparentId, parentTitle: 'New Grandparent', identifier: 'TEST-3', space: testSpace }
        ]
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        if (query._id === issueId) return [issue]
        if (query._id === newParentId) return [newParent]
        if (query['parents.parentId'] === issueId) return []
        return []
      })

      const tx = createIssueUpdateTx(issueId, { attachedTo: newParentId } as any)
      const result = await OnIssueUpdate([tx], control)

      // Pull from old ancestors
      expect(findChildInfoPull(result, oldParentId)).toBe(true)
      expect(findChildInfoPull(result, oldGrandparentId)).toBe(true)

      // Push to new ancestors with new parentId
      const newParentPush = findChildInfoPush(result, newParentId)
      expect(newParentPush).toBeDefined()
      expect(newParentPush?.estimation).toBe(7)
      expect(newParentPush?.parentId).toBe(newParentId)

      const newGrandparentPush = findChildInfoPush(result, newGrandparentId)
      expect(newGrandparentPush).toBeDefined()
      expect(newGrandparentPush?.estimation).toBe(7)
      expect(newGrandparentPush?.reportedTime).toBe(3)
      expect(newGrandparentPush?.parentId).toBe(newParentId)
    })
  })

  describe('Combined scenarios', () => {
    it('should handle time report on deeply nested issue (3 levels)', async () => {
      const rootId: Ref<Issue> = generateId()
      const midId: Ref<Issue> = generateId()
      const leafId: Ref<Issue> = generateId()

      const leafIssue = createMockIssue({
        _id: leafId,
        estimation: 20,
        reportedTime: 5,
        attachedTo: midId,
        parents: [
          { parentId: midId, parentTitle: 'Mid', identifier: 'TEST-2', space: testSpace },
          { parentId: rootId, parentTitle: 'Root', identifier: 'TEST-1', space: testSpace }
        ]
      })

      const control = createMockControl(async (_ctx, _class, query) => {
        if (query._id === leafId) return [leafIssue]
        return []
      })

      const tx = createTimeReportTx(leafId, 2)
      const result = await OnIssueUpdate([tx], control)

      // reportedTime increment on leaf
      expect(findReportedTimeInc(result, leafId)).toBe(2)

      // childInfo updated on both mid and root
      expect(findChildInfoPull(result, midId)).toBe(true)
      expect(findChildInfoPull(result, rootId)).toBe(true)

      const midPush = findChildInfoPush(result, midId)
      expect(midPush?.reportedTime).toBe(7) // 5 + 2

      const rootPush = findChildInfoPush(result, rootId)
      expect(rootPush?.reportedTime).toBe(7) // same — leaf's updated reportedTime
    })
  })
})
