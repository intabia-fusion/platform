import { expect, test } from '../fixtures'
import { LoginPage } from '../model/login-page'
import {
  createAccountAndWorkspace,
  generateId,
  generateTestData,
  getInviteLink,
  rageClick,
  PlatformURI
} from '../utils'
import { SelectWorkspacePage } from '../model/select-workspace-page'
import { SignUpPage } from '../model/signup-page'
import { SignUpData } from '../model/common-types'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { NewIssue } from '../model/tracker/types'
import { IssuesPage } from '../model/tracker/issues-page'
import { IssuesDetailsPage } from '../model/tracker/issues-details-page'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { SignInJoinPage } from '../model/signin-page'
import { getServiceAccountClient } from '../API/AccountClient'
import { closeAccountDb, getOtpCode } from '../API/AccountDb'
import { OtpPage } from '../model/otp-page'

test.describe('Workspace tests', () => {
  let loginPage: LoginPage
  let signUpPage: SignUpPage
  let selectWorkspacePage: SelectWorkspacePage
  let leftSideMenuPage: LeftSideMenuPage
  let trackerNavigationMenuPage: TrackerNavigationMenuPage
  let issuesPage: IssuesPage

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lang', 'en')
    })
    loginPage = new LoginPage(page)
    signUpPage = new SignUpPage(page)
    selectWorkspacePage = new SelectWorkspacePage(page)
    leftSideMenuPage = new LeftSideMenuPage(page)
    trackerNavigationMenuPage = new TrackerNavigationMenuPage(page)
    issuesPage = new IssuesPage(page)
  })

  test.afterAll(async () => {
    await closeAccountDb()
  })

  async function signInNewAccount (user: SignUpData): Promise<void> {
    const service = await getServiceAccountClient('tool')
    await service.signUp(user.email, user.password, user.firstName, user.lastName)
    await loginPage.goto()
    await loginPage.login(user.email, user.password)
    await loginPage.page.waitForURL((url) => url.pathname.startsWith('/login/selectWorkspace'))
  }

  test('Create a workspace with a custom name', async () => {
    const newUser: SignUpData = {
      firstName: `FirstName-${generateId()}`,
      lastName: `LastName-${generateId()}`,
      email: `sanity-email+${generateId()}@gmail.com`,
      password: '1234'
    }
    const newWorkspaceName = `New Workspace Name - ${generateId(2)}`
    await signInNewAccount(newUser)
    await selectWorkspacePage.createWorkspace(newWorkspaceName)
    await leftSideMenuPage.clickTracker()
  })

  test('Create a new issue in the workspace with a custom name', async ({ page }) => {
    const newUser: SignUpData = {
      firstName: `FirstName-${generateId()}`,
      lastName: `LastName-${generateId()}`,
      email: `sanity-email+${generateId()}@gmail.com`,
      password: '1234'
    }
    const newIssue: NewIssue = {
      title: `Issue with all parameters and attachments-${generateId()}`,
      description: 'Created issue with all parameters and attachments description',
      status: 'In Progress',
      priority: 'Urgent',
      assignee: `${newUser.lastName} ${newUser.firstName}`,
      createLabel: true,
      labels: `CREATE-ISSUE-${generateId()}`,
      component: 'No component',
      estimation: '2',
      milestone: 'No Milestone',
      duedate: 'today',
      filePath: 'cat.jpeg'
    }
    const newWorkspaceName = `New Issue Name - ${generateId(2)}`
    await signInNewAccount(newUser)
    await selectWorkspacePage.createWorkspace(newWorkspaceName)

    await trackerNavigationMenuPage.openIssuesForProject('Default')
    await issuesPage.clickModelSelectorAll()
    await issuesPage.createNewIssue(newIssue)
    await issuesPage.openIssueByName(newIssue.title)

    const issuesDetailsPage = new IssuesDetailsPage(page)
    await issuesDetailsPage.checkIssue(newIssue)
  })

  test('Check validation steps description for the create flow', async ({ page }) => {
    const newUser: SignUpData = {
      firstName: `FirstName-${generateId()}`,
      lastName: `LastName-${generateId()}`,
      email: `sanity-email+${generateId()}@gmail.com`,
      password: '1234'
    }
    const newWorkspaceName = `New Workspace Name - ${generateId(2)}`

    await loginPage.enableOtp()
    await page.goto(`${PlatformURI}/login/signup`)
    await signUpPage.checkInfo(page, 'Required field Email')
    await signUpPage.enterEmail(newUser.email)
    await loginPage.acceptEmailConsent()
    await page.getByRole('button', { name: 'Get code', exact: true }).click()
    const otp = new OtpPage(page)
    await otp.enterCode(await getOtpCode(newUser.email))
    await page.waitForURL((url) => url.pathname.startsWith('/login/onboarding'))
    await page.locator('input[name="workspace"]').fill('')
    await selectWorkspacePage.checkInfo(page, 'Required field Workspace name')
    await page.locator('input[name="workspace"]').fill(newWorkspaceName)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await signUpPage.checkInfo(page, 'Required field First name')
    await signUpPage.enterFirstName(newUser.firstName)
    await signUpPage.checkInfo(page, 'Required field Last name')
    await signUpPage.enterLastName(newUser.lastName)
    await signUpPage.checkInfoSectionNotExist(page)
  })

  test('Create a workspace with join link', async ({ page, browser }) => {
    const newUser: SignUpData = {
      firstName: `FirstName-${generateId()}`,
      lastName: `LastName-${generateId()}`,
      email: `sanity-email+${generateId()}@gmail.com`,
      password: '1234'
    }
    const newWorkspaceName = `Some HULY #@$ WS - ${generateId(12)}`
    await signInNewAccount(newUser)
    await selectWorkspacePage.createWorkspace(newWorkspaceName)
    await leftSideMenuPage.clickTracker()

    const linkText = await getInviteLink(page)
    const page2 = await browser.newPage()
    try {
      await page2.addInitScript(() => {
        localStorage.setItem('lang', 'en')
      })
      await page2.goto(linkText ?? '')
      const newUser2: SignUpData = {
        firstName: `FirstName2-${generateId()}`,
        lastName: `LastName2-${generateId()}`,
        email: `sanity-email+${generateId()}@gmail.com`,
        password: '1234'
      }

      // Join page shows initial screen first, click "Create new account"
      const joinPage2 = new SignInJoinPage(page2)
      await joinPage2.goToSignup()

      const signUpPage2 = new SignUpPage(page2)
      await signUpPage2.signUp(newUser2)

      const leftSideMenuPage2 = new LeftSideMenuPage(page2)
      await leftSideMenuPage2.clickTracker()
    } finally {
      await page2.close()
    }
  })

  test('Create one invitation when the button is clicked repeatedly', async ({ page, request }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lang', 'en')
    })
    await createAccountAndWorkspace(page, request, generateTestData())
    await leftSideMenuPage.openProfileMenu()
    await leftSideMenuPage.inviteToWorkspace()
    const button = leftSideMenuPage.getInviteLinkButton()
    await expect(button).toBeVisible()
    let requests = 0
    page.on('request', (sent) => {
      if (sent.method() === 'POST' && new URL(sent.url()).pathname.startsWith('/_account')) {
        if (sent.postDataJSON()?.method === 'createInvite') requests += 1
      }
    })

    await rageClick(button)
    await expect(page.locator('.antiPopup .link')).toBeVisible()
    expect(requests).toBe(1)
  })

  test('Create a workspace with join link - existing account', async ({ page, browser }) => {
    const newUser: SignUpData = {
      firstName: `FirstName-${generateId()}`,
      lastName: `LastName-${generateId()}`,
      email: `sanity-email+${generateId()}@gmail.com`,
      password: '1234'
    }
    const newWorkspaceName = `Some HULY #@$ WS - ${generateId(12)}`
    await signInNewAccount(newUser)
    await selectWorkspacePage.createWorkspace(newWorkspaceName)
    await leftSideMenuPage.clickTracker()

    const linkText = await getInviteLink(page)
    const page2 = await browser.newPage()
    try {
      await page2.addInitScript(() => {
        localStorage.setItem('lang', 'en')
      })
      const newUser2: SignUpData = {
        firstName: `FirstName2-${generateId()}`,
        lastName: `LastName2-${generateId()}`,
        email: `sanity-email+${generateId()}@gmail.com`,
        password: '1234'
      }

      const service = await getServiceAccountClient('tool')
      await service.signUp(newUser2.email, newUser2.password, newUser2.firstName, newUser2.lastName)

      // User has an account but no active cookie session, use login to join
      await page2.goto(linkText ?? '')
      const joinPage = new SignInJoinPage(page2)
      await joinPage.join(newUser2)

      const leftSideMenuPage2 = new LeftSideMenuPage(page2)
      await leftSideMenuPage2.clickTracker()
    } finally {
      await page2.close()
    }
  })
})
