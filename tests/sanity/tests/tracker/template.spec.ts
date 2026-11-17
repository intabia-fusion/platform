import { expect, test } from '../fixtures'
import core, { generateId as generateDocumentId } from '@hcengineering/core'
import task, { type ProjectType } from '@hcengineering/task'
import type { Project } from '@hcengineering/tracker'
import { generateId, PlatformSetting, PlatformURI } from '../utils'
import { Issue, NewIssue } from '../model/tracker/types'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { TemplatePage } from '../model/tracker/templates-page'
import { TemplateDetailsPage } from '../model/tracker/template-details-page'
import { TEST_ESTIMATIONS } from './tracker.utils'
import tracker from '@hcengineering/tracker'
import { connectTracker, getProjectContext } from '../API/TrackerApi'

test.use({
  storageState: PlatformSetting
})

test.describe('Tracker template tests', () => {
  let trackerNavigationMenuPage: TrackerNavigationMenuPage
  let templatePage: TemplatePage
  let templateDetailsPage: TemplateDetailsPage

  // Nothing removes the templates these tests create, and the assignee group is virtualised - past
  // forty rows the freshly created one never renders.
  test.beforeAll(async () => {
    const { client } = await connectTracker()
    const stale = (await client.findAll(tracker.class.IssueTemplate, {})).filter((it) =>
      /^Template (with all parameters|for edit|for delete)-/.test(it.title)
    )
    for (const template of stale) {
      await client.remove(template)
    }
  })

  test.beforeEach(async ({ page }) => {
    trackerNavigationMenuPage = new TrackerNavigationMenuPage(page)
    templatePage = new TemplatePage(page)
    templateDetailsPage = new TemplateDetailsPage(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('Create a Template', async () => {
    const newTemplate: NewIssue = {
      title: `Template with all parameters-${generateId()}`,
      description: 'Created template with all parameters',
      priority: 'Urgent',
      assignee: 'Dirak Kainin',
      createLabel: true,
      labels: `CREATE-TEMPLATE-${generateId()}`,
      component: 'No component',
      estimation: '2',
      milestone: 'No Milestone'
    }

    await trackerNavigationMenuPage.openTemplateForProject('Default')
    await templatePage.createNewTemplate(newTemplate)
    await templatePage.openTemplate(newTemplate.title)
    await templateDetailsPage.checkTemplate(newTemplate)
  })

  test('Switching to a project without task types clears the template task type', async ({ page }) => {
    const { client } = await connectTracker()
    const projectId = generateDocumentId<Project>()
    const projectTypeId = generateDocumentId<ProjectType>()
    const title = `Template project switch-${generateId()}`
    const projectName = `No task types-${generateId()}`
    try {
      const { project } = await getProjectContext(client)
      const sourceType = await client.findOne(task.class.ProjectType, { _id: project.type })
      if (sourceType === undefined) throw new Error(`Project type ${project.type} not found`)
      await client.createDoc(
        task.class.ProjectType,
        sourceType.space,
        {
          name: projectName,
          description: '',
          descriptor: sourceType.descriptor,
          targetClass: sourceType.targetClass,
          roles: 0,
          tasks: [],
          statuses: [],
          classic: sourceType.classic
        },
        projectTypeId
      )
      await client.createDoc(
        tracker.class.Project,
        core.space.Space,
        {
          name: projectName,
          description: '',
          private: false,
          archived: false,
          members: project.members,
          type: projectTypeId,
          identifier: `NT${generateId(6)}`,
          sequence: 0,
          defaultTimeReportDay: project.defaultTimeReportDay
        },
        projectId
      )
      await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/all-templates`)
      await templatePage.buttonNewTemplate().click()
      const selector = page.locator('form[id$="NewProcess"] [id="space.selector"]')
      await selector.click()
      await templatePage.selectMenuItem(page, project.name)
      await expect(selector).toContainText(project.name)
      await templatePage.inputIssueTitle().fill(title)
      await expect(templatePage.buttonSaveTemplate()).toBeEnabled()
      await selector.click()
      await templatePage.selectMenuItem(page, projectName)
      await expect(selector).toContainText(projectName)
      await templatePage.buttonSaveTemplate().click()
      await expect
        .poll(async () => {
          const template = await client.findOne(tracker.class.IssueTemplate, { title })
          return template === undefined ? undefined : { space: template.space, kind: template.kind }
        })
        .toEqual({ space: projectId, kind: undefined })
    } finally {
      try {
        for (const template of await client.findAll(tracker.class.IssueTemplate, { title })) {
          await client.remove(template)
        }
        const project = await client.findOne(tracker.class.Project, { _id: projectId })
        if (project !== undefined) await client.remove(project)
        const projectType = await client.findOne(task.class.ProjectType, { _id: projectTypeId })
        if (projectType !== undefined) await client.remove(projectType)
      } finally {
        await client.close()
      }
    }
  })

  test('Edit a Template', async ({ page }) => {
    const newTemplate: NewIssue = {
      title: `Template for edit-${generateId()}`,
      description: 'Created template for edit'
    }

    const editTemplate: Issue = {
      priority: 'High',
      assignee: 'Dirak Kainin',
      createLabel: true,
      labels: `EDIT-TEMPLATE-${generateId()}`,
      component: 'No component',
      estimation: '8',
      duedate: 'today'
    }
    await trackerNavigationMenuPage.openTemplateForProject('Default')
    await templatePage.createNewTemplate(newTemplate)
    await templatePage.openTemplate(newTemplate.title)
    await templateDetailsPage.editTemplate(editTemplate)
    await templateDetailsPage.checkTemplate({
      ...newTemplate,
      ...editTemplate
    })

    await templateDetailsPage.checkActivityContent(`New template: ${newTemplate.title}`)

    for (const input of TEST_ESTIMATIONS) {
      await templateDetailsPage.editTemplate({
        estimation: input
      })
      await templateDetailsPage.checkTemplate({
        ...newTemplate,
        ...editTemplate,
        estimation: input
      })
    }
  })

  test('Delete a Template', async () => {
    const deleteTemplate: NewIssue = {
      title: `Template for delete-${generateId()}`,
      description: 'Created template for delete'
    }
    await trackerNavigationMenuPage.openTemplateForProject('Default')
    await templatePage.createNewTemplate(deleteTemplate)
    await templatePage.openTemplate(deleteTemplate.title)
    await templateDetailsPage.deleteTemplate()
    await templatePage.checkTemplateNotExist(deleteTemplate.title)
  })
})
