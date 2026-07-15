import { expect, test } from '@playwright/test'
import { PlatformSetting, generateId } from '../utils'
import { getTierSubscription, setWorkspacePlanByUuid, waitForTier } from '../API/Billing'
import { ApiEndpoint } from '../API/Api'

// A fresh workspace is auto-provisioned (async, by the payment pod) with a Business trial per
// tests/plan-config.yaml `trial:` (14 days, 10 seats). Buying Business early supersedes the trial.
test.describe('business trial', () => {
  test.use({ storageState: PlatformSetting })

  test('a new workspace starts on a Business trial', async ({ request }) => {
    const api = new ApiEndpoint(request)
    const wsInfo = await api.createWorkspaceWithLogin(`trial-${generateId(8)}`, 'user1', '1234')

    await waitForTier(wsInfo.workspace)
    const tier = await getTierSubscription(wsInfo.workspace)
    expect(tier).toBeDefined()
    expect(tier?.status).toBe('trialing')
    expect(tier?.plan).toBe('business')
    expect(tier?.usersLimit).toBe(10)
    expect(tier?.trialEnd).toBeGreaterThan(Date.now())
  })

  test('buying Business early supersedes the trial', async ({ request }) => {
    const api = new ApiEndpoint(request)
    const wsInfo = await api.createWorkspaceWithLogin(`trial-buy-${generateId(8)}`, 'user1', '1234')

    await waitForTier(wsInfo.workspace)
    expect((await getTierSubscription(wsInfo.workspace))?.status).toBe('trialing')

    // Simulate an early purchase: an active Business tier with a chosen seat count.
    await setWorkspacePlanByUuid(wsInfo.workspace, 'business', { status: 'active', users: 3 })

    const tier = await getTierSubscription(wsInfo.workspace)
    expect(tier?.status).toBe('active')
    expect(tier?.plan).toBe('business')
    expect(tier?.usersLimit).toBe(3)
    expect(tier?.trialEnd ?? null).toBeNull() // trial gone (DB NULL -> null)
  })
})
