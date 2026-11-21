import { faker } from '@faker-js/faker'
import {
  generateId,
  getOtpCode,
  IssuesDetailsPage,
  IssuesPage,
  LeftSideMenuPage,
  LoginPage,
  NewIssue,
  OtpPage,
  SignUpData,
  SignUpPage,
  TrackerNavigationMenuPage,
  UserProfilePage
} from '@hcengineering/tests-sanity'
import { expect, test, type Page } from '@playwright/test'

async function register (page: Page, user: SignUpData): Promise<void> {
  await confirmRegistrationCode(page, user.email)
  await page.waitForURL((url) => url.pathname.startsWith('/login/onboarding'))
}

async function confirmRegistrationCode (page: Page, email: string): Promise<void> {
  await new LoginPage(page).loginWithCode(email)
  const otp = new OtpPage(page)
  await otp.enterCode(await getOtpCode(email))
}

async function fillProfileName (page: Page, user: SignUpData): Promise<void> {
  await page.locator('input[name="given-name"]').fill(user.firstName)
  await page.locator('input[name="family-name"]').fill(user.lastName)
}

async function createWorkspace (page: Page, name: string, user: SignUpData): Promise<void> {
  await page.locator('input[name="workspace"]').fill(name)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await fillProfileName(page, user)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/workbench/'))
}

async function joinWorkspace (page: Page, ownerPage: Page): Promise<void> {
  const workspacePath = new URL(ownerPage.url()).pathname.split('/').slice(0, 3).join('/')
  await page.getByRole('button', { name: 'Join workspace', exact: true }).click()
  await page.waitForURL((url) => url.pathname === workspacePath || url.pathname.startsWith(`${workspacePath}/`))
}

test.describe('Workspace tests', () => {
  let loginPage: LoginPage
  let signUpPage: SignUpPage
  let leftSideMenuPage: LeftSideMenuPage
  let trackerNavigationMenuPage: TrackerNavigationMenuPage
  let issuesPage: IssuesPage

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    signUpPage = new SignUpPage(page)
    leftSideMenuPage = new LeftSideMenuPage(page)
    trackerNavigationMenuPage = new TrackerNavigationMenuPage(page)
    issuesPage = new IssuesPage(page)
  })

  test('Create a workspace with a custom name', async ({ page }) => {
    const newUser: SignUpData = {
      firstName: `FirstName-${generateId()}`,
      lastName: `LastName-${generateId()}`,
      email: `sanity-email+${generateId()}@gmail.com`,
      password: '1234'
    }
    const newWorkspaceName = `New Workspace Name - ${generateId(2)}`
    await loginPage.goto()
    await register(page, newUser)
    await createWorkspace(page, newWorkspaceName, newUser)
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
      duedate: 'today'
    }
    const newWorkspaceName = `New Issue Name - ${generateId(2)}`
    await loginPage.goto()
    await register(page, newUser)
    await createWorkspace(page, newWorkspaceName, newUser)

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

    await loginPage.goto()
    await signUpPage.checkInfo(page, 'Required field Email')
    await loginPage.loginWithCode(newUser.email)
    await new OtpPage(page).enterCode(await getOtpCode(newUser.email))
    await page.waitForURL((url) => url.pathname.startsWith('/login/onboarding'))
    await expect(page.locator('input[name="workspace"]')).toHaveValue(`${newUser.email.split('@')[0]} Personal Space`)
    await page.locator('input[name="workspace"]').fill('')
    await signUpPage.checkInfo(page, 'Required field Workspace name')
    await page.locator('input[name="workspace"]').fill(newWorkspaceName)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await signUpPage.checkInfo(page, 'Required field First name')
    await signUpPage.enterFirstName(newUser.firstName)
    await signUpPage.checkInfo(page, 'Required field Last name')
    await signUpPage.enterLastName(newUser.lastName)
    // Previously, with USE_OTP the password fields sat behind a checkbox; email-first no longer asks for a password.
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
    await loginPage.goto()
    await register(page, newUser)
    await createWorkspace(page, newWorkspaceName, newUser)
    await leftSideMenuPage.clickTracker()

    // Generate invite link

    await leftSideMenuPage.openProfileMenu()
    await leftSideMenuPage.inviteToWorkspace()
    await leftSideMenuPage.getInviteLink()

    const linkText = await page.locator('.antiPopup .link').textContent()
    const page2 = await browser.newPage()
    try {
      await page2.goto(linkText ?? '')
      const newUser2: SignUpData = {
        firstName: `FirstName2-${generateId()}`,
        lastName: `LastName2-${generateId()}`,
        email: `sanity-email+${generateId()}@gmail.com`,
        password: '1234'
      }

      await confirmRegistrationCode(page2, newUser2.email)
      await fillProfileName(page2, newUser2)
      await joinWorkspace(page2, page)

      const leftSideMenuPage2 = new LeftSideMenuPage(page2)
      await leftSideMenuPage2.clickTracker()
    } finally {
      await page2.close()
    }
  })

  test('Create a workspace with join link - existing account', async ({ page, browser }) => {
    const newUser: SignUpData = {
      firstName: `FirstName-${generateId()}`,
      lastName: `LastName-${generateId()}`,
      email: `sanity-email+${generateId()}@gmail.com`,
      password: '1234'
    }
    const newWorkspaceName = `Some HULY #@$ WS - ${generateId(12)}`
    await loginPage.goto()
    await register(page, newUser)
    await createWorkspace(page, newWorkspaceName, newUser)
    await leftSideMenuPage.clickTracker()

    // Generate invite link
    await leftSideMenuPage.openProfileMenu()
    await leftSideMenuPage.inviteToWorkspace()
    await leftSideMenuPage.getInviteLink()

    const linkText = await page.locator('.antiPopup .link').textContent()
    const page2 = await browser.newPage()
    try {
      const loginPage2 = new LoginPage(page2)
      await loginPage2.goto()

      const newUser2: SignUpData = {
        firstName: `FirstName2-${generateId()}`,
        lastName: `LastName2-${generateId()}`,
        email: `sanity-email+${generateId()}@gmail.com`,
        password: '1234'
      }

      await register(page2, newUser2)
      await createWorkspace(page2, `Other Workspace - ${generateId(8)}`, newUser2)

      // The account is signed in and has its own workspace before joining the invited workspace.
      await page2.goto(linkText ?? '')
      await expect(page2.getByRole('button', { name: 'Join workspace', exact: true })).toBeVisible()
      await expect(
        page2.locator('input[name="email"], input[name="given-name"], input[name="family-name"]')
      ).toHaveCount(0)
      await joinWorkspace(page2, page)

      const leftSideMenuPage2 = new LeftSideMenuPage(page2)
      await leftSideMenuPage2.clickTracker()
    } finally {
      await page2.close()
    }
  })

  test('User can leave workspace', async ({ page, browser }) => {
    const newUser: SignUpData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      password: '1234'
    }
    const newWorkspaceName = `Some HULY #@$ WS - ${generateId(12)}`
    await loginPage.goto()
    await register(page, newUser)
    await createWorkspace(page, newWorkspaceName, newUser)
    // Readiness gate only: wait for the workbench app bar. Do NOT click the active Tracker icon
    // (it collapses the navigator) and do not assert the sidebar — this test never uses it.
    await leftSideMenuPage.buttonTracker().waitFor({ state: 'visible', timeout: 45000 })

    // Invite a second user so the first user is no longer the only owner (required to leave)
    await leftSideMenuPage.openProfileMenu()
    await leftSideMenuPage.inviteToWorkspace()
    await leftSideMenuPage.getInviteLink()
    const linkText = await page.locator('.antiPopup .link').textContent()
    await leftSideMenuPage.clickOnCloseInvite()

    const newUser2: SignUpData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      password: '1234'
    }
    const page2 = await browser.newPage()
    try {
      await page2.goto(linkText ?? '')

      await confirmRegistrationCode(page2, newUser2.email)
      await fillProfileName(page2, newUser2)
      await joinWorkspace(page2, page)
      const leftSideMenuPage2 = new LeftSideMenuPage(page2)
      await leftSideMenuPage2.clickTracker()

      // Second user leaves the workspace
      const userProfilePage2 = new UserProfilePage(page2)
      await userProfilePage2.openProfileMenu()
      await userProfilePage2.selectProfileByName(`${newUser2.lastName} ${newUser2.firstName}`)
      await userProfilePage2.clickLeaveWorkspaceButton()
      await userProfilePage2.clickLeaveWorkspaceCancelButton()
      await userProfilePage2.clickLeaveWorkspaceButton()
      await userProfilePage2.clickLeaveWorkspaceConfirmButton()
      // Leaving on your own is confirmed with an emailed code; the stand uses ADMIN_OTP_DEV_CODE.
      await page2.locator('input[placeholder="Code"]').fill('000000')
      await page2.getByRole('button', { name: 'Confirm', exact: true }).click()
      await expect(page2.locator('form')).toContainText('Select workspace')
      await expect(page2.getByText(newWorkspaceName)).toHaveCount(0)
    } finally {
      await page2.close()
    }
  })
})
