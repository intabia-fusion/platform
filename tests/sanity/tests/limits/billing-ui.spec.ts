import { expect, test, type Page, type APIRequestContext } from '@playwright/test'
import { type WorkspaceUuid } from '@hcengineering/core'
import { PlatformSetting, PlatformURI, generateId } from '../utils'
import { setWorkspacePlanByUuid, getTierSubscription } from '../API/Billing'
import { ApiEndpoint } from '../API/Api'

// End-to-end UI billing lifecycle against the tbank provider with the in-process MOCK bank: buy a
// per-seat plan, change seats up/down, switch add-on packages, cancel/uncancel, monthly/yearly.
// Unlike the old instant mock, tbank redirects to a checkout page; the mock bank renders a page
// with "Оплатить"/"Отменить" that self-fires the CONFIRMED/REJECTED webhook on click, so each
// purchase completes only after paying on the checkout page and returning to billing.

async function openBilling (page: Page, ws: string): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/${ws}/setting/setting/billing/subscriptions`))?.finished()
  // Plan cards render once plan-config is loaded.
  await expect(page.locator('[data-id="planCard-business"]')).toBeVisible({ timeout: 20000 })
}

// After a subscribe/change/package action the UI navigates to the mock checkout page. Pay there,
// which fires the CONFIRMED webhook, then go back to billing so the caller can assert the new state.
async function payMockCheckout (page: Page, ws: string): Promise<void> {
  await expect(page).toHaveURL(/\/_tbank_subscriptions\/mock-checkout\//, { timeout: 20000 })
  await page.getByRole('button', { name: 'Оплатить' }).click()
  await expect(page.getByText('CONFIRMED')).toBeVisible({ timeout: 15000 })
  await openBilling(page, ws)
}

// A plan switch between two existing plans opens a MessageBox confirm; a first subscribe does not.
async function confirmIfDialog (page: Page): Promise<void> {
  const ok = page.locator('.msgbox-container .footer button').filter({ hasText: 'Ok' })
  try {
    await ok.first().click({ timeout: 4000 })
  } catch {
    /* no confirm dialog (first-time subscribe) */
  }
}

// Buy the Business per-seat plan for `seats` seats via the plan card, then pay on the mock checkout.
async function subscribeBusiness (page: Page, ws: string, seats: number): Promise<void> {
  const seatsInput = page.locator('[data-id="planSeats-business"]')
  await seatsInput.fill(String(seats))
  await seatsInput.blur()
  await page.locator('[data-id="planSubscribe-business"]').click()
  await confirmIfDialog(page)
  await payMockCheckout(page, ws)
  await expect(page.locator('[data-id="planSubscribe-business"]')).toHaveCount(0, { timeout: 20000 })
}

// Open the "Change seats" dialog, set the new count, verify the preview matches the direction
// (charge for an upgrade, renewal-date shift for a downgrade), then confirm.
async function changeSeats (page: Page, ws: string, seats: number, expect_: 'charge' | 'extend'): Promise<void> {
  await page.locator('[data-id="changeSeats"]').click()
  const dialog = page.locator('[data-id="changeSeatsDialog"]')
  await expect(dialog).toBeVisible({ timeout: 10000 })
  const input = page.locator('[data-id="changeSeatsInput"] input[type="number"]')
  await input.fill(String(seats))
  await input.blur()

  // Preview must show the right row and a recurring price. The one-time charge / date shift row is
  // exclusive to the change direction.
  if (expect_ === 'charge') {
    await expect(page.locator('[data-id="seatChargeRow"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-id="seatExtendRow"]')).toHaveCount(0)
  } else {
    await expect(page.locator('[data-id="seatExtendRow"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-id="seatChargeRow"]')).toHaveCount(0)
  }
  await expect(page.locator('[data-id="seatNewPrice"]')).toBeVisible()

  // The Card ok button (the only primary button in the dialog footer) applies the change.
  await page.locator('.antiCard .buttons-group button').last().click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
  // Only an upgrade moves money -> tbank checkout. A downgrade is covered by the unused credit and
  // is applied server-side in place, so no bank page appears.
  if (expect_ === 'charge') {
    await payMockCheckout(page, ws)
  } else {
    await openBilling(page, ws)
  }
}

// Connect / switch to a package by key. A switch from an existing package opens the change dialog
// with a proration preview (`expect_`: charge for a bigger package, date shift for a smaller one);
// the first connect (no active package) goes straight through checkout with no dialog.
async function connectPackage (page: Page, ws: string, pkgKey: string, expect_?: 'charge' | 'extend'): Promise<void> {
  await page.locator(`[data-id="packageConnect-${pkgKey}"]`).click()
  const dialog = page.locator('[data-id="packageChangeDialog"]')
  if (expect_ !== undefined) {
    await expect(dialog).toBeVisible({ timeout: 8000 })
    if (expect_ === 'charge') {
      await expect(page.locator('[data-id="packageChargeRow"]')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('[data-id="packageExtendRow"]')).toHaveCount(0)
    } else {
      await expect(page.locator('[data-id="packageExtendRow"]')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('[data-id="packageChargeRow"]')).toHaveCount(0)
    }
    await expect(page.locator('[data-id="packageNewPrice"]')).toBeVisible()
    await page.locator('.antiCard .buttons-group button').last().click()
    await expect(dialog).toBeHidden({ timeout: 15000 })
  }
  // A first connect or an upgrade charges -> tbank checkout. A downgrade is covered by the unused
  // credit and applied server-side in place, with no bank page.
  if (expect_ === 'extend') {
    await openBilling(page, ws)
  } else {
    await payMockCheckout(page, ws)
  }
  // The connect button for this package disappears once it becomes the current package.
  await expect(page.locator(`[data-id="packageConnect-${pkgKey}"]`)).toHaveCount(0, { timeout: 20000 })
}

test.describe('billing UI lifecycle (tbank + mock bank)', () => {
  test.use({ storageState: PlatformSetting })

  async function freshBusinessWorkspace (
    request: APIRequestContext,
    prefix: string
  ): Promise<{ workspace: WorkspaceUuid, wsUrl: string }> {
    const api = new ApiEndpoint(request)
    const wsInfo = await api.createWorkspaceWithLogin(`${prefix}-${generateId(8)}`, 'user1', '1234')
    // Start from a Business trial (as a new paying workspace would): buying then supersedes it.
    await setWorkspacePlanByUuid(wsInfo.workspace, 'business', {
      status: 'trialing',
      trialEnd: Date.now() + 14 * 24 * 3600 * 1000,
      users: 10
    })
    return { workspace: wsInfo.workspace, wsUrl: wsInfo.workspaceUrl }
  }

  test('trial then buy Business activates the plan', async ({ page, request }) => {
    const { workspace, wsUrl } = await freshBusinessWorkspace(request, 'buy')
    expect((await getTierSubscription(workspace))?.status).toBe('trialing')

    await openBilling(page, wsUrl)
    // Before buying, the trial state is shown on the active card.
    await expect(page.locator('[data-id="currentTierStatus"]')).toBeVisible({ timeout: 10000 })

    await subscribeBusiness(page, wsUrl, 3)

    await expect(async () => {
      const tier = await getTierSubscription(workspace)
      expect(tier?.status).toBe('active')
      expect(tier?.plan).toBe('business')
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 20000 })

    // The active card reflects the purchase: Business name, Active status, a price, a renewal date,
    // and the seat-change action.
    await expect(page.locator('[data-id="currentTierName"]')).toHaveText(/Business|Бизнес/)
    await expect(page.locator('[data-id="currentTierStatus"]')).toHaveText(/Active|Активен/)
    await expect(page.locator('[data-id="currentTierAmount"]')).toBeVisible()
    await expect(page.locator('[data-id="changeSeats"]')).toBeVisible()
  })

  test('increase then decrease seats on the active plan', async ({ page, request }) => {
    const { workspace, wsUrl } = await freshBusinessWorkspace(request, 'seats')
    await openBilling(page, wsUrl)
    await subscribeBusiness(page, wsUrl, 3)

    // Up: 3 -> 6, preview shows the one-time charge.
    await changeSeats(page, wsUrl, 6, 'charge')
    await expect(async () => {
      expect((await getTierSubscription(workspace))?.usersLimit).toBe(6)
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 20000 })

    // Down: 6 -> 2 (above the single owner member), preview shows the renewal-date shift, no charge.
    await changeSeats(page, wsUrl, 2, 'extend')
    await expect(async () => {
      expect((await getTierSubscription(workspace))?.usersLimit).toBe(2)
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 20000 })
  })

  test('seat count cannot go below the current member count', async ({ page, request }) => {
    const { wsUrl } = await freshBusinessWorkspace(request, 'seatmin')
    await openBilling(page, wsUrl)
    await subscribeBusiness(page, wsUrl, 3)

    await page.locator('[data-id="changeSeats"]').click()
    const input = page.locator('[data-id="changeSeatsInput"] input[type="number"]')
    // 1 member (owner) -> floor 1. Try 0: the NumberInput clamps to the minimum.
    await input.fill('0')
    await input.blur()
    await expect(input).toHaveValue('1')
  })

  test('connect a package, upgrade to a bigger one, then downgrade', async ({ page, request }) => {
    const { wsUrl } = await freshBusinessWorkspace(request, 'pkg')
    await openBilling(page, wsUrl)
    await subscribeBusiness(page, wsUrl, 2)

    // First connect: small package (no active package -> no replace dialog).
    await connectPackage(page, wsUrl, 'pkg-10mb')
    // Upgrade: bigger package -> replace dialog shows the one-time charge.
    await connectPackage(page, wsUrl, 'pkg-100mb', 'charge')
    // Downgrade: back to the small one -> replace dialog shows the date shift, no charge.
    await connectPackage(page, wsUrl, 'pkg-10mb', 'extend')
  })

  test('cancel then uncancel the subscription', async ({ page, request }) => {
    const { wsUrl } = await freshBusinessWorkspace(request, 'cancel')
    await openBilling(page, wsUrl)
    await subscribeBusiness(page, wsUrl, 2)

    // Cancel at period end: the plan stays visible with a "cancel scheduled" state and an uncancel button.
    await page.locator('[data-id="cancelSubscription"]').click()
    await confirmIfDialog(page)
    await expect(page.locator('[data-id="uncancelSubscription"]')).toBeVisible({ timeout: 15000 })
    // The plan stays visible with a "cancel scheduled" badge (not gone).
    await expect(page.locator('[data-id="currentTierStatus"]')).toHaveText(/Canceling|Отменяется/i)
    await expect(page.locator('[data-id="currentTierName"]')).toHaveText(/Business|Бизнес/)

    // Uncancel: back to active, cancel button returns.
    await page.locator('[data-id="uncancelSubscription"]').click()
    await confirmIfDialog(page)
    await expect(page.locator('[data-id="cancelSubscription"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-id="currentTierStatus"]')).toHaveText(/Active|Активен/)
  })

  test('buy a yearly Business plan', async ({ page, request }) => {
    const { workspace, wsUrl } = await freshBusinessWorkspace(request, 'yearly')
    await openBilling(page, wsUrl)

    // Switch the billing period to yearly before subscribing (the Switcher wraps the radio in a
    // label that intercepts clicks; target it by its data-id).
    await page.locator('[data-id="tab-yearly"]').click()
    await subscribeBusiness(page, wsUrl, 2)

    await expect(async () => {
      const tier = await getTierSubscription(workspace)
      expect(tier?.status).toBe('active')
      expect(tier?.plan).toBe('business')
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 20000 })

    // The active card labels the amount as a yearly charge (not monthly).
    await expect(page.locator('[data-id="currentTierAmount"]')).toContainText(/Yearly|В год/)
  })
})
