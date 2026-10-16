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

import { createRestClient, type RestClient, getWorkspaceToken, loadServerConfig } from '@hcengineering/api-client'
import { expect, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { UserProfilePage } from '../model/profile/user-profile-page'
import { NewProjectPage } from '../model/tracker/new-project-page'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { generateProjectId } from '../tracker/tracker.utils'
import { generateId, PlatformSetting, PlatformURI, PlatformUser, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// ConnectProject/GithubRepositories need no real GitHub OAuth: neither github:class:GithubIntegration,
// github:class:GithubIntegrationRepository nor the github:mixin:GithubProject mixin carry a
// TxAccessLevel restriction, so a plain user REST token can seed them directly (AuthenticationCheck's
// own OAuth flow is a different, unrelated entry point - Settings > Integrations > Github's
// "Github Repositories" tab only reads these docs, it never checks GithubAuthentication).
async function restClient (): Promise<RestClient> {
  const baseUrl = PlatformURI.replace(/\/_account\/?$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUser, password: '1234', workspace: 'sanity-ws' },
    config
  )
  return createRestClient(token.endpoint, token.workspaceId, token.token)
}

async function seedIntegration (rest: RestClient, tag: string): Promise<string> {
  return await rest.createDoc(
    'github:class:GithubIntegration' as any,
    'core:space:Workspace' as any,
    {
      installationId: Math.floor(Math.random() * 1000000),
      clientId: 'rage-click-client',
      name: `rage-click-org-${tag}`,
      nodeId: `node-${tag}`,
      alive: true,
      useProject: false
    } as any
  )
}

async function seedRepository (
  rest: RestClient,
  integrationId: string,
  tag: string
): Promise<{ repoId: string, repoName: string }> {
  const repoName = `rage-repo-${tag}`
  const repoId = await rest.addCollection(
    'github:class:GithubIntegrationRepository' as any,
    'core:space:Workspace' as any,
    integrationId as any,
    'github:class:GithubIntegration' as any,
    'repositories',
    {
      name: repoName,
      repositoryId: Math.floor(Math.random() * 1000000),
      enabled: false,
      githubProject: null,
      fork: false,
      forks: 0,
      private: false,
      stargazers: 0,
      hasIssues: true,
      hasProjects: false,
      hasDownloads: false,
      hasPages: false,
      hasWiki: false,
      hasDiscussions: false,
      openIssues: 0,
      watchers: 0,
      archived: false,
      size: 0
    } as any
  )
  return { repoId: repoId as unknown as string, repoName }
}

async function createTrackerProject (page: Page, tag: string): Promise<string> {
  const projectId = generateProjectId()
  const projectTitle = `GHTarget-${tag}`
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker`))?.finished()
  await new TrackerNavigationMenuPage(page).pressCreateProjectButton()
  await new NewProjectPage(page).createNewProject({ title: projectTitle, identifier: projectId })
  await new TrackerNavigationMenuPage(page).checkProjectExist(projectTitle)
  return projectTitle
}

async function openGithubInstallationsTab (page: Page): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  await new UserProfilePage(page).clickSettings()
  await page.getByRole('button', { name: 'Integrations' }).click()
  const githubCard = page.locator('div.flex-row-center.header', { hasText: 'Github' }).locator('xpath=..')
  await githubCard.getByRole('button', { name: /Connect|Configure/ }).click()
  await page.getByTestId('tab-installations').click()
}

test.describe('Rage click: github', () => {
  test('"Connect to {title}" opens one project picker', async ({ page }) => {
    const tag = generateId(8)
    const rest = await restClient()
    const integrationId = await seedIntegration(rest, tag)
    const { repoName } = await seedRepository(rest, integrationId, tag)

    await openGithubInstallationsTab(page)
    const row = page.locator('.repository-card', { hasText: repoName })
    await expect(row).toBeVisible({ timeout: 10000 })

    // selecting guards showPopup(DropdownLabelsPopup) itself: without it, a rage click stacks one
    // project-picker popup per click.
    await rageClick(row.getByRole('button', { name: /Connect to/ }))
    await expect(page.locator('.selectPopup')).toHaveCount(1)

    // Usable again. Picking a project is left out on purpose: assignRepository adds the GitHub
    // PullRequest task type to the project's type, which the seeded Default project shares.
    await page.keyboard.press('Escape')
    await expect(page.locator('.selectPopup')).toHaveCount(0)
    await row.getByRole('button', { name: /Connect to/ }).click()
    await expect(page.locator('.selectPopup')).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('"Disconnect" opens one confirmation, unlinks the repository once, and recovers', async ({ page }) => {
    const tag = generateId(8)
    const rest = await restClient()
    const integrationId = await seedIntegration(rest, tag)
    const projectTitle = await createTrackerProject(page, tag)
    const project = (await rest.findOne('tracker:class:Project' as any, { name: projectTitle } as any)) as any

    const { repoId, repoName } = await seedRepository(rest, integrationId, tag)
    // A mixin attaches to the existing doc - it shares the project's own _id, not a new one.
    await rest.createMixin(
      project._id as any,
      'tracker:class:Project' as any,
      'core:space:Space' as any,
      'github:mixin:GithubProject' as any,
      { integration: integrationId, repositories: [repoId] } as any
    )
    const githubProjectId = project._id as any
    await rest.updateCollection(
      'github:class:GithubIntegrationRepository' as any,
      'core:space:Workspace' as any,
      repoId as any,
      integrationId as any,
      'github:class:GithubIntegration' as any,
      'repositories',
      { githubProject: githubProjectId, enabled: true } as any
    )

    await openGithubInstallationsTab(page)
    const row = page.locator('.repository-card', { hasText: repoName })
    await expect(row.getByRole('button', { name: 'Disconnect' })).toBeVisible({ timeout: 10000 })

    // disconnecting only guards the findAll()+showPopup(MessageBox) confirmation, not the
    // disconnect() mutation itself (that runs later, from the popup's own action) - without the
    // guard, a rage click would stack one confirmation popup per click.
    await rageClick(row.getByRole('button', { name: 'Disconnect' }))
    await expect(page.locator('.msgbox-container')).toHaveCount(1)
    await page.locator('.msgbox-container').getByText('Ok', { exact: true }).click()

    // Unlinked exactly once: the row flips back to "Connect to {title}", and the repository is
    // enabled: false / githubProject: null exactly once (not racing a second confirm/disconnect).
    await expect(row.getByRole('button', { name: /Connect to/ })).toBeVisible({ timeout: 15000 })
    const repo = (await rest.findOne('github:class:GithubIntegrationRepository' as any, { _id: repoId } as any)) as any
    expect(repo.enabled).toBe(false)
    expect(repo.githubProject).toBeNull()

    // Usable again: the row no longer shows Disconnect, proving it settled cleanly.
    await expect(row.getByRole('button', { name: 'Disconnect' })).toHaveCount(0)
  })
})
