import { test, expect } from '../fixtures'
import { generateId, PlatformSetting, PlatformURI } from '../utils'
import { retryIntervals } from '../retry'
import { PlanningPage } from '../model/planning/planning-page'
import { NewToDo } from '../model/planning/types'
import { PlanningNavigationMenuPage } from '../model/planning/planning-navigation-menu-page'
import { IssuesPage } from '../model/tracker/issues-page'
import { IssuesDetailsPage } from '../model/tracker/issues-details-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { DocumentsPage } from '../model/documents/documents-page'
import { DocumentContentPage } from '../model/documents/document-content-page'

test.use({
  storageState: PlatformSetting
})

const retryOptions = { intervals: retryIntervals, timeout: 60000 }

test.describe('Planning ToDo tests', () => {
  let issuesPage: IssuesPage
  let issuesDetailsPage: IssuesDetailsPage
  let leftSideMenuPage: LeftSideMenuPage
  let documentsPage: DocumentsPage
  let documentContentPage: DocumentContentPage

  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/time`))?.finished()
  })

  test('New ToDo and checking notifications about unplanned tasks', async ({ page }) => {
    const dateEnd = new Date()
    dateEnd.setDate(dateEnd.getDate() + 1)

    const newToDo: NewToDo = {
      title: `ToDo with all parameters-${generateId()}`,
      description: 'Created todo with all parameters and attachments description',
      duedate: 'today',
      priority: 'High',
      visible: 'Visible to everyone',
      createLabel: true,
      labels: `CREATE-TODO-${generateId()}`,
      slots: [
        {
          dateStart: 'today',
          timeStart: '1130',
          dateEnd: {
            day: dateEnd.getDate().toString(),
            month: (dateEnd.getMonth() + 1).toString(),
            year: dateEnd.getFullYear().toString()
          },
          timeEnd: '1830'
        }
      ]
    }

    const planningPage = new PlanningPage(page)
    const planningNavigationMenuPage = new PlanningNavigationMenuPage(page)
    await planningNavigationMenuPage.clickOnButtonUnplanned()
    await expect(async () => {
      await planningNavigationMenuPage.compareCountersUnplannedToDos()
    }).toPass(retryOptions)
    await planningPage.createNewToDo(newToDo)
    await expect(async () => {
      await planningNavigationMenuPage.compareCountersUnplannedToDos()
    }).toPass(retryOptions)
    await planningNavigationMenuPage.clickOnButtonToDoAll()

    await planningPage.checkToDoExist(newToDo.title)
    await planningPage.openToDoByName(newToDo.title)
  })

  test('Edit a ToDo', async ({ page }) => {
    const dateEnd = new Date()
    const editToDo: NewToDo = {
      title: 'ToDo For Edit',
      description: 'For Edit todo',
      duedate: 'today',
      priority: 'Medium',
      visible: 'FreeBusy',
      createLabel: true,
      labels: `EDIT-TODO-${generateId()}`,
      slots: [
        {
          dateStart: 'today',
          timeStart: '1530',
          dateEnd: {
            day: dateEnd.getDate().toString(),
            month: (dateEnd.getMonth() + 1).toString(),
            year: dateEnd.getFullYear().toString()
          },
          timeEnd: '1830'
        }
      ]
    }

    const planningNavigationMenuPage = new PlanningNavigationMenuPage(page)
    await planningNavigationMenuPage.clickOnButtonToDoAll()

    const planningPage = new PlanningPage(page)
    await planningPage.openToDoByName(editToDo.title)
    await planningPage.updateToDo(editToDo)
    await planningPage.clickButtonCardClose()

    await planningPage.openToDoByName(editToDo.title)
    await planningPage.checkToDo({
      ...editToDo,
      priority: 'medium',
      duedate: `${dateEnd.getMonth() + 1}/${dateEnd.getDate()}/${dateEnd.getFullYear()}`,
      slots: [
        {
          dateStart: '',
          timeStart: '15 : 30',
          dateEnd: {
            day: dateEnd.getDate().toString(),
            month: (dateEnd.getMonth() + 1).toString(),
            year: dateEnd.getFullYear().toString()
          },
          timeEnd: '18 : 30'
        }
      ]
    })
  })

  test('Delete a ToDo', async ({ page }) => {
    // Created here on purpose: the test destroys it, so seeded data would only survive one run.
    const deleteToDo: NewToDo = {
      title: `ToDo For delete-${generateId()}`
    }

    const planningNavigationMenuPage = new PlanningNavigationMenuPage(page)
    await planningNavigationMenuPage.clickOnButtonToDoAll()

    const planningPage = new PlanningPage(page)
    await planningPage.createNewToDo(deleteToDo)
    await planningPage.deleteToDoByName(deleteToDo.title)
    await planningPage.checkToDoNotExist(deleteToDo.title)
  })

  test.skip('Unplanned / Planned ToDo', async ({ page }) => {
    const newToDoPlanned: NewToDo = {
      title: 'ToDo Planned'
    }
    const newToDoUnPlanned: NewToDo = {
      title: 'ToDo UnPlanned'
    }

    const planningPage = new PlanningPage(page)

    const planningNavigationMenuPage = new PlanningNavigationMenuPage(page)
    await planningNavigationMenuPage.clickOnButtonToDoAll()
    await planningPage.checkToDoExist(newToDoPlanned.title)
    await planningPage.checkToDoExist(newToDoUnPlanned.title)

    await planningNavigationMenuPage.clickOnButtonUnplanned()
    await planningPage.selectToDoByName(newToDoPlanned.title)

    await planningPage.checkToDoNotExist(newToDoPlanned.title)
    await planningPage.checkToDoExist(newToDoUnPlanned.title)

    await planningNavigationMenuPage.clickOnButtonToDoPlanned()
    await planningPage.checkToDoNotExist(newToDoUnPlanned.title)
    await planningPage.checkToDoExist(newToDoPlanned.title)

    await planningNavigationMenuPage.clickOnButtonToDoAll()
    await planningPage.checkToDoExist(newToDoPlanned.title)
    await planningPage.checkToDoExist(newToDoUnPlanned.title)
  })

  test('Show ActionItem in Planner from Issue description', async ({ page }) => {
    issuesPage = new IssuesPage(page)
    issuesDetailsPage = new IssuesDetailsPage(page)
    leftSideMenuPage = new LeftSideMenuPage(page)
    const planningNavigationMenuPage = new PlanningNavigationMenuPage(page)
    const planningPage = new PlanningPage(page)
    const toDoName = `ToDo from issue ${generateId()}`

    const newIssue = {
      title: `Issue with ToDos ${generateId()}`,
      description: '',
      projectName: 'Default'
    }

    await test.step('Prepare Issue and add ActionItems to that', async () => {
      await leftSideMenuPage.clickTracker()
      await issuesPage.clickNewIssue()
      await issuesPage.fillNewIssueForm(newIssue)
      await issuesPage.clickButtonCreateIssue()
      await issuesPage.clickLinkSidebarAll()
      await issuesPage.searchIssueByName(newIssue.title)
      await issuesPage.openIssueByName(newIssue.title)
      await issuesDetailsPage.editIssue({ assignee: 'Appleseed John', status: 'ToDo' })

      await issuesDetailsPage.addToDescription('/')
      await issuesDetailsPage.slashActionItemsPopup().getByText('Action item').click()
      await issuesPage.page.keyboard.type(toDoName)
      await issuesPage.page.keyboard.press('Escape')
      await issuesDetailsPage.assignToDo('Appleseed John', toDoName)
    })

    await test.step('Check ToDo in Planner', async () => {
      await leftSideMenuPage.clickPlanner()
      await planningNavigationMenuPage.clickOnButtonToDoAll()
      await planningPage.checkToDoExist(toDoName)
      await planningPage.checkIfReferenceIsOpen(toDoName)
    })
  })

  test('A work slot planned ahead is reported as planned time on the issue', async ({ page }) => {
    issuesPage = new IssuesPage(page)
    leftSideMenuPage = new LeftSideMenuPage(page)
    const planningNavigationMenuPage = new PlanningNavigationMenuPage(page)
    const planningPage = new PlanningPage(page)

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const issueTitle = `Issue planned ahead ${generateId()}`

    await test.step('Self-assign an issue to get an Action Item', async () => {
      await leftSideMenuPage.clickTracker()
      await issuesPage.clickLinkSidebarAll()
      await issuesPage.clickModelSelectorAll()
      await issuesPage.createNewIssue({
        title: issueTitle,
        description: 'Planned time test',
        projectName: 'Default',
        status: 'Todo',
        assignee: 'Appleseed John'
      })
    })

    await test.step('Book a slot for tomorrow', async () => {
      await leftSideMenuPage.clickPlanner()
      await planningNavigationMenuPage.clickOnButtonToDoAll()
      await planningPage.checkToDoExist(issueTitle)
      await planningPage.openToDoByName(issueTitle)
      await planningPage.clickButtonCreateAddSlot()
      await planningPage.setTimeSlot(0, {
        dateStart: `${tomorrow.getDate()}`,
        timeStart: '1300',
        dateEnd: {
          day: tomorrow.getDate().toString(),
          month: (tomorrow.getMonth() + 1).toString(),
          year: tomorrow.getFullYear().toString()
        },
        timeEnd: '1400'
      })
      await planningPage.clickButtonCardClose()
    })

    await test.step('The issue shows the slot as planned, not as spent', async () => {
      await leftSideMenuPage.clickTracker()
      await issuesPage.clickLinkSidebarAll()
      await issuesPage.searchIssueByName(issueTitle)
      await issuesPage.openIssueByName(issueTitle)
      await issuesPage.verifyPlannedTime('1h')
    })
  })

  test('Closing an issue offers to close its Action Item', async ({ page }) => {
    issuesPage = new IssuesPage(page)
    issuesDetailsPage = new IssuesDetailsPage(page)
    leftSideMenuPage = new LeftSideMenuPage(page)
    const planningNavigationMenuPage = new PlanningNavigationMenuPage(page)
    const planningPage = new PlanningPage(page)

    const newIssue = {
      title: `Issue closed with an Action Item ${generateId()}`,
      description: '',
      projectName: 'Default'
    }

    await test.step('Assign the issue so that an Action Item appears', async () => {
      await leftSideMenuPage.clickTracker()
      await issuesPage.clickNewIssue()
      await issuesPage.fillNewIssueForm(newIssue)
      await issuesPage.clickButtonCreateIssue()
      await issuesPage.clickLinkSidebarAll()
      await issuesPage.searchIssueByName(newIssue.title)
      await issuesPage.openIssueByName(newIssue.title)
      await issuesDetailsPage.editIssue({ assignee: 'Appleseed John', status: 'ToDo' })

      await leftSideMenuPage.clickPlanner()
      await planningNavigationMenuPage.clickOnButtonToDoAll()
      await planningPage.checkToDoExist(newIssue.title)
    })

    await test.step('Close the issue and confirm the dialog', async () => {
      await leftSideMenuPage.clickTracker()
      await issuesPage.clickLinkSidebarAll()
      await issuesPage.searchIssueByName(newIssue.title)
      await issuesPage.openIssueByName(newIssue.title)
      await issuesDetailsPage.editIssue({ status: 'Done' })

      const dialog = page.locator('div.msgbox-container')
      await expect(dialog).toBeVisible(retryOptions)
      await dialog.locator('button').first().click()
      await expect(dialog).not.toBeVisible({ timeout: 15000 })
    })

    await test.step('Action Item is closed, not deleted', async () => {
      await leftSideMenuPage.clickPlanner()
      await planningNavigationMenuPage.clickOnButtonToDoAll()
      await planningPage.checkToDoIsDone(newIssue.title)
    })
  })

  test('Show ActionItem in Planner from Document', async ({ page }) => {
    documentsPage = new DocumentsPage(page)
    documentContentPage = new DocumentContentPage(page)
    leftSideMenuPage = new LeftSideMenuPage(page)
    const planningNavigationMenuPage = new PlanningNavigationMenuPage(page)
    const planningPage = new PlanningPage(page)
    const toDoName = `ToDo from document ${generateId()}`

    const newDocument = {
      title: `Document with ToDos ${generateId()}`,
      space: 'Default'
    }

    await test.step('Prepare Document and add ActionItems to that', async () => {
      await leftSideMenuPage.clickDocuments()
      await documentsPage.buttonCreateDocument().click()
      await documentsPage.createDocument(newDocument)
      await documentsPage.openDocument(newDocument.title)
      await documentContentPage.addContentToTheNewLine('/')

      await documentContentPage.slashActionItemsPopup().getByText('Action item').click()
      await documentContentPage.addContentToTheNewLine('[] ' + toDoName)
      await documentContentPage.checkContent(toDoName)
      await documentContentPage.assignToDo('Appleseed John', toDoName)
    })

    await test.step('Check ToDo in Planner', async () => {
      await leftSideMenuPage.clickPlanner()
      await planningNavigationMenuPage.clickOnButtonToDoAll()
      await planningPage.checkToDoExist(toDoName)
      await planningPage.checkIfReferenceIsOpen(toDoName)
    })
  })
})
