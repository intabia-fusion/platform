import { test as setup, Page } from '@playwright/test'
import path from 'path'

import {
  PlatformUser,
  PlatformUserSecond,
  PlatformUserThird,
  PlatformUserFourth,
  PlatformUserFifth,
  PlatformWs,
  PlatformURI,
  setTestOptions
} from '../utils'
import { LoginPage } from '../model/login-page'
import { SelectWorkspacePage } from '../model/select-workspace-page'
import { existsSync } from 'fs'

const authFile = path.join(__dirname, '../../.auth/storage.json')
const authFileSecond = path.join(__dirname, '../../.auth/storageSecond.json')
const authFileThird = path.join(__dirname, '../../.auth/storageThird.json')
const authFileFourth = path.join(__dirname, '../../.auth/storageFourth.json')
const authFileFifth = path.join(__dirname, '../../.auth/storageFifth.json')

// user4/user5 are members of `meetings-ws` only - they exist for the love suite's five-participant
// tests and picking `PlatformWs` for them would hang on a workspace they cannot open.
async function authenticate (page: Page, user: string, password: string, ws: string = PlatformWs): Promise<void> {
  const loginPage = new LoginPage(page)
  await (await page.goto(`${PlatformURI}`))?.finished()
  await loginPage.login(user, password)
  const swp = new SelectWorkspacePage(page)
  await swp.selectWorkspace(ws)
  await page.waitForURL((url) => {
    return url.pathname.startsWith(`/workbench/${ws}/`)
  })
}

if (!existsSync(authFile)) {
  setup('auth user1', async ({ page }) => {
    await authenticate(page, PlatformUser, '1234')
    await setTestOptions(page)

    await page.context().storageState({ path: authFile })
  })
}

if (!existsSync(authFileSecond)) {
  setup('auth user2', async ({ page }) => {
    await authenticate(page, PlatformUserSecond, '1234')
    await setTestOptions(page)

    await page.context().storageState({ path: authFileSecond })
  })
}

if (!existsSync(authFileThird)) {
  setup('auth user3', async ({ page }) => {
    await authenticate(page, PlatformUserThird, '1234')
    await setTestOptions(page)

    await page.context().storageState({ path: authFileThird })
  })
}

// Same workspace name the love helpers use; these two accounts belong to no other.
const MEETINGS_WS = 'meetings-ws'

if (!existsSync(authFileFourth)) {
  setup('auth user4', async ({ page }) => {
    await authenticate(page, PlatformUserFourth, '1234', MEETINGS_WS)
    await setTestOptions(page)

    await page.context().storageState({ path: authFileFourth })
  })
}

if (!existsSync(authFileFifth)) {
  setup('auth user5', async ({ page }) => {
    await authenticate(page, PlatformUserFifth, '1234', MEETINGS_WS)
    await setTestOptions(page)

    await page.context().storageState({ path: authFileFifth })
  })
}
