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
  generateId,
  Hierarchy,
  type MeasureContext,
  MeasureMetricsContext,
  ModelDb,
  TxFactory,
  toFindResult,
  type SessionData,
  type Ref,
  type Class,
  type Doc,
  type Space,
  AccountRole,
  type AccountUuid
} from '@hcengineering/core'
import type {
  LimitsProvider,
  Middleware,
  PipelineContext,
  PlanLimits,
  TxMiddlewareResult
} from '@hcengineering/server-core'
import { PlatformError } from '@hcengineering/platform'
import { PlanLimitsMiddleware } from '../planLimitsMiddleware'
import {
  LIMITS_PROVIDER_VAR,
  PLAN_LIMITS_VAR,
  SPACE_COUNTS_PROVIDER_KEY,
  type SpaceCountsProvider
} from '../planLimits'

// Fake concrete space classes — kept as strings so the test needs no plugin dependency. The
// middleware treats space-limit classes generically (isDerived), it does not import them.
const projectClass = 'tracker:class:Project' as Ref<Class<Space>>
const driveClass = 'drive:class:Drive' as Ref<Class<Space>>
const teamspaceClass = 'document:class:Teamspace' as Ref<Class<Space>>

// Build the generic spaceCounts Map<_class, count> the middleware reads.
function makeCounts (projects = 0, drives = 0, teamspaces = 0): Map<Ref<Class<Doc>>, number> {
  const m = new Map<Ref<Class<Doc>>, number>()
  if (projects > 0) m.set(projectClass, projects)
  if (drives > 0) m.set(driveClass, drives)
  if (teamspaces > 0) m.set(teamspaceClass, teamspaces)
  return m
}

// SpaceCountsProvider stub — the middleware pulls counts through this contract now.
function countsProvider (projects = 0, drives = 0, teamspaces = 0): SpaceCountsProvider {
  const counts = makeCounts(projects, drives, teamspaces) as Map<Ref<Class<Space>>, number>
  return { getSpaceCounts: () => counts }
}

// Per-space-class limits passed via PlanLimits.spaceLimits map.
function makeLimits (space: { projects?: number, drives?: number, teamspaces?: number } = {}): PlanLimits {
  const spaceLimits = new Map<Ref<Class<Space>>, number>()
  if (space.projects !== undefined) spaceLimits.set(projectClass, space.projects)
  if (space.drives !== undefined) spaceLimits.set(driveClass, space.drives)
  if (space.teamspaces !== undefined) spaceLimits.set(teamspaceClass, space.teamspaces)
  return { spaceLimits, usersLimit: 0, storageLimitGB: 0, tokenLimit: 0, transcriptLimit: 0 }
}

// LimitsProvider that returns provided limits; injected via contextVars.
function makeProvider (limits: PlanLimits): LimitsProvider {
  return {
    getPlanLimits: async () => limits,
    getWorkspaceMembers: async () => [],
    getSystemAccounts: async () => new Set()
  }
}

function makeContext (
  contextVars: Record<string, any> = {},
  isDerivedImpl?: (a: Ref<Class<Doc>>, b: Ref<Class<Doc>>) => boolean
): PipelineContext {
  const hierarchy = new Hierarchy()
  if (isDerivedImpl !== undefined) {
    jest.spyOn(hierarchy, 'isDerived').mockImplementation(isDerivedImpl as any)
  }
  return {
    workspace: { uuid: 'ws-test' as any, url: 'test', dataId: 'test' as any },
    hierarchy,
    modelDb: new ModelDb(hierarchy),
    branding: null as any,
    adapterManager: {} as any,
    storageAdapter: {} as any,
    contextVars: { ...contextVars },
    lastTx: '',
    lastHash: ''
  } as any
}

function makeNext (): Middleware {
  return {
    findAll: jest.fn(async () => toFindResult([])),
    tx: jest.fn(async (): Promise<TxMiddlewareResult> => ({})),
    searchFulltext: jest.fn(async () => ({ docs: [] })),
    handleBroadcast: jest.fn(async () => {}),
    groupBy: jest.fn(async () => new Map()),
    loadModel: jest.fn(async () => []),
    domainRequest: jest.fn(async () => ({})),
    closeSession: jest.fn(async () => {}),
    close: jest.fn(async () => {})
  } as any
}

function makeSessionCtx (): MeasureContext<SessionData> {
  const ctx = new MeasureMetricsContext('test', {}) as MeasureContext<SessionData>
  ctx.contextData = {
    broadcast: { txes: [], targets: {}, queue: [], sessions: {} },
    contextCache: new Map(),
    removedMap: new Map(),
    account: {
      uuid: 'user1' as AccountUuid,
      role: AccountRole.User,
      primarySocialId: 'e:user1' as any,
      socialIds: [],
      fullSocialIds: []
    },
    service: 'test',
    sessionId: 'sess',
    workspace: { uuid: 'ws-test' as any, url: 'test', dataId: 'test' as any },
    socialStringsToUsers: new Map()
  } as any
  return ctx
}

describe('PlanLimitsMiddleware', () => {
  let txFactory: TxFactory

  beforeEach(() => {
    txFactory = new TxFactory(core.account.System)
  })

  async function createMw (
    contextVars: Record<string, any>,
    isDerivedImpl?: (a: any, b: any) => boolean
  ): Promise<PlanLimitsMiddleware> {
    const ctx = new MeasureMetricsContext('test', {})
    const context = makeContext(contextVars, isDerivedImpl as any)
    return await PlanLimitsMiddleware.create(ctx, context, makeNext())
  }

  describe('boot resolution', () => {
    it('writes ZERO limits when no provider in contextVars', async () => {
      const ctx = new MeasureMetricsContext('test', {})
      const context = makeContext({})
      await PlanLimitsMiddleware.create(ctx, context, makeNext())
      expect(context.contextVars[PLAN_LIMITS_VAR]).toEqual(makeLimits())
    })

    it('writes provider limits into PLAN_LIMITS_VAR', async () => {
      const ctx = new MeasureMetricsContext('test', {})
      const context = makeContext({ [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 7 })) })
      await PlanLimitsMiddleware.create(ctx, context, makeNext())
      expect((context.contextVars[PLAN_LIMITS_VAR] as PlanLimits).spaceLimits.get(projectClass)).toBe(7)
    })

    it('fails open (ZERO) when provider throws', async () => {
      const ctx = new MeasureMetricsContext('test', {})
      const provider: LimitsProvider = {
        getPlanLimits: async () => {
          throw new Error('boom')
        },
        getWorkspaceMembers: async () => [],
        getSystemAccounts: async () => new Set()
      }
      const context = makeContext({ [LIMITS_PROVIDER_VAR]: provider })
      await PlanLimitsMiddleware.create(ctx, context, makeNext())
      expect(context.contextVars[PLAN_LIMITS_VAR]).toEqual(makeLimits())
    })
  })

  describe('fail-open cases', () => {
    it('does not throw when spaceCounts is not set', async () => {
      const isDerived = (a: any, b: any): boolean => b === core.class.Space
      const mw = await createMw({ [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 3 })) }, isDerived)
      const txCreate = txFactory.createTxCreateDoc(projectClass, core.space.Space, {
        name: 'p',
        description: '',
        private: false,
        members: [],
        archived: false,
        owners: []
      } as any)
      const ctx = makeSessionCtx()
      await expect(mw.tx(ctx, [txCreate])).resolves.not.toThrow()
    })
  })

  describe('limit = 0 (unlimited)', () => {
    it('does not throw when projectsLimit=0 regardless of count', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return true
        if (b === projectClass) return a === projectClass
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 0 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(999, 0, 0)
        },
        isDerived
      )
      const txCreate = txFactory.createTxCreateDoc(projectClass, core.space.Space, {
        name: 'p',
        description: '',
        private: false,
        members: [],
        archived: false,
        owners: []
      } as any)
      await expect(mw.tx(makeSessionCtx(), [txCreate])).resolves.not.toThrow()
    })
  })

  describe('TxCreateDoc enforcement', () => {
    it('does not throw when count < limit', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return true
        if (b === projectClass) return a === projectClass
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 5 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(4, 0, 0)
        },
        isDerived
      )
      const txCreate = txFactory.createTxCreateDoc(projectClass, core.space.Space, {
        name: 'p',
        description: '',
        private: false,
        members: [],
        archived: false,
        owners: []
      } as any)
      await expect(mw.tx(makeSessionCtx(), [txCreate])).resolves.not.toThrow()
    })

    it('throws Forbidden when count >= limit for projects', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return true
        if (b === projectClass) return a === projectClass
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 5 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(5, 0, 0)
        },
        isDerived
      )
      const txCreate = txFactory.createTxCreateDoc(projectClass, core.space.Space, {
        name: 'p',
        description: '',
        private: false,
        members: [],
        archived: false,
        owners: []
      } as any)
      await expect(mw.tx(makeSessionCtx(), [txCreate])).rejects.toThrow(PlatformError)
    })

    it('throws when an apply-wrapped create exceeds the limit (UI create path)', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.TxApplyIf) return a === core.class.TxApplyIf
        if (b === core.class.Space) return true
        if (b === projectClass) return a === projectClass
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 5 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(5, 0, 0)
        },
        isDerived
      )
      const txCreate = txFactory.createTxCreateDoc(projectClass, core.space.Space, {
        name: 'p',
        description: '',
        private: false,
        members: [],
        archived: false,
        owners: []
      } as any)
      const apply = txFactory.createTxApplyIf(core.space.Tx, 'create-project', [], [], [txCreate], undefined, true, [])
      await expect(mw.tx(makeSessionCtx(), [apply])).rejects.toThrow(PlatformError)
    })

    it('throws Forbidden when count >= limit for drives', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return true
        if (b === driveClass) return a === driveClass
        if (b === projectClass) return false
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ drives: 3 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(0, 3, 0)
        },
        isDerived
      )
      const txCreate = txFactory.createTxCreateDoc(driveClass, core.space.Space, {
        name: 'd',
        description: '',
        private: false,
        members: [],
        archived: false,
        owners: []
      } as any)
      await expect(mw.tx(makeSessionCtx(), [txCreate])).rejects.toThrow(PlatformError)
    })

    it('throws Forbidden when count >= limit for teamspaces', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return true
        if (b === teamspaceClass) return a === teamspaceClass
        if (b === projectClass) return false
        if (b === driveClass) return false
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ teamspaces: 2 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(0, 0, 2)
        },
        isDerived
      )
      const txCreate = txFactory.createTxCreateDoc(teamspaceClass, core.space.Space, {
        name: 't',
        description: '',
        private: false,
        members: [],
        archived: false,
        owners: []
      } as any)
      await expect(mw.tx(makeSessionCtx(), [txCreate])).rejects.toThrow(PlatformError)
    })

    it('limits are per-category: projects limit does not block drive creation', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return true
        if (b === projectClass) return a === projectClass
        if (b === driveClass) return a === driveClass
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 5, drives: 5 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(5, 3, 0)
        },
        isDerived
      )
      const txCreateDrive = txFactory.createTxCreateDoc(driveClass, core.space.Space, {
        name: 'd',
        description: '',
        private: false,
        members: [],
        archived: false,
        owners: []
      } as any)
      await expect(mw.tx(makeSessionCtx(), [txCreateDrive])).resolves.not.toThrow()
    })
  })

  describe('TxUpdateDoc unarchive enforcement', () => {
    it('throws Forbidden on unarchive when limit reached', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return true
        if (b === projectClass) return a === projectClass
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 5 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(5, 0, 0)
        },
        isDerived
      )
      const txUnarchive = txFactory.createTxUpdateDoc(projectClass, core.space.Space, generateId(), {
        archived: false
      })
      await expect(mw.tx(makeSessionCtx(), [txUnarchive])).rejects.toThrow(PlatformError)
    })

    it('does not throw on archive (archived: true)', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return true
        if (b === projectClass) return a === projectClass
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 5 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(5, 0, 0)
        },
        isDerived
      )
      const txArchive = txFactory.createTxUpdateDoc(projectClass, core.space.Space, generateId(), {
        archived: true
      })
      await expect(mw.tx(makeSessionCtx(), [txArchive])).resolves.not.toThrow()
    })
  })

  describe('non-Space tx', () => {
    it('does not throw for non-Space class', async () => {
      const isDerived = (a: any, b: any): boolean => {
        if (b === core.class.Space) return false
        return a === b
      }
      const mw = await createMw(
        {
          [LIMITS_PROVIDER_VAR]: makeProvider(makeLimits({ projects: 1 })),
          [SPACE_COUNTS_PROVIDER_KEY]: countsProvider(1, 0, 0)
        },
        isDerived
      )
      const txCreate = txFactory.createTxCreateDoc(core.class.Doc as any, core.space.Space, {} as any)
      await expect(mw.tx(makeSessionCtx(), [txCreate])).resolves.not.toThrow()
    })
  })
})
