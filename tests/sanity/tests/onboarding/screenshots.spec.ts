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

// Not a test: re-shoots the "where to press" screenshots of the onboarding steps for every UI language
// into dev/prod/public/onboarding/<lang>/<card id>.jpg (getStepScreenshot in workbench-resources).
// Run on a sanity stand built from the current branch:
//   ONBOARDING_SCREENSHOTS=1 pnpm run uitest -g 'onboarding screenshots' --reporter=list --retries=0

import { type Page } from '@playwright/test'
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import { test } from '../fixtures'
import { PlatformSetting, PlatformURI } from '../utils'

const languages = ['en', 'ru', 'es', 'pt', 'pt-br', 'zh', 'fr', 'cs', 'it', 'de', 'ja', 'tr']
const outDir = resolve(__dirname, '../../../../dev/prod/public/onboarding')

interface Shot {
  press?: string // pressed first, its popup or menu stays in the shot
  highlight: string // the element the user should press
}

interface Step {
  card: string // OnboardingCard id
  app?: string // app alias to open first
  // Two shots per step (OnboardingCard.screenshots): <card>_1.jpg, <card>_2.jpg; selectors of second shots
  // were checked by hand on the dev stand only.
  shots: Shot[]
}

const steps: Step[] = [
  {
    card: 'workbench:ids:OnboardingInviteCard',
    shots: [
      { highlight: '[data-id="profile-button"]' },
      { press: '[data-id="profile-button"]', highlight: '[data-id="invite-workspace"]' }
    ]
  },
  {
    card: 'workbench:ids:OnboardingAppearanceCard',
    shots: [{ highlight: '#statusbar-settings' }, { press: '#statusbar-settings', highlight: '.popup' }]
  },
  {
    card: 'tracker:ids:OnboardingIssuesCard',
    app: 'tracker',
    shots: [
      { highlight: '[data-id~="tracker-string-NewIssue"], [data-id~="tracker-string-ResumeDraft"]' },
      {
        press: '[data-id~="tracker-string-NewIssue"], [data-id~="tracker-string-ResumeDraft"]',
        highlight: '.popup button:has-text("Создать задачу"), .popup button:has-text("Create issue")'
      }
    ]
  },
  {
    card: 'tracker:ids:OnboardingProjectsCard',
    app: 'tracker',
    shots: [
      { highlight: '[data-id~="tracker-string-CreateProject"]' },
      {
        press: '[data-id~="tracker-string-CreateProject"]',
        highlight: '[data-id="select-tracker-string-CreateProject"]'
      }
    ]
  },
  {
    card: 'workbench:ids:OnboardingSearchCard',
    shots: [{ highlight: '#statusbar-search' }, { press: '#statusbar-search', highlight: '.popup input' }]
  },
  {
    card: 'chunter:ids:OnboardingChatsCard',
    app: 'chunter',
    shots: [{ highlight: '[data-id="chat-new-button"]' }, { press: '[data-id="chat-new-button"]', highlight: '.popup' }]
  },
  {
    card: 'chunter:ids:OnboardingAskJuliaCard',
    shots: [
      { highlight: '[data-id="ai-chat-button"]' },
      { press: '[data-id="ai-chat-button"]', highlight: '[contenteditable="true"]' }
    ]
  },
  {
    card: 'document:ids:OnboardingTeamspaceCard',
    app: 'document',
    shots: [
      { highlight: '[data-id~="document-string-CreateTeamspace"]' },
      {
        press: '[data-id~="document-string-CreateTeamspace"]',
        highlight: '[data-id="select-document-string-CreateTeamspace"]'
      }
    ]
  },
  {
    card: 'document:ids:OnboardingDocumentsCard',
    app: 'document',
    shots: [
      { highlight: '[data-id~="document-string-CreateDocument"]' },
      { press: '[data-id~="document-string-CreateDocument"]', highlight: '.popup button[type="submit"]' }
    ]
  },
  {
    card: 'drive:ids:OnboardingDriveCard',
    app: 'drive',
    shots: [
      { highlight: '[data-id~="drive-string-CreateDrive"]' },
      { press: '[data-id~="drive-string-CreateDrive"]', highlight: '[data-id="select-drive-string-CreateDrive"]' }
    ]
  },
  {
    card: 'drive:ids:OnboardingFilesCard',
    app: 'drive',
    shots: [
      { highlight: '.hulyNavPanel-container [class*="nav-item"]' },
      { highlight: '[data-id~="uploader-string-UploadFiles"]' }
    ]
  },
  {
    card: 'calendar:ids:OnboardingMeetingsCard',
    app: 'time',
    shots: [{ highlight: 'a[href$="/time"] button' }, { highlight: '[data-id="calendar-grid"]' }]
  },
  {
    card: 'love:ids:OnboardingCallsCard',
    app: 'love',
    shots: [{ highlight: 'a[href$="/love"] button' }, { highlight: '.floorGrid-room' }]
  },
  {
    card: 'notification:ids:OnboardingInboxCard',
    app: 'notification',
    shots: [{ highlight: '[id="app-notification:string:Inbox"]' }, { highlight: '.hulyNavPanel-container' }]
  },
  {
    card: 'workbench:ids:OnboardingHelpCenterCard',
    shots: [
      { highlight: '[data-id="profile-button"]' },
      { press: '[data-id="profile-button"]', highlight: '[data-id="help-and-support"]' }
    ]
  }
]

test.use({ storageState: PlatformSetting, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

async function shoot (page: Page, lang: string, step: Step, shot: Shot, file: string): Promise<void> {
  await page.goto(`${PlatformURI}/workbench/sanity-ws/${step.app ?? 'tracker'}`)
  try {
    if (shot.press !== undefined) {
      await page.locator(shot.press).first().click({ timeout: 10000 })
      await page.waitForTimeout(500)
    }
    await page.locator(shot.highlight).last().waitFor({ state: 'visible', timeout: 10000 })
  } catch {
    console.warn(`onboarding screenshots: ${lang} ${file}: element not found, skipped`)
    return
  }
  const target = page.locator(shot.highlight).last()
  // Red frame only, no dimming: the same look as the shots taken by hand.
  await target.evaluate((el) => {
    el.style.outline = '3px solid #ff3b30'
    el.style.outlineOffset = '4px'
    el.style.borderRadius = '8px'
  })
  const boxes = [await target.boundingBox()]
  if (shot.press !== undefined) boxes.push(await page.locator(shot.press).first().boundingBox())
  const shown = boxes.filter((b): b is NonNullable<typeof b> => b !== null)
  // A small area, at least 480x300, around the button and the menu it opened: the popup shows it ~26rem wide.
  const pad = 40
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 }
  let x0 = Math.min(...shown.map((b) => b.x)) - pad
  let y0 = Math.min(...shown.map((b) => b.y)) - pad
  let x1 = Math.max(...shown.map((b) => b.x + b.width)) + pad
  let y1 = Math.max(...shown.map((b) => b.y + b.height)) + pad
  if (x1 - x0 < 480) [x0, x1] = [(x0 + x1) / 2 - 240, (x0 + x1) / 2 + 240]
  if (y1 - y0 < 300) [y0, y1] = [(y0 + y1) / 2 - 150, (y0 + y1) / 2 + 150]
  if (x0 < 0) [x0, x1] = [0, x1 - x0]
  if (y0 < 0) [y0, y1] = [0, y1 - y0]
  if (x1 > viewport.width) [x0, x1] = [Math.max(0, x0 - (x1 - viewport.width)), viewport.width]
  if (y1 > viewport.height) [y0, y1] = [Math.max(0, y0 - (y1 - viewport.height)), viewport.height]
  await page.screenshot({
    path: resolve(outDir, lang, file),
    type: 'jpeg',
    quality: 85,
    clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  })
  await page.keyboard.press('Escape')
}

test.describe('onboarding screenshots', () => {
  test.skip(process.env.ONBOARDING_SCREENSHOTS === undefined, 'set ONBOARDING_SCREENSHOTS=1 to re-shoot')
  test.setTimeout(30 * 60 * 1000)

  test('onboarding screenshots', async ({ page }) => {
    for (const lang of languages) {
      mkdirSync(resolve(outDir, lang), { recursive: true })
      await page.goto(`${PlatformURI}/workbench/sanity-ws`)
      await page.evaluate((l) => {
        localStorage.setItem('lang', l)
      }, lang)
      for (const step of steps) {
        const base = step.card.replace(/:/g, '_')
        for (const [i, shot] of step.shots.entries()) {
          await shoot(page, lang, step, shot, step.shots.length > 1 ? `${base}_${i + 1}.jpg` : `${base}.jpg`)
        }
      }
    }
  })
})
