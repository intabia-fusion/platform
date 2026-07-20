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

import core, {
  AccountRole,
  type Doc,
  type Ref,
  type Space,
  type MeasureContext,
  type SessionData,
  type Class,
  type AccountUuid,
  type WorkspaceUuid,
  type Hierarchy,
  type ModelDb,
  type PersonId,
  type TxUpdateDoc,
  type WorkspaceDataId,
  generateId
} from '@hcengineering/core'
import { BaseMiddleware, type Middleware, type PipelineContext } from '@hcengineering/server-core'
import workflow from '@hcengineering/model-workflow'

import { WorkflowMiddleware } from '../middleware'

class MockNextMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new MockNextMiddleware(context, next)
  }

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor (context: PipelineContext, next?: Middleware) {
    super(context, next)
  }

  tx = jest.fn(async (ctx, txes) => ({ txes, broadcast: [] }))
}

describe('WorkflowMiddleware', () => {
  let middleware: WorkflowMiddleware
  let nextMock: MockNextMiddleware
  let contextMock: PipelineContext

  beforeEach(async () => {
    contextMock = {
      workspace: {
        url: 'test-ws',
        uuid: 'test-ws-uuid' as WorkspaceUuid,
        dataId: 'test-data' as WorkspaceDataId,
        accountsUrl: ''
      },
      hierarchy: {
        isDerived: (c: Ref<Class<Doc>>, b: Ref<Class<Doc>>) => c === b,
        hasMixin: () => true,
        as: (doc: Doc, c: Ref<Class<Doc>>) => doc
      } as any as Hierarchy,
      modelDb: {} as any as ModelDb,
      branding: null,
      contextVars: {}
    } as any as PipelineContext

    nextMock = new MockNextMiddleware(contextMock)

    middleware = (await WorkflowMiddleware.create(
      {} as any as MeasureContext,
      contextMock,
      nextMock
    )) as WorkflowMiddleware
  })

  function createMockTx (objectClass: Ref<Class<Doc>>, modifiedBy: PersonId): TxUpdateDoc<Doc> {
    return {
      _id: generateId(),
      _class: core.class.TxUpdateDoc,
      space: 'test' as Ref<Space>,
      objectId: 'obj-1' as Ref<Doc>,
      objectClass,
      objectSpace: 'test-space' as Ref<Space>,
      modifiedOn: Date.now(),
      modifiedBy,
      createdBy: modifiedBy,
      operations: {}
    } satisfies TxUpdateDoc<Doc>
  }

  it('should bypass check for System account', async () => {
    const tx = createMockTx(workflow.class.Workflow, core.account.System)
    const ctx = {
      contextData: { account: undefined } as any as SessionData
    } as any as MeasureContext<SessionData>

    await expect(middleware.tx(ctx, [tx])).resolves.not.toThrow()
    expect(nextMock.tx).toHaveBeenCalledWith(ctx, [tx])
  })

  it('should allow Owner to modify workflow', async () => {
    const tx = createMockTx(workflow.class.Workflow, 'user-uuid' as PersonId)
    const ctx = {
      contextData: {
        account: {
          uuid: 'user-uuid' as AccountUuid,
          role: AccountRole.Owner
        }
      } as any as SessionData
    } as any as MeasureContext<SessionData>

    await expect(middleware.tx(ctx, [tx])).resolves.not.toThrow()
    expect(nextMock.tx).toHaveBeenCalledWith(ctx, [tx])
  })

  it('should allow Admin to modify workflow', async () => {
    const tx = createMockTx(workflow.class.Workflow, 'user-uuid' as PersonId)
    const ctx = {
      contextData: {
        account: {
          uuid: 'user-uuid' as AccountUuid,
          role: AccountRole.Admin
        }
      } as any as SessionData
    } as any as MeasureContext<SessionData>

    await expect(middleware.tx(ctx, [tx])).resolves.not.toThrow()
    expect(nextMock.tx).toHaveBeenCalledWith(ctx, [tx])
  })

  it('should throw error for non-owner/non-admin roles', async () => {
    const tx = createMockTx(workflow.class.Workflow, 'user-uuid' as PersonId)
    const ctx = {
      contextData: {
        account: {
          uuid: 'user-uuid' as AccountUuid,
          role: AccountRole.User
        }
      } as any as SessionData
    } as any as MeasureContext<SessionData>

    await expect(middleware.tx(ctx, [tx])).rejects.toThrow('Forbidden')
    expect(nextMock.tx).not.toHaveBeenCalled()
  })

  it('should throw error if user is not authorized', async () => {
    const tx = createMockTx(workflow.class.Workflow, 'user-uuid' as PersonId)
    const ctx = {
      contextData: {} as any as SessionData
    } as any as MeasureContext<SessionData>

    await expect(middleware.tx(ctx, [tx])).rejects.toThrow('Forbidden')
    expect(nextMock.tx).not.toHaveBeenCalled()
  })

  it('should allow modification of non-workflow classes by any user', async () => {
    const tx = createMockTx('some-other-class' as Ref<Class<Doc>>, 'user-uuid' as PersonId)
    const ctx = {
      contextData: {
        account: {
          uuid: 'user-uuid' as AccountUuid,
          role: AccountRole.User
        }
      } as any as SessionData
    } as any as MeasureContext<SessionData>

    await expect(middleware.tx(ctx, [tx])).resolves.not.toThrow()
    expect(nextMock.tx).toHaveBeenCalledWith(ctx, [tx])
  })
})
