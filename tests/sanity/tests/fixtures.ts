//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import type { WorkspaceLoginInfo } from '@hcengineering/account'
import { request as apiRequest, test as base, type Page } from '@playwright/test'
import type { TestData } from './chat/types'
import { SidebarPage } from './model/sidebar-page'
import { createAccountWithWorkspace, flushTelemetry, generateTestData, loginByToken } from './utils'

export { expect } from '@playwright/test'
export type { APIRequestContext, Browser, BrowserContext, Locator, Page } from '@playwright/test'

export interface SharedWorkspace {
  data: TestData
  ws: WorkspaceLoginInfo
  token: string
}

// Free plan gives 5 seats, AI bot takes none: owner + 4 guests fit, one spare. An invite
// skipping `@invite` is uncounted; past the cap a guest goes read-only.
const SEATS_PER_WORKSPACE = 3

// @playwright/test's `test`, plus a flush of client counters before a context closes.
// Overriding `context` and not `page` keeps request-only tests browser-free.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const test = base.extend<{}, { sharedWorkspace: (invites?: number) => Promise<SharedWorkspace> }>({
  context: async ({ context }, use) => {
    await use(context)
    await Promise.all(context.pages().map(flushTelemetry))
  },

  // One workspace per worker, not per test: creating one costs ~1.9s account/model-building
  // time. Tests that invite guests spend seats, so it's recycled before it runs out.
  sharedWorkspace: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const request = await apiRequest.newContext()
      let current: SharedWorkspace | undefined
      let seatsLeft = 0
      await use(async (invites = 0) => {
        if (current === undefined || invites > seatsLeft) {
          const data = generateTestData()
          current = { data, ...(await createAccountWithWorkspace(request, data)) }
          seatsLeft = SEATS_PER_WORKSPACE
        }
        seatsLeft -= invites
        return current
      })
      await request.dispose()
    },
    { scope: 'worker' }
  ]
})

// One browser window per worker for specs that open the same app in every test: a fresh context
// costs a full SPA boot, ~0.9s under 5 workers (measured as the wait for the first button).
// The window is shared only through `enterWorkspace`, which puts it back to a clean start.
export const sharedPageTest = test.extend<object, { workerWindow: { page?: Page } }>({
  workerWindow: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use({})
    },
    { scope: 'worker' }
  ],

  page: async ({ browser, workerWindow }, use) => {
    // Created here, not in the worker fixture: only a test fixture gets the project's context options.
    workerWindow.page ??= await (await browser.newContext()).newPage()
    await use(workerWindow.page)
  }
})

// `test.afterAll(closeSharedPage)`: a window left open would stay connected as the owner of the
// worker's workspace and meet the next spec of the worker as a second session.
export async function closeSharedPage ({ workerWindow }: { workerWindow: { page?: Page } }): Promise<void> {
  const page = workerWindow.page
  workerWindow.page = undefined
  if (page === undefined) return
  await flushTelemetry(page)
  await page.context().close()
}

const entered = new WeakMap<Page, string>()

// Logs in on the first call (or after the shared workspace was recycled), later calls move the
// booted app to `app` without a reload. Only localStorage keys the login needs survive: saved
// locations, view and filter choices, drafts and collapsed sections are read when a component
// mounts, so they would carry the previous test into this one.
export async function enterWorkspace (page: Page, shared: SharedWorkspace, app: string): Promise<void> {
  const url = `/workbench/${shared.ws.workspaceUrl}/${app}`
  const warm = entered.get(page) === shared.ws.workspaceUrl
  const clean = warm && (await resetWindow(page))
  if (warm) {
    await page.evaluate(
      ([url, clean]) => {
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith('login:metadata:') && key !== '#platform.notification.timeout') {
            localStorage.removeItem(key)
          }
        }
        sessionStorage.clear()
        if (clean) {
          history.pushState(null, '', url)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
      },
      [url, clean] as const
    )
    if (clean) return
  }
  await loginByToken(page, shared.token, shared.ws, app)
  entered.set(page, shared.ws.workspaceUrl)
}

// Closes what a test leaves open in memory, where clearing localStorage does not reach: popups and
// the sidebar's tabs. False when something stays, and the caller reloads the app instead.
async function resetWindow (page: Page): Promise<boolean> {
  await page.keyboard.press('Escape')
  const sidebar = new SidebarPage(page)
  for (let i = 0; i < 5 && (await sidebar.content().isVisible()); i++) {
    await sidebar.closeOpenedVerticalTab()
    await sidebar.content().waitFor({ state: 'hidden', timeout: 2000 }).catch(() => undefined)
  }
  const popup = page.locator('.popup, .antiPopup, .hulyModal-container').locator('visible=true')
  return !(await sidebar.content().isVisible()) && (await sidebar.verticalTabs().count()) === 0 && (await popup.count()) === 0
}
