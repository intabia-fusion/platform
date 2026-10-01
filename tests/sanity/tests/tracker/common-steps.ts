import { expect, Page, test } from '@playwright/test'
import { createIssueWithDescription } from '../API/TrackerApi'
import { IssuesPage } from '../model/tracker/issues-page'
import { NewIssue } from '../model/tracker/types'
import { faker } from '@faker-js/faker'

export async function prepareNewIssueStep (page: Page, issue: NewIssue): Promise<string> {
  return await test.step('Prepare document', async () => {
    const issuesPage = new IssuesPage(page)
    await issuesPage.clickModelSelectorAll()

    await issuesPage.createNewIssue(issue)
    await issuesPage.searchIssueByName(issue.title)
    return await issuesPage.getIssueId(issue.title)
  })
}

export async function prepareNewIssueWithOpenStep (
  page: Page,
  issue: NewIssue,
  search: boolean = true
): Promise<string> {
  return await test.step('Prepare Issue', async () => {
    const issuesPage = new IssuesPage(page)
    await issuesPage.linkSidebarAll().click()
    await issuesPage.clickModelSelectorAll()
    await issuesPage.createNewIssue(issue)
    if (search) {
      await issuesPage.searchIssueByName(issue.title)
    }
    await issuesPage.openIssueByName(issue.title)
    return await issuesPage.getIssueId(issue.title)
  })
}

// For a test that needs the issue only as a fixture: it is written through the API (Backlog, description
// only), so the form and the fields it sets are not exercised. Waits until the list shows the row.
async function createIssueByApiAndFind (issuesPage: IssuesPage, issue: NewIssue): Promise<void> {
  await createIssueWithDescription(issue.title, issue.description, issue.projectName)
  await issuesPage.searchIssueByName(issue.title)
  await expect(issuesPage.issueIdLocator(issue.title).first()).toBeVisible({ timeout: 15000 })
}

export async function prepareNewIssueByApiStep (page: Page, issue: NewIssue): Promise<string> {
  return await test.step('Prepare Issue (API)', async () => {
    const issuesPage = new IssuesPage(page)
    await issuesPage.clickModelSelectorAll()
    await createIssueByApiAndFind(issuesPage, issue)
    return await issuesPage.getIssueId(issue.title)
  })
}

export async function prepareNewIssueWithOpenByApiStep (page: Page, issue: NewIssue): Promise<string> {
  return await test.step('Prepare Issue (API)', async () => {
    const issuesPage = new IssuesPage(page)
    await issuesPage.linkSidebarAll().click()
    await issuesPage.clickModelSelectorAll()
    await createIssueByApiAndFind(issuesPage, issue)
    await issuesPage.openIssueByName(issue.title)
    return await issuesPage.getIssueId(issue.title)
  })
}

export function createNewIssueData (firstName: string, lastName: string, replace?: object): NewIssue {
  return {
    title: faker.lorem.words(3),
    description: faker.lorem.sentence(),
    status: 'In Progress',
    priority: 'Urgent',
    assignee: `${lastName} ${firstName}`,
    createLabel: true,
    labels: faker.lorem.words(1),
    component: 'No component',
    estimation: '2',
    milestone: 'No Milestone',
    duedate: 'today',
    filePath: 'cat.jpeg',
    ...replace
  }
}
