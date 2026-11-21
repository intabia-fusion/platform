import {
  ApiEndpoint,
  generateId,
  IssuesPage,
  LoginPage,
  NewIssue,
  SelectWorkspacePage,
  TrackerNavigationMenuPage
} from '@hcengineering/tests-sanity'
import { expect, test } from '@playwright/test'
import core, { TxFactory, type Ref, type Space } from '@hcengineering/core'
import { AdminPage } from '../model/admin.page'

// The operator is no longer a member of every workspace: "View as" opens a read-only session as a
// real member instead. Asserts that the session lands in the workspace and refuses to write.
test.describe('Admin impersonation', () => {
  test('admin opens a read-only session as a workspace member', async ({ page, request }) => {
    const api: ApiEndpoint = new ApiEndpoint(request)
    const wsId = generateId(5)
    const workspaceInfo = await api.createWorkspaceWithLogin(wsId, 'user1', '1234')

    const loginPage = new LoginPage(page)
    const selectWorkspacePage = new SelectWorkspacePage(page)
    const issuesPage = new IssuesPage(page)
    const trackerNavigationMenuPage = new TrackerNavigationMenuPage(page)
    let impersonation: { token: string, endpoint: string, workspace: string }

    const newIssue: NewIssue = {
      title: `Issue seen through impersonation-${wsId}`,
      description: 'Created by the owner, read by the operator',
      status: 'In Progress',
      priority: 'Urgent',
      component: 'No component',
      estimation: '2',
      milestone: 'No Milestone',
      duedate: 'today'
    }

    await test.step('owner creates an issue', async () => {
      await loginPage.goto()
      await loginPage.login('user1', '1234')
      await selectWorkspacePage.selectWorkspace(wsId)
      await trackerNavigationMenuPage.openIssuesForProject('Default')
      await issuesPage.clickModelSelectorAll()
      await issuesPage.createNewIssue(newIssue)
    })

    await test.step('admin opens the workspace as that member', async () => {
      await loginPage.goto()
      await loginPage.login('admin', '1234')
      await page.waitForURL((url) => {
        return url.pathname.startsWith('/login/selectWorkspace') || url.pathname.startsWith('/workbench/')
      })

      const adminPage = new AdminPage(page)
      await adminPage.gotoAdmin()
      await adminPage.openWorkspacesTab()
      await adminPage.searchWorkspace(workspaceInfo.workspace)
      await adminPage.openWorkspaceDetails(workspaceInfo.workspace)

      const response = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.request().postDataJSON()?.method === 'adminImpersonate'
      )
      await page.getByRole('button', { name: 'View as', exact: true }).first().click()
      // Impersonation is OTP-gated like every other admin operation.
      await adminPage.confirmOtp()
      impersonation = (await (await response).json()).result

      await page.waitForURL((url) => url.pathname.startsWith('/workbench/'))
    })

    await test.step('the session reads the workspace but cannot write', async () => {
      await trackerNavigationMenuPage.openIssuesForProject('Default')
      await issuesPage.clickModelSelectorAll()
      await expect(page.locator('span', { hasText: newIssue.title }).first()).toBeVisible()

      // Every tx from a read-only session is refused by the transactor: the issue must not appear.
      const tx = new TxFactory(core.account.System).createTxUpdateDoc(
        core.class.Space,
        core.space.Space,
        'tracker:project:DefaultProject' as Ref<Space>,
        { name: `Must not be changed-${wsId}` }
      )
      const response = await request.post(
        `${impersonation.endpoint.replace(/^ws/, 'http')}/api/v1/tx/${impersonation.workspace}`,
        {
          headers: { Authorization: `Bearer ${impersonation.token}` },
          data: tx
        }
      )
      expect(response.ok()).toBe(false)
      expect(await response.text()).toContain('WorkspaceReadOnly')
    })
  })
})
