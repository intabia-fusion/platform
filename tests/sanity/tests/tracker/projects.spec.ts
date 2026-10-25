import { expect, test } from '../fixtures'
import { PlatformSetting, PlatformURI } from '../utils'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { NewProjectPage } from '../model/tracker/new-project-page'
import { NewProject } from '../model/tracker/types'
import { ProjectSettingsPage } from '../model/tracker/project-settings-page'
import { AllProjectsPage } from '../model/tracker/all-projects-page'
import { generateProjectId } from './tracker.utils'
import { TemplatePage } from '../model/tracker/templates-page'
import { connectTracker, findProjectByName } from '../API/TrackerApi'
import tracker, { IssuePriority } from '@hcengineering/tracker'

test.use({
  storageState: PlatformSetting
})

test.describe('Tracker Projects tests', () => {
  let trackerNavigationMenuPage: TrackerNavigationMenuPage
  let newProjectPage: NewProjectPage
  let projectSettingsPage: ProjectSettingsPage
  let allProjectsPage: AllProjectsPage

  test.beforeEach(async ({ page }) => {
    trackerNavigationMenuPage = new TrackerNavigationMenuPage(page)
    newProjectPage = new NewProjectPage(page)
    projectSettingsPage = new ProjectSettingsPage(page)
    allProjectsPage = new AllProjectsPage(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('User can create project', async () => {
    const projectId = generateProjectId()
    const newProjectData: NewProject = {
      title: `NewProject-${projectId}`,
      identifier: projectId,
      description: 'New Project description',
      private: true,
      defaultAssigneeForIssues: 'Dirak Kainin',
      defaultIssueStatus: 'In Progress'
    }

    await test.step('User create project', async () => {
      await trackerNavigationMenuPage.checkProjectNotExist(newProjectData.title)
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(newProjectData)
    })

    await test.step('User see project in menu', async () => {
      await trackerNavigationMenuPage.checkProjectExist(newProjectData.title)
    })

    await test.step('User see project in all projects table', async () => {
      await trackerNavigationMenuPage.openAllProjects()
      await allProjectsPage.checkProjectExistInTable(newProjectData.title)
    })

    await test.step('User can open created project', async () => {
      await trackerNavigationMenuPage.openProject(newProjectData.title)
    })
  })

  test('User can go through the create project wizard steps', async () => {
    const projectId = generateProjectId()
    const data: NewProject = { title: `WizardProject-${projectId}`, identifier: projectId }

    await test.step('User prepare a project with the identifier', async () => {
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(data)
      await trackerNavigationMenuPage.checkProjectExist(data.title)
    })

    await test.step('A taken identifier blocks Next and Create', async () => {
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await expect(newProjectPage.popupHeader()).toBeVisible()
      await newProjectPage.inputTitle().fill(`${data.title}-2`)
      await newProjectPage.inputIdentifier().fill(projectId)
      await expect(newProjectPage.identifierExists()).toBeVisible()
      await expect(newProjectPage.buttonNext()).toBeDisabled()
      await expect(newProjectPage.buttonCreateProject()).toBeDisabled()
    })

    await test.step('A free identifier lets the wizard go forward and back', async () => {
      await newProjectPage.inputIdentifier().fill(generateProjectId())
      await expect(newProjectPage.identifierExists()).toBeHidden()
      await newProjectPage.goToStep('workflow')
      await expect(newProjectPage.buttonCreateProject()).toBeEnabled()
      await newProjectPage.buttonBack().click()
      await expect(newProjectPage.step('issues')).toBeVisible()
      await expect(newProjectPage.defaultIssueStatusButton()).toBeVisible()
    })

    await test.step('The creator cannot remove themselves or drop the owner role', async () => {
      await newProjectPage.buttonBack().click()
      await expect(newProjectPage.step('members')).toBeVisible()
      const own = newProjectPage.root().locator('[data-id="project-settings-member"]', { hasText: 'Appleseed John' })
      await expect(newProjectPage.memberRoles(own)).toBeDisabled()
      await expect(newProjectPage.memberMenu(own)).toBeDisabled()
    })

    await test.step('Summary shows the project and its people', async () => {
      await newProjectPage.goToStep('summary')
      await expect(newProjectPage.buttonNext()).toBeHidden()
      await expect(newProjectPage.summaryHead()).toContainText(`${data.title}-2`)
      await expect(newProjectPage.summaryOwners()).toContainText('Owners (1)')
      await expect(newProjectPage.summaryMembers()).toContainText(/Members \(\d+\)/)
      await newProjectPage.buttonBack().click()
      await expect(newProjectPage.step('workflow')).toBeVisible()
      await newProjectPage.buttonClose().click()
      await expect(newProjectPage.root()).toBeHidden()
    })
  })

  test('User can create a project based on another one', async ({ page }) => {
    const baseId = generateProjectId()
    const base: NewProject = { title: `BaseProject-${baseId}`, identifier: baseId }
    const copyId = generateProjectId()
    const copy: NewProject = { title: `CopyProject-${copyId}`, identifier: copyId }
    const member = 'Chen Rosamund'
    const templates = ['Bug report', 'New page', 'Weekly report'].map((it) => `${it}-${baseId}`)
    const templatePage = new TemplatePage(page)

    await test.step('Prepare the base: a member and three templates', async () => {
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(base)
      await trackerNavigationMenuPage.openIssuesForProject(base.title)
      await projectSettingsPage.openFromProject()
      await projectSettingsPage.addMember(member)
      await projectSettingsPage.buttonClose().click()

      const { client } = await connectTracker()
      const project = await findProjectByName(client, base.title)
      if (project === undefined) throw new Error(`Project "${base.title}" not found`)
      for (const title of templates) {
        await client.createDoc(tracker.class.IssueTemplate, project._id, {
          title,
          description: '',
          priority: IssuePriority.NoPriority,
          assignee: null,
          component: null,
          milestone: null,
          estimation: 0,
          children: [],
          comments: 0,
          attachments: 0,
          relations: []
        })
      }
    })

    await test.step('Choose the base and take two templates of three', async () => {
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await expect(newProjectPage.popupHeader()).toBeVisible()
      await newProjectPage.chooseBase(base.title)
      await newProjectPage.inputTitle().fill(copy.title)
      await newProjectPage.inputIdentifier().fill(copy.identifier)
      await newProjectPage.goToStep('copy')
      await expect(newProjectPage.copyBase()).toContainText(base.title)
      await expect(newProjectPage.copyCheckbox('members')).toBeChecked()
      for (const title of templates) await expect(newProjectPage.copyTemplate(title)).toBeChecked()
      await newProjectPage.copyTemplate(templates[2]).uncheck()
      await expect(newProjectPage.copyCheckbox('templates')).not.toBeChecked()
    })

    await test.step('Members come from the base and the summary tells what is copied', async () => {
      await newProjectPage.goToStep('members')
      await expect(newProjectPage.membersFromBase()).toBeVisible()
      await expect(newProjectPage.memberRow(member)).toBeVisible()
      await newProjectPage.goToStep('summary')
      await expect(newProjectPage.summaryBase()).toContainText(base.title)
      await expect(newProjectPage.summaryBase()).toContainText('2 of 3')
      await expect(newProjectPage.summaryMembers()).toContainText(member)
      await newProjectPage.buttonCreateProject().click()
      await expect(newProjectPage.root()).toBeHidden()
    })

    await test.step('The new project has the chosen templates and the members', async () => {
      await trackerNavigationMenuPage.checkProjectExist(copy.title)
      await trackerNavigationMenuPage.openTemplateForProject(copy.title)
      await expect(templatePage.directTemplateLocator(templates[0])).toBeVisible()
      await expect(templatePage.directTemplateLocator(templates[1])).toBeVisible()
      await expect(templatePage.directTemplateLocator(templates[2])).toBeHidden()
      await trackerNavigationMenuPage.openIssuesForProject(copy.title)
      await projectSettingsPage.openFromProject()
      await projectSettingsPage.openSection('members')
      await expect(projectSettingsPage.memberRow(member)).toBeVisible()
    })
  })

  test('User can create a project based on an archived one with its components', async ({ page }) => {
    const baseId = generateProjectId()
    const base: NewProject = { title: `ArchivedBase-${baseId}`, identifier: baseId }
    const copyId = generateProjectId()
    const copy: NewProject = { title: `ArchivedCopy-${copyId}`, identifier: copyId }
    const componentLabel = `Component-${baseId}`
    const templateTitle = `Template-${baseId}`
    const { client } = await connectTracker()

    await test.step('Prepare an archived base with a template that refers to its component', async () => {
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(base)
      await trackerNavigationMenuPage.checkProjectExist(base.title)
      const project = await findProjectByName(client, base.title)
      if (project === undefined) throw new Error(`Project "${base.title}" not found`)
      const component = await client.createDoc(tracker.class.Component, project._id, {
        label: componentLabel,
        description: '',
        lead: null,
        comments: 0,
        attachments: 0
      })
      await client.createDoc(tracker.class.IssueTemplate, project._id, {
        title: templateTitle,
        description: '',
        priority: IssuePriority.NoPriority,
        assignee: null,
        component,
        milestone: null,
        estimation: 0,
        children: [],
        comments: 0,
        attachments: 0,
        relations: []
      })
      await client.updateDoc(tracker.class.Project, project.space, project._id, { archived: true })
    })

    await test.step('The archived identifier is taken and the base shows only with the toggle', async () => {
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await expect(newProjectPage.popupHeader()).toBeVisible()
      await newProjectPage.inputIdentifier().fill(base.identifier)
      await expect(newProjectPage.identifierExists()).toBeVisible()
      await newProjectPage.modeSegment('base').click()
      await newProjectPage.baseButton().click()
      await expect(newProjectPage.basePopup()).toBeVisible()
      await expect(newProjectPage.basePopupRow(base.title)).toBeHidden()
      await newProjectPage.baseShowArchived().click()
      await newProjectPage.basePopupRow(base.title).click()
      await expect(newProjectPage.baseButton()).toContainText(base.title)
    })

    await test.step('Take the components with the template and create', async () => {
      await newProjectPage.inputTitle().fill(copy.title)
      await newProjectPage.inputIdentifier().fill(copy.identifier)
      await newProjectPage.goToStep('copy')
      await expect(newProjectPage.copyTemplate(templateTitle)).toBeChecked()
      await newProjectPage.copyCheckbox('components').check()
      await newProjectPage.goToStep('summary')
      await newProjectPage.buttonCreateProject().click()
      await expect(newProjectPage.root()).toBeHidden()
      await trackerNavigationMenuPage.checkProjectExist(copy.title)
    })

    await test.step('The template copy refers to the component copy of the new project', async () => {
      const project = await findProjectByName(client, copy.title)
      if (project === undefined) throw new Error(`Project "${copy.title}" not found`)
      await expect(async () => {
        const component = await client.findOne(tracker.class.Component, { space: project._id, label: componentLabel })
        const template = await client.findOne(tracker.class.IssueTemplate, { space: project._id, title: templateTitle })
        expect(component).toBeDefined()
        expect(template?.component).toBe(component?._id)
      }).toPass()
    })
  })

  test('User can edit project', async () => {
    const projectId = generateProjectId()

    const editProjectData: NewProject = {
      title: `EditProject-${projectId}`,
      identifier: projectId,
      description: 'Edit Project description',
      private: true,
      defaultAssigneeForIssues: 'Dirak Kainin',
      defaultIssueStatus: 'In Progress'
    }
    const updateProjectData: NewProject = {
      title: `UpdateProject-${projectId}`,
      identifier: projectId,
      description: 'Updated Project description',
      private: true,
      defaultAssigneeForIssues: 'Chen Rosamund',
      defaultIssueStatus: 'Done'
    }

    await test.step('User prepare project', async () => {
      await trackerNavigationMenuPage.checkProjectNotExist(editProjectData.title)
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(editProjectData)
      await trackerNavigationMenuPage.checkProjectExist(editProjectData.title)
    })

    await test.step('User opens project settings from the menu', async () => {
      await trackerNavigationMenuPage.makeActionWithProject(editProjectData.title, 'Edit project')
      await expect(projectSettingsPage.root()).toBeVisible()
      await projectSettingsPage.checkGeneral(editProjectData)
      await projectSettingsPage.checkIssueDefaults(editProjectData)
    })

    await test.step('Changes are saved at once, without a save button', async () => {
      await projectSettingsPage.openSection('general')
      await projectSettingsPage.setTitle(updateProjectData.title)
      await projectSettingsPage.setDescription(updateProjectData.description ?? '')
      await trackerNavigationMenuPage.checkProjectExist(updateProjectData.title)
      await projectSettingsPage.setIssueDefaults(updateProjectData)
    })

    await test.step('User sees the saved values after reopening the settings', async () => {
      await projectSettingsPage.buttonBack().click()
      await trackerNavigationMenuPage.makeActionWithProject(updateProjectData.title, 'Edit project')
      await projectSettingsPage.checkGeneral(updateProjectData)
      await projectSettingsPage.checkIssueDefaults(updateProjectData)
    })
  })

  test('User can open project settings with the gear and leave them', async () => {
    const projectId = generateProjectId()
    const data: NewProject = { title: `GearProject-${projectId}`, identifier: projectId }

    await test.step('User prepare project', async () => {
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(data)
      await trackerNavigationMenuPage.checkProjectExist(data.title)
    })

    await test.step('Gear opens the settings, "Back to project" returns to the issues', async () => {
      await trackerNavigationMenuPage.openIssuesForProject(data.title)
      await projectSettingsPage.openFromProject()
      await projectSettingsPage.buttonBack().click()
      await expect(projectSettingsPage.root()).toBeHidden()
      await expect(projectSettingsPage.buttonOpenSettings()).toBeVisible()
    })

    await test.step('Cross closes the settings', async () => {
      await projectSettingsPage.openFromProject()
      await projectSettingsPage.buttonClose().click()
      await expect(projectSettingsPage.root()).toBeHidden()
    })
  })

  test('User can make project private in settings', async () => {
    const projectId = generateProjectId()
    const data: NewProject = { title: `PrivateProject-${projectId}`, identifier: projectId }

    await trackerNavigationMenuPage.pressCreateProjectButton()
    await newProjectPage.createNewProject(data)
    await trackerNavigationMenuPage.checkProjectExist(data.title)
    await trackerNavigationMenuPage.openIssuesForProject(data.title)
    await projectSettingsPage.openFromProject()

    await projectSettingsPage.setPrivate(true)
    // The value survives a switch between sections
    await projectSettingsPage.openSection('general')
    await projectSettingsPage.openSection('members')
    await expect(projectSettingsPage.togglePrivate()).toBeChecked()
    await projectSettingsPage.setPrivate(false)
  })

  test('User can add a member and make them an owner in settings', async () => {
    const projectId = generateProjectId()
    const data: NewProject = { title: `OwnerProject-${projectId}`, identifier: projectId }
    const member = 'Chen Rosamund'

    await trackerNavigationMenuPage.pressCreateProjectButton()
    await newProjectPage.createNewProject(data)
    await trackerNavigationMenuPage.openIssuesForProject(data.title)
    await projectSettingsPage.openFromProject()

    await projectSettingsPage.addMember(member)
    await expect(projectSettingsPage.memberRow(member)).toContainText('Member')
    await projectSettingsPage.setMemberRoles(member, ['Owner'])
    await expect(projectSettingsPage.memberRow(member)).toContainText('Owner')
  })

  test('User can see statuses of the project type and archive the project in settings', async ({ page }) => {
    const projectId = generateProjectId()
    const data: NewProject = { title: `SettingsArchive-${projectId}`, identifier: projectId }

    await trackerNavigationMenuPage.pressCreateProjectButton()
    await newProjectPage.createNewProject(data)
    await trackerNavigationMenuPage.checkProjectExist(data.title)
    await trackerNavigationMenuPage.openIssuesForProject(data.title)
    await projectSettingsPage.openFromProject()

    await test.step('Statuses section lists the statuses of the type', async () => {
      await projectSettingsPage.openSection('statuses')
      await expect(projectSettingsPage.statusRows().first()).toBeVisible()
      await expect(projectSettingsPage.statusRows().filter({ hasText: 'Backlog' })).toHaveCount(1)
    })

    await test.step('Archive section archives the project', async () => {
      await projectSettingsPage.archiveProject()
      await trackerNavigationMenuPage.checkProjectNotExist(data.title)
      await trackerNavigationMenuPage.openAllProjects()
      await allProjectsPage.checkProjectExistInTable(`${data.title} (archived)`)
      await expect(page.locator('[data-id="project-settings"]')).toBeHidden()
    })
  })

  test('User can archive and unarchive Project', async ({ page }) => {
    const projectId = generateProjectId()

    const archiveProjectData: NewProject = {
      title: `ArchiveProject-${projectId}`,
      identifier: projectId,
      description: 'Archive Project description',
      private: true,
      defaultAssigneeForIssues: 'Dirak Kainin',
      defaultIssueStatus: 'In Progress'
    }

    await test.step('User prepare project', async () => {
      await trackerNavigationMenuPage.checkProjectNotExist(archiveProjectData.title)
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(archiveProjectData)
    })

    await test.step('User archive project', async () => {
      await trackerNavigationMenuPage.checkProjectExist(archiveProjectData.title)
      await trackerNavigationMenuPage.makeActionWithProject(archiveProjectData.title, 'Archive')
      await trackerNavigationMenuPage.pressYesForPopup(page)
      await trackerNavigationMenuPage.checkProjectNotExist(archiveProjectData.title)
      await trackerNavigationMenuPage.openAllProjects()
      await allProjectsPage.checkProjectExistInTable(`${archiveProjectData.title} (archived)`)
    })

    await test.step('User unarchive project', async () => {
      await allProjectsPage.unarchiveProject(archiveProjectData.title)
      await allProjectsPage.checkProjecInTableIsNotArchived(`${archiveProjectData.title}`)
      await trackerNavigationMenuPage.checkProjectExist(archiveProjectData.title)
    })

    await test.step('Finally archive project again', async () => {
      await trackerNavigationMenuPage.makeActionWithProject(archiveProjectData.title, 'Archive')
      await trackerNavigationMenuPage.pressYesForPopup(page)
      await trackerNavigationMenuPage.checkProjectNotExist(archiveProjectData.title)
    })
  })

  test('Star and Unstar Project', async () => {
    const projectId = generateProjectId()

    const projectToStarData: NewProject = {
      title: `ProjectToStar-${projectId}`,
      identifier: projectId,
      description: 'Starred Project description',
      private: true,
      defaultAssigneeForIssues: 'Dirak Kainin',
      defaultIssueStatus: 'In Progress'
    }

    await test.step('User prepare project', async () => {
      await trackerNavigationMenuPage.checkProjectNotExist(projectToStarData.title)
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(projectToStarData)
      await trackerNavigationMenuPage.checkProjectExist(projectToStarData.title)
    })

    await test.step('User star project', async () => {
      await trackerNavigationMenuPage.makeActionWithProject(projectToStarData.title, 'Star')
      await trackerNavigationMenuPage.checkProjectStarred(projectToStarData.title)
      await trackerNavigationMenuPage.checkProjectWillBeRemovedFromYours(projectToStarData.title)
    })

    await test.step('User unstar project', async () => {
      await trackerNavigationMenuPage.makeActionWithStarredProject(projectToStarData.title, 'Unstar')
      await trackerNavigationMenuPage.checkProjectExist(projectToStarData.title)
      await trackerNavigationMenuPage.checkProjectWillBeRemovedFromStarred(projectToStarData.title)
    })
  })

  test('Leave and Join Project', async () => {
    const projectId = generateProjectId()

    const projectToLeaveData: NewProject = {
      title: `ProjectToLeave-${projectId}`,
      identifier: projectId,
      description: 'Project to leave description',
      private: true,
      defaultAssigneeForIssues: 'Appleseed John',
      defaultIssueStatus: 'In Progress'
    }

    await test.step('User prepare project', async () => {
      await trackerNavigationMenuPage.checkProjectNotExist(projectToLeaveData.title)
      await trackerNavigationMenuPage.pressCreateProjectButton()
      await newProjectPage.createNewProject(projectToLeaveData)
      await trackerNavigationMenuPage.checkProjectExist(projectToLeaveData.title)
    })

    await test.step('User leave project', async () => {
      await trackerNavigationMenuPage.makeActionWithProject(projectToLeaveData.title, 'Leave')
      await trackerNavigationMenuPage.checkProjectWillBeRemovedFromYours(projectToLeaveData.title)
    })

    await test.step('User join project', async () => {
      await trackerNavigationMenuPage.openAllProjects()
      await allProjectsPage.checkProjectExistInTable(projectToLeaveData.title)
      await allProjectsPage.joinProject(projectToLeaveData.title)
      await trackerNavigationMenuPage.checkProjectExist(projectToLeaveData.title)
    })
  })

  test.afterEach(async () => {
    await trackerNavigationMenuPage.openIssuesForProject('Default')
  })
})
