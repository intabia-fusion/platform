import { test as setup, Page } from '@playwright/test'
import path from 'path'
import { existsSync } from 'fs'

import {
  PlatformUser,
  PlatformUserSecond,
  PlatformUserThird,
  PlatformUserQara,
  PlatformWs,
  PlatformURI,
  setTestOptions
} from '../utils'
import { LoginPage } from '../model/login-page'
import { SelectWorkspacePage } from '../model/select-workspace-page'

const authFile = path.join(__dirname, '../../.auth/qms-storage.json')
const authFileSecond = path.join(__dirname, '../../.auth/qms-storageSecond.json')
const authFileThird = path.join(__dirname, '../../.auth/qms-storageThird.json')
const authFileQARA = path.join(__dirname, '../../.auth/qms-storageQaraManager.json')

async function authenticate (page: Page, user: string, password: string): Promise<void> {
  const loginPage = new LoginPage(page)
  await (await page.goto(`${PlatformURI}`))?.finished()
  await loginPage.login(user, password)
  const swp = new SelectWorkspacePage(page)
  await swp.selectWorkspace(PlatformWs)
  await page.waitForURL((url) => {
    return url.pathname.startsWith(`/workbench/${PlatformWs}/`)
  })
}

// Reuse a saved storageState if present. prepare-qms.sh removes .auth on stand
// recreation, so a missing file means a fresh login is required.
setup('qms auth user1', async ({ page }) => {
  if (existsSync(authFile)) return
  await authenticate(page, PlatformUser, '1234')
  await setTestOptions(page)

  await page.context().storageState({ path: authFile })
})

setup('qms auth user2', async ({ page }) => {
  if (existsSync(authFileSecond)) return
  await authenticate(page, PlatformUserSecond, '1234')
  await setTestOptions(page)

  await page.context().storageState({ path: authFileSecond })
})

setup('qms auth user3', async ({ page }) => {
  if (existsSync(authFileThird)) return
  await authenticate(page, PlatformUserThird, '1234')
  await setTestOptions(page)

  await page.context().storageState({ path: authFileThird })
})

setup('qms auth qara', async ({ page }) => {
  if (existsSync(authFileQARA)) return
  await authenticate(page, PlatformUserQara, '1234')
  await setTestOptions(page)

  await page.context().storageState({ path: authFileQARA })
})
