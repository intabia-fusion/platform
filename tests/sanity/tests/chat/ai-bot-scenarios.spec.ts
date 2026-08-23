import { expect, test, type Page } from '@playwright/test'
import { ApiEndpoint } from '../API/Api'
import { DocumentContentPage } from '../model/documents/document-content-page'
import { DocumentsPage } from '../model/documents/documents-page'
import { IssuesPage } from '../model/tracker/issues-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { LoginPage } from '../model/login-page'
import { SelectWorkspacePage } from '../model/select-workspace-page'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { prepareNewIssueWithOpenStep } from '../tracker/common-steps'
import { PlatformURI, generateId, generateTestData } from '../utils'

// Whole-flow assistant scenarios on the `low` level: the prompt scripts the tool call
// (`call:<tool> {json}`, llms/mock.ts), the test asserts what the user gets.

test.describe.configure({ mode: 'parallel' })

// Navigator starts collapsed and holds the project tree. Kept one project: two make the card ask.
const DEFAULT_PROJECT = 'Default'

async function openDefaultProject (page: Page): Promise<void> {
  const projectsGroup = page.locator('#navGroup-tree-projects')
  if (!(await projectsGroup.isVisible())) {
    await page.locator('.topmenu-container button').click()
    await expect(projectsGroup).toBeVisible({ timeout: 15000 })
  }
  await new TrackerNavigationMenuPage(page).openIssuesForProject(DEFAULT_PROJECT)
}

// The conversation is provisioned on click, so an early click leaves the sidebar closed - retry.
async function openAssistant (page: Page): Promise<void> {
  await expect(async () => {
    await page.locator('[data-id="btnDiscussWithAI"]').click()
    await expect(page.locator('#sidebar div.text-editor-view')).toBeVisible({ timeout: 15000 })
  }).toPass({ intervals: [1000, 2000, 3000], timeout: 90000 })
}

/** The assistant thread lives in the chat sidebar, next to whatever object opened it. */
async function sendToAssistant (page: Page, text: string): Promise<void> {
  const input = page.locator('#sidebar div.text-editor-view')
  await expect(input).toBeVisible({ timeout: 30000 })
  await input.fill(text)
  await page.locator('#sidebar g#Send').click()
}

test.describe('ai-bot scenarios', () => {
  let leftSideMenuPage: LeftSideMenuPage
  let loginPage: LoginPage
  let api: ApiEndpoint
  let data: { workspaceName: string, userName: string, firstName: string, lastName: string, channelName: string }

  test.beforeEach(async ({ page, request }) => {
    data = generateTestData()
    leftSideMenuPage = new LeftSideMenuPage(page)
    loginPage = new LoginPage(page)
    api = new ApiEndpoint(request)
    await api.createAccount(data.userName, '1234', data.firstName, data.lastName)
    await api.createWorkspaceWithLogin(data.workspaceName, data.userName, '1234')
    await (await page.goto(`${PlatformURI}`))?.finished()
    await loginPage.login(data.userName, '1234')
    const swp = new SelectWorkspacePage(page)
    await swp.selectWorkspace(data.workspaceName)
  })

  test('assistant button in the issue editor opens a thread and proposes a task', async ({ page }) => {
    const issueTitle = `Issue for assist ${generateId()}`

    await leftSideMenuPage.clickTracker()
    await openDefaultProject(page)
    await prepareNewIssueWithOpenStep(page, {
      title: issueTitle,
      description: 'assistant scenario',
      projectName: DEFAULT_PROJECT
    })

    await openAssistant(page)

    const proposedTitle = `Follow-up ${generateId()}`
    await sendToAssistant(page, `сделай задачу\ncall:propose_task {"title":"${proposedTitle}"}`)

    const card = page.locator('#sidebar .activityMessage', { hasText: 'Julia proposes a task' })
    await expect(card).toBeVisible({ timeout: 60000 })
    await expect(card.locator('input').first()).toHaveValue(proposedTitle, { timeout: 15000 })

    await test.step('Creating from the card produces a real issue', async () => {
      // Hovering a message floats its action bar over the card, so park the pointer first.
      await page.mouse.move(0, 0)
      const createButton = card.getByRole('button', { name: 'Create task' })
      await expect(createButton).toBeEnabled({ timeout: 15000 })
      await createButton.click()
      await expect(card.getByRole('button', { name: 'Task created' })).toBeVisible({ timeout: 60000 })
    })
  })

  test('new context button resets the assistant thread', async ({ page }) => {
    const issueTitle = `Issue for context ${generateId()}`

    await leftSideMenuPage.clickTracker()
    await openDefaultProject(page)
    await prepareNewIssueWithOpenStep(page, {
      title: issueTitle,
      description: 'context reset',
      projectName: DEFAULT_PROJECT
    })

    await openAssistant(page)
    await sendToAssistant(page, 'первое сообщение')
    await expect(page.locator('#sidebar .activityMessage', { hasText: 'первое сообщение' })).toBeVisible({
      timeout: 60000
    })

    // The button only shows up for an AI context root, so its presence is part of the assertion.
    await page.locator('#sidebar [data-id="btnAiNewContext"]').click()
    await page.locator('.popup button[type="submit"]').click()

    // The echo reply quotes the prompt, so there is more than one match to clear - count them.
    await expect(page.locator('#sidebar .activityMessage', { hasText: 'первое сообщение' })).toHaveCount(0, {
      timeout: 60000
    })
  })

  test('proposed document edit lands in the document once applied', async ({ page }) => {
    const documentsPage = new DocumentsPage(page)
    const documentContentPage = new DocumentContentPage(page)
    const teamspace = { title: `Teamspace-${generateId()}`, description: 'ai', autoJoin: true }
    const document = { title: `Document-${generateId()}`, space: teamspace.title }

    await leftSideMenuPage.clickDocuments()
    await documentsPage.checkTeamspaceNotExist(teamspace.title)
    await documentsPage.createNewTeamspace(teamspace)
    await documentsPage.clickOnButtonCreateDocument()
    await documentsPage.createDocument(document)
    await documentsPage.openDocument(document.title)
    await documentContentPage.checkDocumentTitle(document.title)

    await openAssistant(page)

    const body = `Rewritten by the assistant ${generateId()}`
    await sendToAssistant(page, `перепиши документ\ncall:propose_new_document {"markdown":"# Plan\\n\\n${body}"}`)

    const card = page.locator('#sidebar .activityMessage', { hasText: 'Yulia proposes an edit' })
    await expect(card).toBeVisible({ timeout: 60000 })

    await test.step('Apply writes the proposal into the open document', async () => {
      // Apply goes through the open editor, so the document must stay on screen - that is exactly
      // the state under test; with it closed the card offers "Open document" instead.
      await card.getByRole('button', { name: 'Apply', exact: true }).click()
      // Not documentContentPage.inputContent(): the card's diff preview is a tiptap view too, and
      // only the document's own editor is editable.
      const docEditor = page.locator('div.textInput div.tiptap[contenteditable="true"]')
      await expect(docEditor).toContainText(body, { timeout: 60000 })
      await expect(card.getByRole('button', { name: 'Applied' })).toBeVisible({ timeout: 30000 })
    })
  })

  test('assistant panel in the create-issue dialog rewrites the draft', async ({ page }) => {
    const issuesPage = new IssuesPage(page)

    await leftSideMenuPage.clickTracker()
    await openDefaultProject(page)
    await issuesPage.clickButtonCreateNewIssue()

    await page.locator('[data-id="btnIssueAssist"]').click()
    const panel = page.locator('.assist')
    await expect(panel).toBeVisible({ timeout: 30000 })

    const drafted = `Drafted by the assistant ${generateId()}`
    const input = panel.locator('div.text-editor-view')
    await expect(input).toBeVisible({ timeout: 60000 })
    await input.fill(`поправь черновик\ncall:edit_issue_draft {"title":"${drafted}"}`)
    await panel.locator('g#Send').click()

    // The tool only stages the draft; the card's own button is what pushes it into the form.
    const card = panel.locator('.activityMessage', { hasText: 'Julia proposes a task' })
    await expect(card).toBeVisible({ timeout: 60000 })
    await page.mouse.move(0, 0)
    await card.getByRole('button', { name: 'Apply', exact: true }).click()

    await expect(issuesPage.inputPopupCreateNewIssueTitle()).toHaveValue(drafted, { timeout: 30000 })
  })
})
