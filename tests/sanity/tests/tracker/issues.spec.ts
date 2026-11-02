import { expect, test } from '../fixtures'
import { generateId, PlatformSetting, PlatformURI } from '../utils'
import { IssuesPage } from '../model/tracker/issues-page'
import { IssuesDetailsPage } from '../model/tracker/issues-details-page'
import { Issue, NewIssue } from '../model/tracker/types'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { prepareNewIssueWithOpenByApiStep, prepareNewIssueWithOpenStep } from './common-steps'
import { IssueCommentPopup } from '../model/tracker/issue-comment-popup'
import { TEST_ESTIMATIONS } from './tracker.utils'
import { connectTracker, deleteIssuesByTitlePrefix, readStoredCommentCount } from '../API/TrackerApi'
import { retry } from '../retry'

test.use({
  storageState: PlatformSetting
})

test.describe('Tracker issue tests', () => {
  let issuesDetailsPage: IssuesDetailsPage
  let issuesPage: IssuesPage
  let trackerNavigationMenuPage: TrackerNavigationMenuPage
  let issueCommentPopup: IssueCommentPopup

  test.beforeEach(async ({ page }) => {
    issuesDetailsPage = new IssuesDetailsPage(page)
    issuesPage = new IssuesPage(page)
    trackerNavigationMenuPage = new TrackerNavigationMenuPage(page)
    issueCommentPopup = new IssueCommentPopup(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('Create an issue with all parameters and attachments', async ({ page }) => {
    const newIssue: NewIssue = {
      title: `Issue with all parameters and attachments-${generateId()}`,
      description: 'Created issue with all parameters and attachments description',
      projectName: 'Default',
      status: 'In Progress',
      priority: 'Urgent',
      assignee: 'Appleseed John',
      createLabel: true,
      labels: `CREATE-ISSUE-${generateId()}`,
      component: 'No component',
      estimation: '2',
      milestone: 'No Milestone',
      duedate: 'today',
      filePath: 'cat.jpeg'
    }

    await prepareNewIssueWithOpenStep(page, newIssue)
    await issuesDetailsPage.checkIssue(newIssue)
  })

  test('FUSIO-1683: created issue toasts keep their width and show readable titles and actions', async ({ page }) => {
    const prefix = `FUSIO-1683-toast-${generateId()}-`
    const titles = [
      prefix + 'Short',
      prefix + 'Long issue title with spaces '.repeat(5).trimEnd(),
      prefix + 'W'.repeat(160)
    ]
    const widths = new Map<number, number>()
    const viewport = page.viewportSize()
    const timeout = await page.evaluate(() => localStorage.getItem('#platform.notification.timeout'))
    await issuesPage.notificationTimeoutSetting('60000')
    try {
      await issuesPage.linkSidebarAll().click()
      await issuesPage.clickModelSelectorAll()
      for (const title of titles) {
        await page.setViewportSize({ width: 1280, height: 900 })
        await issuesPage.createNewIssue({ title, description: '', projectName: 'Default' }, false)
        const toast = page.locator('.notifyPopup').filter({ has: page.locator('.issue-title', { hasText: title }) })
        await expect(toast).toBeVisible()
        await expect(toast.locator('.issue-title')).toHaveAttribute('title', title)
        await expect(toast.locator('.issue-title')).toHaveText(title)
        await expect(toast.getByRole('button', { name: 'View issue', exact: true })).toBeVisible()
        await expect(toast.getByRole('button', { name: 'Copy issue URL', exact: true })).toBeVisible()
        for (const width of [1280, 360, 320]) {
          await page.setViewportSize({ width, height: 900 })
          await expect(async () => {
            const geometry = await toast.evaluate((node) => {
              const bounds = node.getBoundingClientRect()
              const title = node.querySelector('.issue-title') as HTMLElement
              const titleStyle = getComputedStyle(title)
              const measuredLineHeight = parseFloat(titleStyle.lineHeight)
              const lineHeight = Number.isNaN(measuredLineHeight)
                ? parseFloat(titleStyle.fontSize) * 1.5
                : measuredLineHeight
              return {
                width: bounds.width,
                left: bounds.left,
                right: bounds.right,
                inside: bounds.left >= 0 && bounds.right <= window.innerWidth,
                titleHeight: title.getBoundingClientRect().height,
                lineHeight,
                actions: [...node.querySelectorAll('.buttons button')].every((button) => {
                  const rect = button.getBoundingClientRect()
                  const label = button.querySelector('.label') as HTMLElement
                  return (
                    rect.width > 0 &&
                    rect.left >= bounds.left &&
                    rect.right <= bounds.right &&
                    button.scrollWidth <= button.clientWidth &&
                    label.scrollWidth <= label.clientWidth
                  )
                })
              }
            })
            expect(geometry.inside, JSON.stringify({ width, geometry })).toBe(true)
            expect(geometry.actions).toBe(true)
            expect(geometry.titleHeight).toBeLessThanOrEqual(geometry.lineHeight * 2 + 1)
            if (title !== titles[0]) expect(geometry.titleHeight).toBeGreaterThan(geometry.lineHeight)
            if (widths.has(width)) expect(geometry.width).toBeCloseTo(widths.get(width) as number, 0)
            else widths.set(width, geometry.width)
          }).toPass()
        }
        await toast.locator('[data-id="btnNotifyClose"]').click()
        await expect(toast).toHaveCount(0)
      }
    } finally {
      await page.evaluate((timeout) => {
        if (timeout === null) localStorage.removeItem('#platform.notification.timeout')
        else localStorage.setItem('#platform.notification.timeout', timeout)
      }, timeout)
      if (viewport !== null) await page.setViewportSize(viewport)
      const { client } = await connectTracker()
      try {
        await deleteIssuesByTitlePrefix(client, prefix)
      } finally {
        await client.close()
      }
    }
  })

  test('Edit an issue', async ({ page }) => {
    const newIssue: NewIssue = {
      title: `Issue with all parameters and attachments-${generateId()}`,
      description: 'Created issue with all parameters and attachments description',
      projectName: 'Default'
    }
    const editIssue: Issue = {
      status: 'Done',
      priority: 'High',
      createLabel: true,
      labels: `EDIT-ISSUE-${generateId()}`,
      component: 'No component',
      estimation: '8',
      milestone: 'Milestone',
      duedate: 'today'
    }
    await prepareNewIssueWithOpenByApiStep(page, newIssue)

    await issuesDetailsPage.editIssue(editIssue)

    await issuesDetailsPage.checkIssue({
      ...newIssue,
      ...editIssue
    })

    for (const input of TEST_ESTIMATIONS) {
      await issuesDetailsPage.editIssue({
        estimation: input
      })
      await issuesDetailsPage.checkIssue({
        ...newIssue,
        ...editIssue,
        estimation: input
      })
    }
  })

  test.skip('Set parent issue', async ({ page }) => {
    const parentIssue: NewIssue = {
      title: `PARENT ISSUE-${generateId(2)}`,
      description: 'Created issue to be parent issue',
      projectName: 'Default'
    }

    await issuesPage.clickModelSelectorAll()
    await issuesPage.createNewIssue(parentIssue)

    await test.step('Set parent issue during creation', async () => {
      const newIssue: NewIssue = {
        title: `Set parent issue during creation-${generateId(2)}`,
        description: 'Set parent issue during creation',
        parentIssue: parentIssue.title,
        projectName: 'Default'
      }

      await issuesPage.clickModelSelectorAll()
      await issuesPage.createNewIssue(newIssue)
      await issuesPage.searchIssueByName(newIssue.title)

      await issuesPage.checkParentIssue(newIssue.title, parentIssue.title)
      await issuesPage.openIssueByName(newIssue.title)
      await issuesDetailsPage.checkIssue({
        ...newIssue,
        parentIssue: parentIssue.title
      })

      await trackerNavigationMenuPage.openIssuesForProject('Default')
    })

    await test.step('Set parent issue from issues page', async () => {
      const newIssue: NewIssue = {
        title: `Set parent issue from issues page-${generateId(2)}`,
        description: 'Set parent issue from issues page',
        projectName: 'Default'
      }
      await issuesPage.clickModelSelectorAll()
      await issuesPage.createNewIssue(newIssue)
      await issuesPage.searchIssueByName(newIssue.title)

      await issuesPage.doActionOnIssue(newIssue.title, 'Set parent issue…')
      await issuesPage.selectMenuItem(page, parentIssue.title, true)

      await issuesPage.searchIssueByName(newIssue.title)
      await issuesPage.checkParentIssue(newIssue.title, parentIssue.title)

      await issuesPage.openIssueByName(newIssue.title)
      await issuesDetailsPage.checkIssue({
        ...newIssue,
        parentIssue: parentIssue.title
      })
      await trackerNavigationMenuPage.openIssuesForProject('Default')
    })

    await test.step('Set parent issue from issue details page', async () => {
      const newIssue: NewIssue = {
        title: `Set parent issue from issue details page-${generateId(2)}`,
        description: 'Set parent issue from issue details page',
        projectName: 'Default'
      }
      await issuesPage.clickModelSelectorAll()
      await issuesPage.createNewIssue(newIssue)
      await issuesPage.searchIssueByName(newIssue.title)
      await issuesPage.openIssueByName(newIssue.title)
      await issuesDetailsPage.moreActionOnIssue('Set parent issue…')
      await issuesPage.selectMenuItem(page, parentIssue.title, true)
      await issuesDetailsPage.checkIssue({
        ...newIssue,
        parentIssue: parentIssue.title
      })
      await trackerNavigationMenuPage.openIssuesForProject('Default')
      await issuesPage.checkParentIssue(newIssue.title, parentIssue.title)
    })
  })

  test('Move to project', async ({ page }) => {
    const secondProjectName = 'Second Project'
    const moveIssue: NewIssue = {
      title: `Issue to another project-${generateId()}`,
      description: 'Issue to move to another project',
      projectName: 'Default'
    }
    await prepareNewIssueWithOpenByApiStep(page, moveIssue)
    await issuesDetailsPage.moreActionOnIssue('Move to project')
    await issuesDetailsPage.fillMoveIssuesModal(secondProjectName, true)
    await trackerNavigationMenuPage.openIssuesForProject(secondProjectName)
    await issuesPage.openIssueByName(moveIssue.title)
    await issuesDetailsPage.checkIssue({
      ...moveIssue
    })

    await trackerNavigationMenuPage.openIssuesForProject('Default')
  })

  test('Comment stored after reload the page', async ({ page }) => {
    const commentText = `Comment should be stored after reload-${generateId()}`
    const commentIssue: NewIssue = {
      title: `Issue for stored comment-${generateId()}`,
      description: 'Issue for comment stored after reload the page',
      projectName: 'Default'
    }
    await prepareNewIssueWithOpenByApiStep(page, commentIssue)

    const issuesDetailsPage = new IssuesDetailsPage(page)
    await issuesDetailsPage.waitDetailsOpened(commentIssue.title)
    await issuesDetailsPage.addComment(commentText)
    await issuesDetailsPage.checkCommentExist(commentText)

    // The shown comment is the optimistic render: a reload before the send lands wipes it.
    await retry(async () => {
      expect(await readStoredCommentCount(commentIssue.title)).toBeGreaterThanOrEqual(1)
    })

    await page.reload()
    await issuesDetailsPage.waitDetailsOpened(commentIssue.title)
    await issuesDetailsPage.checkCommentExist(commentText)
  })

  test('Create an Issue from template', async ({ page }) => {
    const templateName = 'New Issue'
    const newIssue: NewIssue = {
      title: `New Issue-${generateId(4)}`,
      description: 'New Issue',
      priority: 'Medium',
      estimation: '8',
      component: 'Default component',
      milestone: 'Edit Milestone',
      projectName: 'Default'
    }
    await issuesPage.clickModelSelectorAll()
    await issuesPage.buttonCreateNewIssue().click()
    await issuesPage.selectTemplate(templateName)
    await expect(issuesPage.buttonPopupCreateNewIssueTemplate()).toHaveText(templateName)
    await issuesPage.fillNewIssueForm({ description: newIssue.description, title: newIssue.title })
    await issuesPage.clickButtonCreateIssue()

    await issuesPage.searchIssueByName(newIssue.title)
    await issuesPage.openIssueByName(newIssue.title)
    await issuesDetailsPage.checkIssue(newIssue)
  })

  test('Delete an issue', async ({ page }) => {
    const deleteIssue: NewIssue = {
      title: `Issue-to-delete-${generateId(4)}`,
      description: 'Description Issue for deletion',
      projectName: 'Default'
    }
    await prepareNewIssueWithOpenByApiStep(page, deleteIssue)
    // prepareNewIssueWithOpenByApiStep already opens the issue - re-navigating via navigateToIssues()
    // ('text="Issues"') can land on another project's sidebar node and never find this row.
    await issuesDetailsPage.waitDetailsOpened(deleteIssue.title)
    await issuesDetailsPage.moreActionOnIssue('Delete')
    await issuesDetailsPage.pressYesForPopup(page)
    await issuesPage.searchIssueByName(deleteIssue.title)
    await issuesPage.checkIssueNotExist(deleteIssue.title)
  })

  test('Check the changed description activity', async ({ page }) => {
    const additionalDescription = 'New row for the additional description'
    const changedDescriptionIssue: NewIssue = {
      title: `Check the changed description activity-${generateId()}`,
      description: 'Check the changed description activity description',
      projectName: 'Default'
    }
    await prepareNewIssueWithOpenByApiStep(page, changedDescriptionIssue)
    await issuesDetailsPage.waitDetailsOpened(changedDescriptionIssue.title)
    await issuesDetailsPage.checkIssue(changedDescriptionIssue)
    await issuesDetailsPage.addToDescription(additionalDescription)
    await issuesDetailsPage.openShowMoreLink('changed description')
    await issuesDetailsPage.checkComparingTextAdded(additionalDescription)
  })

  test('Add comment with image attachment', async ({ page }) => {
    const commentImageIssue: NewIssue = {
      title: `Add comment with image attachment-${generateId()}`,
      description: 'Add comment with image attachment',
      projectName: 'Default'
    }
    await prepareNewIssueWithOpenByApiStep(page, commentImageIssue)
    await issuesDetailsPage.waitDetailsOpened(commentImageIssue.title)
    await issuesDetailsPage.addCommentWithImage('Added comment with atttachment', 'cat3.jpeg')
    await issuesDetailsPage.checkCommentWithImageExist('', 'cat3.jpeg')
    await issuesDetailsPage.checkCommentExist('Added comment with atttachment')
  })

  test('Add comment by popup', async ({ page }) => {
    const commentInside = `Comment for the inside issue-${generateId()}`
    const commentPopup = `Comment for the popup-${generateId()}`
    const commentIssue: NewIssue = {
      title: `Issue for add comment by popup-${generateId()}`,
      description: 'Issue for add comment by popup',
      projectName: 'Default'
    }
    await prepareNewIssueWithOpenByApiStep(page, commentIssue)
    await issuesDetailsPage.waitDetailsOpened(commentIssue.title)
    await issuesDetailsPage.addComment(commentInside)
    await issuesDetailsPage.checkCommentExist(commentInside)
    await issuesPage.linkSidebarAll().click()
    await issuesPage.clickModelSelectorAll()
    await issuesPage.searchIssueByName(commentIssue.title)
    await issuesPage.checkCommentsCount(commentIssue.title, '1')
    await issueCommentPopup.addCommentInPopup(commentIssue.title, commentPopup, 'cat2.jpeg')
    await issueCommentPopup.checkCommentWithImageExist('', 'cat2.jpeg')
    await issueCommentPopup.checkCommentExist(commentPopup)
    await issuesPage.closePopups()
    await issuesPage.clickModelSelectorAll()
    await issuesPage.searchIssueByName(commentIssue.title)
    await issuesPage.checkCommentsCount(commentIssue.title, '2')
  })

  test('Set status and priority via context menu submenu', async ({ page }) => {
    const newIssue: NewIssue = {
      title: `Context menu submenu-${generateId()}`,
      description: 'Set status and priority via context menu submenu',
      projectName: 'Default'
    }
    await issuesPage.linkSidebarAll().click()
    await issuesPage.clickModelSelectorAll()
    await issuesPage.createNewIssue(newIssue)
    await issuesPage.searchIssueByName(newIssue.title)

    await test.step('Set status from context menu submenu', async () => {
      await issuesPage.openSubmenuOnIssue(newIssue.title, 'Status')
      await issuesPage.selectMenuItem(page, 'In Progress')
      // Submenu popup must not reopen after selection
      await page.waitForTimeout(500)
      await expect(page.locator('div.selectPopup')).toHaveCount(0)
      await expect(page.locator('div.antiPopup')).toHaveCount(0)
    })

    await test.step('Set priority from context menu submenu', async () => {
      await issuesPage.openSubmenuOnIssue(newIssue.title, 'Priority')
      await issuesPage.selectMenuItem(page, 'Urgent')
      await page.waitForTimeout(500)
      await expect(page.locator('div.selectPopup')).toHaveCount(0)
      await expect(page.locator('div.antiPopup')).toHaveCount(0)
    })

    await issuesPage.openIssueByName(newIssue.title)
    await issuesDetailsPage.checkIssue({ ...newIssue, status: 'In Progress', priority: 'Urgent' })
  })
})
