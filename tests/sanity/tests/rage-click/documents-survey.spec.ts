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

import { expect } from '@playwright/test'
import { test } from '../fixtures'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: survey', () => {
  test('"Submit" on a poll completes it once', async ({ page }, testInfo) => {
    const surveyName = `RageSurvey-${generateId(6)}`
    const talentName = `RageSurveyTalent-${generateId(6)}`

    // A Poll needs an existing Survey form to attach - create one with no questions, so the poll
    // is trivially valid to submit (nothing required answers it).
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/survey`))?.finished()
    await page.getByRole('button', { name: 'Survey Forms', exact: true }).click()
    await page.getByRole('button', { name: 'Survey', exact: true }).click()
    await page.getByPlaceholder('Title').fill(surveyName)
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Polls (survey.class.Poll) are attached to recruiting objects via a "Polls" section - a Talent
    // is the simplest place to reach it.
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/recruit`))?.finished()
    await page.getByRole('button', { name: 'New Talent', exact: true }).click()
    await page.getByPlaceholder('First name').fill(talentName)
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await page.getByRole('button', { name: 'Talents', exact: true }).click()
    await page.getByText(talentName, { exact: true }).click()

    const addPoll = page.locator('#survey\\:string\\:CreatePoll')
    await addPoll.scrollIntoViewIfNeeded()
    await addPoll.click()
    await page.getByText(surveyName, { exact: true }).click()

    const submitButton = page.getByRole('button', { name: 'Submit', exact: true })
    await expect(submitButton).toBeVisible({ timeout: 10000 })
    await rageClick(submitButton)

    // The button is usable again: the poll is read-only now, not stuck mid-submit.
    await expect(page.getByRole('button', { name: 'Edit answers', exact: true })).toBeVisible({ timeout: 10000 })
    // Without the guard, a rage click fires 3 overlapping updateDoc calls, each logging its own
    // "Completed set to Yes" activity entry instead of one.
    await expect(page.getByText('Completed set to', { exact: false })).toHaveCount(1)
  })
})
