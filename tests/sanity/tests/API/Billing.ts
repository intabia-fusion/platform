import { getClient as getClientRaw, type AccountClient } from '@hcengineering/account-client'
import { AccountRole, type WorkspaceUuid } from '@hcengineering/core'
import { LocalUrl, PlatformAdmin } from '../utils'
import { getServiceAccountClient } from './AccountClient'

let adminClient: AccountClient | undefined

async function getAdmin (): Promise<AccountClient> {
  if (adminClient != null) return adminClient
  const unauth = getClientRaw(LocalUrl)
  const loginInfo = await unauth.login(PlatformAdmin, '1234')
  if (loginInfo == null) throw new Error('Failed to login as admin')
  adminClient = getClientRaw(LocalUrl, loginInfo.token)
  return adminClient
}

/** Resolve workspace uuid by its url-name (e.g. 'limits-unpaid-ws') via admin listing. */
export async function resolveWorkspaceUuid (urlName: string): Promise<WorkspaceUuid> {
  const client = await getAdmin()
  const all = await client.listWorkspaces()
  const ws = all.find((w) => w.url === urlName)
  if (ws == null) throw new Error(`Workspace not found by url: ${urlName}`)
  return ws.uuid
}

export interface PlanLimitsInput {
  status?: string // active|past_due|canceled|expired
  storageGB?: number // fractional allowed (0.05 = 50MB)
  projects?: number
  users?: number
  tokens?: number
  meetingMinutes?: number
}

/** Assign an existing account to a workspace with the given role (requires a service token). */
export async function assignMember (email: string, workspaceUuid: WorkspaceUuid, role: AccountRole): Promise<void> {
  const client = await getServiceAccountClient('tool')
  await client.assignWorkspace(email, workspaceUuid, role)
}

/** Set a workspace plan by uuid (used for freshly created, per-test workspaces). */
export async function setWorkspacePlanByUuid (
  workspaceUuid: WorkspaceUuid,
  plan: string,
  input: PlanLimitsInput = {}
): Promise<void> {
  const client = await getAdmin()
  await client.adminCreateSubscription({
    workspaceUuid,
    plan,
    type: 'tier',
    status: input.status ?? 'active',
    limits: {
      usersLimit: input.users ?? 0,
      storageLimitGB: input.storageGB ?? 0,
      trafficLimitGB: 0,
      projectsLimit: input.projects ?? 0,
      tokenLimit: input.tokens ?? 0,
      meetingMinutesLimit: input.meetingMinutes ?? 0
    }
  })
}

/** Drive the same admin path the AdminUI uses to (re)create a manual tier subscription. */
export async function setWorkspacePlan (urlName: string, plan: string, input: PlanLimitsInput = {}): Promise<void> {
  const client = await getAdmin()
  const workspaceUuid = await resolveWorkspaceUuid(urlName)
  await client.adminCreateSubscription({
    workspaceUuid,
    plan,
    type: 'tier',
    status: input.status ?? 'active',
    limits: {
      usersLimit: input.users ?? 0,
      storageLimitGB: input.storageGB ?? 0,
      trafficLimitGB: 0,
      projectsLimit: input.projects ?? 0,
      tokenLimit: input.tokens ?? 0,
      meetingMinutesLimit: input.meetingMinutes ?? 0
    }
  })
}
