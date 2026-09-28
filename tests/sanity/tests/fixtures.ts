//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import type { WorkspaceLoginInfo } from '@hcengineering/account'
import { request as apiRequest, test as base } from '@playwright/test'
import type { TestData } from './chat/types'
import { createAccountWithWorkspace, flushTelemetry, generateTestData } from './utils'

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
