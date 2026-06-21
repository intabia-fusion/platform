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

import {
  createRestClient,
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  type RestClient,
  type ServerConfig,
  type WorkspaceToken
} from '@hcengineering/api-client'
import core, {
  MeasureMetricsContext,
  pickPrimarySocialId,
  systemAccountUuid,
  type Class,
  type Ref,
  type SocialId,
  type Space,
  type TxOperations
} from '@hcengineering/core'
import { type AccountClient, getClient as getAccountClient } from '@hcengineering/account-client'
import { ensureEmployee } from '@hcengineering/contact'
import { generateToken } from '@hcengineering/server-token'
import drivePlugin, { type Drive } from '@hcengineering/drive'
import documentPlugin, { type Teamspace } from '@hcengineering/document'
import tracker, { TimeReportDayType, type IssueStatus, type Project } from '@hcengineering/tracker'

// Workspace created in prepare.sh with plan 'start': projects=1, drives=1, teamspaces=1.
// Limits snapshot loads at pipeline boot, so the plan is set before any client connects.
// The workspace ships with built-in spaces (system drives, default project), so every
// check counts the actual active spaces via a system client first.
describe('plan-limits', () => {
  const testCtx = new MeasureMetricsContext('test', {})
  const wsName = 'api-tests-limits'
  const LIMIT = 1
  let config: ServerConfig
  let apiWorkspace: WorkspaceToken
  let accountClient: AccountClient
  let ops: TxOperations
  let sys: RestClient

  beforeAll(async () => {
    config = await loadServerConfig('http://localhost:8083')

    apiWorkspace = await getWorkspaceToken(
      'http://localhost:8083',
      {
        email: 'user1',
        password: '1234',
        workspace: wsName
      },
      config
    )

    accountClient = getAccountClient(config.ACCOUNTS_URL, apiWorkspace.token)
    const person = await accountClient.getPerson()
    const socialIds: SocialId[] = await accountClient.getSocialIds(true)

    await ensureEmployee(
      testCtx,
      {
        uuid: apiWorkspace.info.account,
        role: apiWorkspace.info.role,
        primarySocialId: pickPrimarySocialId(socialIds)._id,
        socialIds: socialIds.map((si) => si._id),
        fullSocialIds: socialIds
      },
      connect(),
      socialIds,
      async () => person
    )

    ops = await createRestTxOperations(apiWorkspace.endpoint, apiWorkspace.workspaceId, apiWorkspace.token)
    const sysToken = generateToken(systemAccountUuid, apiWorkspace.workspaceId, undefined, 'secret')
    sys = createRestClient(apiWorkspace.endpoint, apiWorkspace.workspaceId, sysToken)
  }, 30000)

  function connect (): RestClient {
    return createRestClient(apiWorkspace.endpoint, apiWorkspace.workspaceId, apiWorkspace.token)
  }

  /**
   * Ground truth: active user-created spaces of a class, system view (user view misses
   * private spaces). System-created spaces (meeting records drive etc.) don't consume the limit.
   */
  async function activeCount (cls: Ref<Class<Space>>): Promise<number> {
    return (await sys.findAll(cls, { archived: { $ne: true }, createdBy: { $ne: core.account.System } })).length
  }

  async function createDrive (name: string): Promise<Ref<Drive>> {
    return await ops.createDoc(drivePlugin.class.Drive, core.space.Space, {
      name,
      description: '',
      private: false,
      archived: false,
      members: [],
      owners: [],
      autoJoin: false,
      restricted: false,
      type: drivePlugin.spaceType.DefaultDrive
    })
  }

  async function createTeamspace (name: string): Promise<Ref<Teamspace>> {
    return await ops.createDoc(documentPlugin.class.Teamspace, core.space.Space, {
      name,
      description: '',
      private: false,
      archived: false,
      members: [],
      owners: [],
      autoJoin: false,
      type: documentPlugin.spaceType.DefaultTeamspaceType
    })
  }

  async function createProject (name: string, identifier: string): Promise<Ref<Project>> {
    const status = (await ops.findAll(tracker.class.IssueStatus, {}))[0]
    return await ops.createDoc(tracker.class.Project, core.space.Space, {
      name,
      description: '',
      private: false,
      archived: false,
      members: [],
      owners: [],
      autoJoin: false,
      identifier,
      sequence: 0,
      defaultIssueStatus: status?._id ?? ('' as Ref<IssueStatus>),
      defaultTimeReportDay: TimeReportDayType.PreviousWorkDay,
      type: tracker.ids.ClassingProjectType
    })
  }

  // Project count including system spaces — the server's ground truth for the project limit.
  async function activeProjectsWithSystem (): Promise<number> {
    return (await sys.findAll(tracker.class.Project, { archived: { $ne: true } })).length
  }

  it('project limit enforced (system Default project counts)', async () => {
    // The system-created Default project DOES consume a project slot. With LIMIT=1 the Default
    // already fills it, so any user project is rejected immediately.
    const total = await activeProjectsWithSystem()
    expect(total).toBeGreaterThanOrEqual(LIMIT) // Default project already at/over the limit
    await expect(createProject('limits-project-overflow', 'LIMX')).rejects.toThrow()
    expect(await activeProjectsWithSystem()).toBe(total)
  })

  it('drives and teamspaces are NOT limited (only projects are enforced today)', async () => {
    // drivesLimit/teamspacesLimit exist in the schema but are not enforced — creation must succeed
    // even though the plan is the restricted 'start' tier.
    const before = await activeCount(drivePlugin.class.Drive)
    await createDrive(`limits-unlimited-drive-${Date.now()}`)
    expect(await activeCount(drivePlugin.class.Drive)).toBe(before + 1)

    await expect(createTeamspace(`limits-unlimited-ts-${Date.now()}`)).resolves.toBeDefined()
  })

  it('reads still work when the project limit is reached', async () => {
    const spaces = await ops.findAll(core.class.Space, {})
    expect(spaces.length).toBeGreaterThan(0)
  })

  it('plan upgrade lifts the project limit without restart', async () => {
    const adminToken = generateToken(systemAccountUuid, apiWorkspace.workspaceId, { admin: 'true' }, 'secret')
    const adminClient = getAccountClient(config.ACCOUNTS_URL, adminToken)
    const restrictedLimits = {
      usersLimit: 0,
      storageLimitGB: 0,
      trafficLimitGB: 0,
      projectsLimit: 1, // Default project alone fills this -> user projects rejected
      tokenLimit: 0,
      meetingMinutesLimit: 0
    }

    // At the limit (Default fills the only slot): creating a user project is rejected.
    await expect(createProject('limits-upgrade-blocked', 'UPB')).rejects.toThrow()

    // Upgrade: projectsLimit=0 = unlimited. account-service publishes LimitsChanged{plan} -> transactor refreshes.
    await adminClient.adminCreateSubscription({
      workspaceUuid: apiWorkspace.workspaceId,
      plan: 'business',
      limits: { ...restrictedLimits, projectsLimit: 0 }
    })

    let created: Ref<Project> | undefined
    try {
      // Kafka event propagation: poll until the new plan takes effect.
      const deadline = Date.now() + 15000
      let lastErr: any
      while (created === undefined && Date.now() < deadline) {
        try {
          created = await createProject('limits-upgrade-extra', 'UPE')
        } catch (err) {
          lastErr = err
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
      if (created === undefined) throw lastErr ?? new Error('upgrade did not take effect')
    } finally {
      // Cleanup: archive the extra project and restore the restricted plan (keeps the suite idempotent).
      if (created !== undefined) {
        await ops.updateDoc(tracker.class.Project, core.space.Space, created, { archived: true })
      }
      await adminClient.adminCreateSubscription({
        workspaceUuid: apiWorkspace.workspaceId,
        plan: 'start',
        limits: restrictedLimits
      })
    }

    // Downgrade applied: creation is rejected again (poll for propagation).
    const deadline = Date.now() + 15000
    let rejected = false
    while (!rejected && Date.now() < deadline) {
      try {
        const extra = await createProject('limits-downgrade-probe', 'DWN')
        await ops.updateDoc(tracker.class.Project, core.space.Space, extra, { archived: true })
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch {
        rejected = true
      }
    }
    expect(rejected).toBe(true)
  }, 60000)
})
