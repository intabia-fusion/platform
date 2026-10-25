<!--
// Copyright © 2022-2023 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Analytics } from '@hcengineering/analytics'
  import { getName, type Employee } from '@hcengineering/contact'
  import type { AccountUuid, Data, Ref, Role, RolesAssignment } from '@hcengineering/core'
  import core, { generateId, getCurrentAccount, notEmpty, SortingOrder } from '@hcengineering/core'
  import { EmployeePresenter, employeeByIdStore, employeeRefByAccountUuidStore } from '@hcengineering/contact-resources'
  import { getEmbeddedLabel, type Asset, type IntlString } from '@hcengineering/platform'
  import presentation, { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import type { Project as TaskProject, ProjectType, TaskType } from '@hcengineering/task'
  import task from '@hcengineering/task'
  import { taskTypeStore, typeStore } from '@hcengineering/task-resources'
  import type { Component, IssueStatus, IssueTemplate, Milestone, Project } from '@hcengineering/tracker'
  import { TimeReportDayType, TrackerEvents } from '@hcengineering/tracker'
  import ui, {
    getColorNumberByText,
    IconChevronDown,
    Label,
    ModernPopupLabels,
    Scroller,
    showPopup,
    type DropdownTextItem
  } from '@hcengineering/ui'
  import {
    Callout,
    Checkbox,
    Chip,
    IconButton,
    SegmentedControl,
    SelectButton,
    SettingRow,
    TextArea,
    TextInput,
    Toggle,
    WizardDialog
  } from '@hcengineering/ui/kit'
  import { IconPicker, statusStore } from '@hcengineering/view-resources'
  import type { ProjectWorkflow, Workflow } from '@hcengineering/workflow'
  import workflow from '@hcengineering/workflow'

  import tracker from '../../plugin'
  import {
    copyTemplate,
    defaultCopyOptions,
    keepAssignee,
    selectionState,
    settingsFromBase,
    type BaseSettings,
    type CopyOptions
  } from '../../projectCopyLogic'
  import { applyRoles, isAccessValid, mergeOwners, removeFromRoles } from '../../projectSettingsLogic'
  import ProjectBaseItem from './ProjectBaseItem.svelte'
  import ProjectBasePopup from './ProjectBasePopup.svelte'
  import ProjectAssigneeSelect from './settings/ProjectAssigneeSelect.svelte'
  import ProjectIconTile from './settings/ProjectIconTile.svelte'
  import ProjectMembersTable from './settings/ProjectMembersTable.svelte'
  import ProjectStatusSelect from './settings/ProjectStatusSelect.svelte'
  import ProjectWorkflowSelect from './settings/ProjectWorkflowSelect.svelte'

  export let namePlaceholder: string = ''
  export let descriptionPlaceholder: string = ''

  type Step = 'general' | 'copy' | 'members' | 'issues' | 'workflow' | 'summary'
  type Mode = 'empty' | 'base'
  let mode: Mode = 'empty'
  // The "what to take from the base" step exists only for a project based on another one
  $: steps = [
    { id: 'general' as const, label: tracker.string.ProjectSettingsGeneral },
    ...(mode === 'base' ? [{ id: 'copy' as const, label: tracker.string.ProjectWizardCopy }] : []),
    { id: 'members' as const, label: tracker.string.ProjectSettingsAccess },
    { id: 'issues' as const, label: tracker.string.ProjectSettingsIssues },
    { id: 'workflow' as const, label: tracker.string.ProjectSettingsWorkflow },
    { id: 'summary' as const, label: tracker.string.ProjectWizardSummary }
  ]
  let step: Step = 'general'

  const modes = [
    { id: 'empty' as const, label: tracker.string.ProjectCreateEmpty },
    { id: 'base' as const, label: tracker.string.ProjectCreateBased }
  ]

  const client = getClient()
  const hierarchy = client.getHierarchy()
  // The creator stays a member and the owner of the project: the wizard locks their row
  const me = getCurrentAccount().uuid
  const dispatch = createEventDispatcher()

  let name: string = namePlaceholder
  let description: string = descriptionPlaceholder
  // Comes from the name, so an empty wizard does not start with a taken default
  let identifier: string = toIdentifier(name)
  let isPrivate: boolean = false
  let icon: Asset = tracker.icon.Home
  let color: Project['color'] = getColorNumberByText(name)
  let isColorSelected = false
  let defaultAssignee: Ref<Employee> | undefined = undefined
  // The assignee came from the base: dropped once they are not a member
  let assigneeFromBase = false
  let defaultStatusId: Ref<IssueStatus> | undefined = undefined
  let members: AccountUuid[] = [me]
  let owners: AccountUuid[] = [me]
  let membersChanged: boolean = false
  let rolesAssignment: RolesAssignment = {}
  let workflowsMapping: Record<Ref<TaskType>, Ref<Workflow>> = {}
  let projects: Project[] = []
  let projectsIdentifiers = new Set<string>()
  let isSaving = false
  // Bumped on a rejected role change to rebuild the role fields
  let resetKey = 0

  let base: Project | undefined = undefined
  let baseSettings: BaseSettings | undefined = undefined
  let baseTemplates: IssueTemplate[] = []
  let baseComponents: Component[] = []
  let baseMilestones: Milestone[] = []
  let copy: CopyOptions = defaultCopyOptions([])
  let templatesOpen = true

  let types: ProjectType[] = []
  let typeId: Ref<ProjectType> | undefined
  $: typeType = typeId !== undefined ? $typeStore.get(typeId) : undefined

  const projectsQuery = createQuery()
  const typesQuery = createQuery()
  const rolesQuery = createQuery()
  const workflowsQuery = createQuery()

  // Archived projects too: they keep their identifiers and can be a base.
  // The server hides archived spaces unless showArchived is set.
  $: projectsQuery.query(
    tracker.class.Project,
    {},
    (res) => {
      projects = res
      projectsIdentifiers = new Set(res.map(({ identifier }) => identifier))
    },
    { sort: { name: SortingOrder.Ascending }, showArchived: true }
  )

  // The first type is taken until one is chosen, as the type selector did
  $: typesQuery.query(task.class.ProjectType, { descriptor: tracker.descriptors.ProjectType }, (res) => {
    types = res
    if (typeId === undefined && res.length > 0) typeId = res[0]._id
  })

  $: setTypeDefaults(typeType)

  function setTypeDefaults (typeType: ProjectType | undefined): void {
    if (typeType === undefined || membersChanged) return
    if (typeType.members === undefined || typeType.members.length === 0) return
    members = typeType.members
  }

  let roles: Role[] = []
  $: if (typeType !== undefined) {
    rolesQuery.query(
      core.class.Role,
      { attachedTo: typeType._id },
      (res) => {
        roles = res
      },
      {
        sort: { name: SortingOrder.Ascending }
      }
    )
  } else {
    rolesQuery.unsubscribe()
    roles = []
  }

  let workflows: Workflow[] = []
  $: if (typeId !== undefined) {
    workflowsQuery.query(
      workflow.class.Workflow,
      { projectType: typeId },
      (res) => {
        workflows = res
      },
      {
        sort: { name: SortingOrder.Ascending }
      }
    )
  } else {
    workflowsQuery.unsubscribe()
    workflows = []
  }

  $: taskTypes = Array.from($taskTypeStore.values()).filter(
    (it) => it.parent === typeId && it.ofClass === tracker.class.Issue
  )

  // As in the settings: the first task type's statuses, narrowed to its workflow's initial ones
  $: firstTaskType = taskTypes[0]
  $: initialStatuses =
    firstTaskType !== undefined
      ? (workflows.find((it) => it._id === workflowsMapping[firstTaskType._id])?.initialStatuses ?? [])
      : []
  $: statuses = (firstTaskType?.statuses ?? [])
    .map((id) => $statusStore.byId.get(id) as IssueStatus | undefined)
    .filter(notEmpty)
    .filter((it) => initialStatuses.length === 0 || initialStatuses.includes(it._id))
  $: defaultStatus = statuses.find((it) => it._id === defaultStatusId) ?? statuses[0]

  $: memberEmployees = mergeOwners(members, owners).map((it) => $employeeRefByAccountUuidStore.get(it))
  $: if (assigneeFromBase) {
    const kept = keepAssignee(defaultAssignee, memberEmployees)
    if (kept !== defaultAssignee) {
      defaultAssignee = kept
      assigneeFromBase = false
    }
  }

  $: identifier = identifier.toLocaleUpperCase().replaceAll('-', '_').replaceAll(' ', '_').substring(0, 5)
  $: identifierExists = !isSaving && projectsIdentifiers.has(identifier.toUpperCase())

  $: generalValid =
    typeId !== undefined &&
    (mode === 'empty' || base !== undefined) &&
    name.trim().length > 0 &&
    identifier.trim().length > 0 &&
    !identifierExists
  $: accessValid = isAccessValid(isPrivate, mergeOwners(members, owners), owners)
  $: canSave = generalValid && accessValid
  $: canProceed = step === 'general' ? generalValid : step === 'members' ? accessValid : true

  let typeOpened = false
  let baseOpened = false

  function chooseType (e: MouseEvent): void {
    typeOpened = true
    const items: DropdownTextItem[] = types.map((it) => ({ id: it._id, label: it.name }))
    showPopup(
      ModernPopupLabels,
      { placeholder: ui.string.SearchDots, items, selected: typeId },
      e.currentTarget as HTMLElement,
      (result: DropdownTextItem['id'] | DropdownTextItem['id'][] | null | undefined) => {
        typeOpened = false
        const id = Array.isArray(result) ? result[0] : result
        if (id == null || id === typeId) return
        typeId = String(id) as Ref<ProjectType>
        // Roles, statuses and workflows belong to the type: a new type starts them over
        defaultStatusId = undefined
        workflowsMapping = {}
        rolesAssignment = {}
      }
    )
  }

  function chooseBase (e: MouseEvent): void {
    const element = e.currentTarget as HTMLElement
    baseOpened = true
    showPopup(
      ProjectBasePopup,
      { projects, selected: base?._id, width: `${element.clientWidth}px` },
      element,
      (id: Ref<Project> | null | undefined) => {
        baseOpened = false
        const project = projects.find((it) => it._id === id)
        if (project === undefined || project._id === base?._id) return
        void setBase(project)
      }
    )
  }

  function readBaseSettings (project: Project, roles: Role[]): BaseSettings {
    const targetClass = $typeStore.get(project.type)?.targetClass
    const asRoles =
      targetClass !== undefined
        ? (hierarchy.as(project, targetClass) as unknown as Record<string, AccountUuid[] | undefined>)
        : {}
    return {
      members: project.members,
      owners: project.owners ?? [],
      assignment: Object.fromEntries(roles.map(({ _id }) => [_id, asRoles[_id] ?? []])) as RolesAssignment,
      isPrivate: project.private,
      defaultAssignee: project.defaultAssignee,
      defaultStatus: project.defaultIssueStatus !== '' ? project.defaultIssueStatus : undefined,
      workflows: hierarchy.hasMixin(project, workflow.mixin.ProjectWorkflow)
        ? (hierarchy.as<TaskProject, ProjectWorkflow>(project, workflow.mixin.ProjectWorkflow).workflows ?? {})
        : {}
    }
  }

  async function setBase (project: Project): Promise<void> {
    const [baseRoles, templates, components, milestones] = await Promise.all([
      client.findAll(core.class.Role, { attachedTo: project.type }),
      client.findAll(tracker.class.IssueTemplate, { space: project._id }, { sort: { title: SortingOrder.Ascending } }),
      client.findAll(tracker.class.Component, { space: project._id }, { sort: { label: SortingOrder.Ascending } }),
      client.findAll(tracker.class.Milestone, { space: project._id }, { sort: { label: SortingOrder.Ascending } })
    ])
    base = project
    baseSettings = readBaseSettings(project, baseRoles)
    baseTemplates = templates
    baseComponents = components
    baseMilestones = milestones
    copy = {
      ...defaultCopyOptions(templates.map((it) => it._id)),
      workflows: Object.keys(baseSettings.workflows).length > 0
    }
    typeId = project.type
    description = project.description
    icon = project.icon ?? tracker.icon.Home
    color = project.color ?? getColorNumberByText(project.name)
    isColorSelected = true
    applyBase('all')
  }

  type CopyGroup = 'members' | 'privacy' | 'defaults' | 'workflows'

  // Fills the steps from the base by the checked groups;
  // later edits stay until the group is toggled again
  function applyBase (group: CopyGroup | 'all'): void {
    const next = settingsFromBase(baseSettings, copy, me)
    if (group === 'all' || group === 'members') {
      members = next.members
      owners = next.owners
      rolesAssignment = next.assignment
      membersChanged = baseSettings !== undefined
      resetKey++
    }
    if (group === 'all' || group === 'privacy') isPrivate = next.isPrivate
    if (group === 'all' || group === 'defaults') {
      defaultAssignee = next.defaultAssignee
      assigneeFromBase = next.defaultAssignee !== undefined
      defaultStatusId = next.defaultStatus
    }
    if (group === 'all' || group === 'workflows') workflowsMapping = next.workflows
  }

  function toggleCopy (group: CopyGroup, value: boolean): void {
    copy = { ...copy, [group]: value }
    applyBase(group)
  }

  function setMode (next: Mode): void {
    if (next === mode) return
    mode = next
    if (next === 'base') return
    // Back to an empty project: nothing of the base stays
    base = undefined
    baseSettings = undefined
    baseTemplates = []
    baseComponents = []
    baseMilestones = []
    copy = defaultCopyOptions([])
    applyBase('all')
    description = descriptionPlaceholder
    icon = tracker.icon.Home
    isColorSelected = false
    color = getColorNumberByText(name)
    setTypeDefaults(typeType)
  }

  function toggleTemplate (id: Ref<IssueTemplate>, value: boolean): void {
    const rest = copy.templates.filter((it) => it !== id)
    copy = { ...copy, templates: value ? [...rest, id] : rest }
  }

  $: allTemplateIds = baseTemplates.map((it) => it._id)
  $: templatesState = selectionState(copy.templates, allTemplateIds)
  $: mappedTypes = taskTypes.filter((it) => baseSettings?.workflows[it._id] !== undefined).length
  $: noTemplates = baseTemplates.length === 0
  $: noWorkflows = mappedTypes === 0
  $: missingLabel = noTemplates
    ? noWorkflows
      ? tracker.string.ProjectCopyMissingBoth
      : tracker.string.ProjectCopyMissingTemplates
    : noWorkflows
      ? tracker.string.ProjectCopyMissingWorkflows
      : undefined
  $: baseAssignee =
    baseSettings?.defaultAssignee !== undefined ? $employeeByIdStore.get(baseSettings.defaultAssignee) : undefined
  $: baseStatus =
    baseSettings?.defaultStatus !== undefined ? $statusStore.byId.get(baseSettings.defaultStatus) : undefined
  $: baseOwners = baseSettings?.owners.length ?? 0
  $: baseMembers = baseSettings?.members.filter((it) => baseSettings?.owners.includes(it) !== true).length ?? 0

  // Summary of the base: what goes into the new project and what does not
  $: copiedSettings = [
    copy.members ? tracker.string.ProjectCopyMembers : undefined,
    copy.privacy ? tracker.string.ProjectCopyPrivacy : undefined,
    copy.defaults ? tracker.string.ProjectCopyDefaults : undefined
  ].filter(notEmpty)
  $: notCopied = [
    copy.members ? undefined : tracker.string.ProjectCopyMembers,
    copy.privacy ? undefined : tracker.string.ProjectCopyPrivacy,
    copy.defaults ? undefined : tracker.string.ProjectCopyDefaults,
    copy.workflows || noWorkflows ? undefined : tracker.string.ProjectCopyWorkflows,
    copy.templates.length > 0 || noTemplates ? undefined : tracker.string.ProjectCopyTemplates,
    copy.components || baseComponents.length === 0 ? undefined : tracker.string.ProjectCopyComponents,
    copy.milestones || baseMilestones.length === 0 ? undefined : tracker.string.ProjectCopyMilestones
  ].filter(notEmpty)

  function toIdentifier (name: string): string {
    return name.toLocaleUpperCase().replaceAll('-', '_').replaceAll(' ', '_').substring(0, 5)
  }

  function changeName (): void {
    identifier = toIdentifier(name)
    color = isColorSelected ? color : getColorNumberByText(name)
  }

  function chooseIcon (): void {
    const update = (result: any): void => {
      if (result !== undefined && result !== null) {
        icon = result.icon
        color = result.color
        isColorSelected = true
      }
    }
    showPopup(IconPicker, { icon, color }, 'top', update, update)
  }

  function addMember (account: AccountUuid): void {
    if (members.includes(account)) return
    membersChanged = true
    members = [...members, account]
  }

  function removeMember (account: AccountUuid): void {
    if (account === me) return
    membersChanged = true
    members = members.filter((it) => it !== account)
    owners = owners.filter((it) => it !== account)
    rolesAssignment = removeFromRoles(rolesAssignment, [account])
  }

  function changeRoles (account: AccountUuid, selected: string[]): void {
    if (account === me) {
      resetKey++
      return
    }
    const next = applyRoles(account, selected, owners, rolesAssignment)
    // A project needs an owner: the change that leaves none is rejected
    if (next.owners.length === 0) {
      resetKey++
      return
    }
    owners = next.owners
    members = mergeOwners(members, next.owners)
    rolesAssignment = next.assignment
  }

  function setWorkflow (taskType: Ref<TaskType>, id: Ref<Workflow> | undefined): void {
    const next = { ...workflowsMapping }
    if (id !== undefined) next[taskType] = id
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    else delete next[taskType]
    workflowsMapping = next
  }

  function getProjectData (): Omit<Data<Project>, 'type'> {
    return {
      name,
      description,
      private: isPrivate,
      members: mergeOwners(members, owners),
      owners,
      archived: false,
      // Auto-join is a chat channel feature: projects are joined explicitly
      autoJoin: false,
      identifier: identifier.toUpperCase(),
      sequence: 0,
      defaultAssignee,
      icon,
      color,
      defaultIssueStatus: defaultStatus?._id ?? ('' as Ref<IssueStatus>),
      defaultTimeReportDay: TimeReportDayType.PreviousWorkDay
    }
  }

  // Components and milestones go first, so template copies can refer to them; all in one transaction
  async function copyContent (projectId: Ref<Project>): Promise<void> {
    const ops = client.apply('copy-project-content')
    const componentCopies = new Map<Ref<Component>, Ref<Component>>()
    const milestoneCopies = new Map<Ref<Milestone>, Ref<Milestone>>()
    if (copy.components) {
      for (const it of baseComponents) {
        const id = await ops.createDoc(tracker.class.Component, projectId, {
          label: it.label,
          description: it.description,
          lead: it.lead,
          comments: 0,
          attachments: 0
        })
        componentCopies.set(it._id, id)
      }
    }
    if (copy.milestones) {
      for (const it of baseMilestones) {
        const id = await ops.createDoc(tracker.class.Milestone, projectId, {
          label: it.label,
          description: it.description,
          status: it.status,
          targetDate: it.targetDate,
          comments: 0,
          attachments: 0
        })
        milestoneCopies.set(it._id, id)
      }
    }
    for (const it of baseTemplates.filter((t) => copy.templates.includes(t._id))) {
      await ops.createDoc(
        tracker.class.IssueTemplate,
        projectId,
        copyTemplate(it, componentCopies, milestoneCopies, generateId)
      )
    }
    const res = await ops.commit()
    if (!res.result) throw new Error('copy-project-content was not applied')
  }

  async function createProject (): Promise<void> {
    if (!canSave || typeId === undefined || typeType === undefined) return
    const projectId = generateId<Project>()
    const projectData = getProjectData()
    const ops = client
      .apply('create-project')
      .notMatch(tracker.class.Project, { identifier: projectData.identifier.toUpperCase() })

    isSaving = true
    await ops.createDoc(tracker.class.Project, core.space.Space, { ...projectData, type: typeId }, projectId)
    const succeeded = await ops.commit()
    Analytics.handleEvent(TrackerEvents.ProjectCreated, {
      ok: succeeded.result,
      id: projectData.identifier
    })
    if (!succeeded.result) {
      isSaving = false
      return
    }
    // Add space type's mixin with roles assignments
    await client.createMixin(projectId, tracker.class.Project, core.space.Space, typeType.targetClass, rolesAssignment)

    if (Object.keys(workflowsMapping).length > 0) {
      await client.createMixin<TaskProject, ProjectWorkflow>(
        projectId,
        tracker.class.Project,
        core.space.Space,
        workflow.mixin.ProjectWorkflow,
        { workflows: workflowsMapping }
      )
    }
    if (mode === 'base' && base !== undefined) {
      try {
        await copyContent(projectId)
      } catch (err: any) {
        // The project exists: the user gets it and learns that the content is missing
        Analytics.handleError(err)
        console.error(err)
        showPopup(MessageBox, {
          label: tracker.string.ProjectCopyFailed,
          message: tracker.string.ProjectCopyFailedMessage,
          params: { name: projectData.name, base: base.name },
          canSubmit: false
        })
      }
    }
    close(projectId)
  }

  // Summary: owners and the other members, as they will be stored
  $: summaryLists = [
    { id: 'owners', label: tracker.string.ProjectWizardOwnersCount, accounts: owners },
    {
      id: 'members',
      label: tracker.string.ProjectWizardMembersCount,
      accounts: mergeOwners(members, owners).filter((it) => !owners.includes(it))
    }
  ]

  function close (id?: Ref<Project>): void {
    dispatch('close', id)
  }

  function labelOf (text: string): IntlString {
    return getEmbeddedLabel(text)
  }
</script>

<WizardDialog
  label={tracker.string.CreateProject}
  {steps}
  bind:selected={step}
  {canProceed}
  canSubmit={canSave}
  submitLabel={presentation.string.Create}
  earlySubmit
  loading={isSaving}
  data-id="project-create-wizard"
  on:submit={createProject}
  on:close={() => {
    close()
  }}
>
  <div class="step-frame">
    <Scroller padding="var(--_ring)">
      <div class="step" data-id={`project-create-step-${step}`}>
        {#if step === 'general'}
          <SettingRow kind="column" label={tracker.string.ProjectCreateMode}>
            <SegmentedControl
              items={modes}
              selected={mode}
              data-id="project-create-mode"
              on:select={(e) => {
                setMode(e.detail)
              }}
            />
          </SettingRow>

          {#if mode === 'base'}
            <SettingRow
              kind="column"
              label={tracker.string.ProjectBase}
              hint={tracker.string.ProjectBaseHint}
              fullWidth
            >
              <SelectButton
                data-id="project-base"
                placeholder={tracker.string.ProjectBaseSelect}
                empty={base === undefined}
                field
                fullWidth
                chevron
                pressed={baseOpened}
                on:click={chooseBase}
              >
                {#if base !== undefined}
                  <span class="base-value">
                    <ProjectIconTile icon={base.icon ?? tracker.icon.Home} color={base.color} name={base.name} plain />
                    <ProjectBaseItem project={base} showIdentifier={false} />
                  </span>
                {/if}
              </SelectButton>
            </SettingRow>
          {/if}

          <SettingRow
            kind="column"
            label={task.string.ProjectType}
            hint={mode === 'base' ? tracker.string.ProjectBaseTypeHint : tracker.string.ProjectTypeHint}
            fullWidth
          >
            <SelectButton
              data-id="project-type"
              label={typeType !== undefined ? getEmbeddedLabel(typeType.name) : undefined}
              placeholder={task.string.ProjectType}
              field
              fullWidth
              chevron={mode === 'empty'}
              disabled={mode === 'base'}
              pressed={typeOpened}
              on:click={chooseType}
            />
          </SettingRow>

          <SettingRow kind="column" label={tracker.string.ProjectSettingsName} fullWidth let:labelId>
            <TextInput
              id="project-title"
              bind:value={name}
              placeholder={tracker.string.ProjectTitlePlaceholder}
              aria-labelledby={labelId}
              fullWidth
              autofocus
              on:input={changeName}
            />
          </SettingRow>

          <SettingRow
            kind="column"
            label={tracker.string.Identifier}
            hint={tracker.string.IdentifierHint}
            hintParams={{ example: `${identifier}-1` }}
            fullWidth
            let:labelId
          >
            <div class="field-with-error">
              <TextInput
                id="project-identifier"
                bind:value={identifier}
                placeholder={tracker.string.ProjectIdentifierPlaceholder}
                aria-labelledby={labelId}
                error={identifierExists}
                fullWidth
              />
              {#if identifierExists}
                <span class="field-error" data-id="project-identifier-exists">
                  <Label label={tracker.string.IdentifierExists} />
                </span>
              {/if}
            </div>
          </SettingRow>

          <SettingRow
            kind="column"
            label={tracker.string.Description}
            hint={base !== undefined ? tracker.string.ProjectBaseFilledHint : undefined}
            fullWidth
            let:labelId
          >
            <div class="field-fill">
              <TextArea
                id="project-description"
                bind:value={description}
                rows={2}
                placeholder={tracker.string.IssueDescriptionPlaceholder}
                aria-labelledby={labelId}
              />
            </div>
          </SettingRow>

          <SettingRow
            kind="column"
            label={tracker.string.ProjectSettingsIcon}
            hint={base !== undefined ? tracker.string.ProjectBaseIconHint : undefined}
          >
            <ProjectIconTile id="project-icon" {icon} {color} {name} on:click={chooseIcon} />
          </SettingRow>
        {:else if step === 'copy' && base !== undefined}
          <div class="base-head" data-id="project-create-copy-base">
            <span class="secondary"><Label label={tracker.string.ProjectBaseFrom} /></span>
            <ProjectIconTile icon={base.icon ?? tracker.icon.Home} color={base.color} name={base.name} plain />
            <span class="base-name"><ProjectBaseItem project={base} showIdentifier={false} /></span>
            <span class="secondary">
              <Label
                label={tracker.string.ProjectBaseIdentifierType}
                params={{ identifier: base.identifier, type: typeType?.name ?? '' }}
              />
            </span>
          </div>

          {#if missingLabel !== undefined}
            <Callout tone="warning" label={missingLabel} labelParams={{ name: base.name }} />
          {/if}

          <div class="copy-group">
            <span class="copy-title"><Label label={tracker.string.ProjectCopySettings} /></span>
            <div class="copy-row" data-id="project-copy-members">
              <Checkbox
                kind="brand"
                checked={copy.members}
                label={tracker.string.ProjectCopyMembers}
                on:change={(e) => {
                  toggleCopy('members', e.detail)
                }}
              />
              <span class="copy-value">
                <Label
                  label={tracker.string.ProjectCopyMembersCount}
                  params={{ owners: baseOwners, members: baseMembers }}
                />
              </span>
            </div>
            <div class="copy-row" data-id="project-copy-privacy">
              <Checkbox
                kind="brand"
                checked={copy.privacy}
                label={tracker.string.ProjectCopyPrivacy}
                on:change={(e) => {
                  toggleCopy('privacy', e.detail)
                }}
              />
              <span class="copy-value">
                <Label
                  label={baseSettings?.isPrivate === true
                    ? tracker.string.ProjectCopyPrivate
                    : tracker.string.ProjectCopyPublic}
                />
              </span>
            </div>
            <div class="copy-row" data-id="project-copy-defaults">
              <Checkbox
                kind="brand"
                checked={copy.defaults}
                label={tracker.string.ProjectCopyDefaults}
                on:change={(e) => {
                  toggleCopy('defaults', e.detail)
                }}
              />
              <span class="copy-value">
                {#if baseAssignee !== undefined}
                  {getName(hierarchy, baseAssignee)}
                {:else}
                  <Label label={tracker.string.Unassigned} />
                {/if}
                {#if baseStatus !== undefined}· {baseStatus.name}{/if}
              </span>
            </div>
            <div class="copy-row" data-id="project-copy-workflows">
              <Checkbox
                kind="brand"
                checked={copy.workflows}
                disabled={noWorkflows}
                label={tracker.string.ProjectCopyWorkflows}
                on:change={(e) => {
                  toggleCopy('workflows', e.detail)
                }}
              />
              <span class="copy-value">
                {#if noWorkflows}
                  <Label label={tracker.string.ProjectCopyNoWorkflows} />
                {:else}
                  <Label
                    label={tracker.string.ProjectCopyOfTypes}
                    params={{ count: mappedTypes, total: taskTypes.length }}
                  />
                {/if}
              </span>
            </div>
          </div>

          <div class="copy-group">
            <span class="copy-title"><Label label={tracker.string.ProjectCopyContent} /></span>
            <div class="copy-row" data-id="project-copy-templates">
              <Checkbox
                kind="brand"
                checked={templatesState === 'all'}
                indeterminate={templatesState === 'some'}
                disabled={noTemplates}
                label={tracker.string.ProjectCopyTemplates}
                on:change={() => {
                  copy = { ...copy, templates: templatesState === 'none' ? allTemplateIds : [] }
                }}
              />
              {#if noTemplates}
                <span class="copy-value"><Label label={tracker.string.ProjectCopyNoTemplates} /></span>
              {:else}
                <span class="copy-value with-chip">
                  <Chip
                    label={tracker.string.ProjectCopySelected}
                    labelParams={{ count: copy.templates.length, total: baseTemplates.length }}
                    kind="neutral"
                    size="extra-small"
                  />
                  <span class="chevron" class:open={templatesOpen}>
                    <IconButton
                      icon={IconChevronDown}
                      kind="ghost"
                      size="extra-small"
                      tooltip={{ label: tracker.string.ProjectCopyTemplates }}
                      aria-expanded={templatesOpen}
                      data-id="project-copy-templates-toggle"
                      on:click={() => {
                        templatesOpen = !templatesOpen
                      }}
                    />
                  </span>
                </span>
              {/if}
            </div>
            {#if templatesOpen && !noTemplates}
              <div class="copy-children">
                {#each baseTemplates as template (template._id)}
                  <div class="copy-row" data-id="project-copy-template">
                    <Checkbox
                      kind="brand"
                      size="small"
                      checked={copy.templates.includes(template._id)}
                      label={labelOf(template.title)}
                      on:change={(e) => {
                        toggleTemplate(template._id, e.detail)
                      }}
                    />
                    {#if template.kind !== undefined}
                      <span class="copy-value">{$taskTypeStore.get(template.kind)?.name ?? ''}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
            <div class="copy-row" data-id="project-copy-components">
              <Checkbox
                kind="brand"
                checked={copy.components}
                disabled={baseComponents.length === 0}
                label={tracker.string.ProjectCopyComponents}
                on:change={(e) => {
                  copy = { ...copy, components: e.detail }
                }}
              />
              <span class="copy-value">
                {#if baseComponents.length === 0}
                  <Label label={tracker.string.ProjectCopyNoComponents} />
                {:else}
                  {baseComponents.length}
                {/if}
              </span>
            </div>
            <div class="copy-row" data-id="project-copy-milestones">
              <Checkbox
                kind="brand"
                checked={copy.milestones}
                disabled={baseMilestones.length === 0}
                label={tracker.string.ProjectCopyMilestones}
                on:change={(e) => {
                  copy = { ...copy, milestones: e.detail }
                }}
              />
              <span class="copy-value">
                {#if baseMilestones.length === 0}
                  <Label label={tracker.string.ProjectCopyNoMilestones} />
                {:else}
                  {baseMilestones.length}
                {/if}
              </span>
            </div>
          </div>

          <span class="footnote"><Label label={tracker.string.ProjectCopyFootnote} /></span>
        {:else if step === 'members'}
          {#if base !== undefined && copy.members}
            <Callout tone="info" label={tracker.string.ProjectMembersFromBase} labelParams={{ name: base.name }} />
          {/if}
          <SettingRow
            kind="column"
            label={tracker.string.ProjectSettingsPrivate}
            hint={tracker.string.ProjectSettingsPrivateHint}
            let:labelId
          >
            <Toggle
              id="project-private"
              bind:checked={isPrivate}
              disabled={!isPrivate && members.length === 0}
              aria-labelledby={labelId}
            />
          </SettingRow>

          <div class="divider" />

          <ProjectMembersTable
            {members}
            {owners}
            assignment={rolesAssignment}
            {roles}
            {resetKey}
            lockedAccount={me}
            onAdd={addMember}
            onRemove={removeMember}
            onRolesChange={changeRoles}
          />

          {#if !accessValid}
            <span class="error-color" data-id="project-create-access-error">
              <Label label={tracker.string.ProjectAccessInvalid} />
            </span>
          {/if}
        {:else if step === 'issues'}
          <SettingRow kind="column" label={tracker.string.ProjectSettingsDefaultAssignee}>
            <div class="field">
              <ProjectAssigneeSelect
                value={defaultAssignee}
                onChange={(value) => {
                  defaultAssignee = value
                  assigneeFromBase = false
                }}
              />
            </div>
          </SettingRow>

          <SettingRow kind="column" label={tracker.string.DefaultIssueStatus}>
            <div class="field">
              {#if typeId !== undefined}
                <ProjectStatusSelect
                  {statuses}
                  value={defaultStatus}
                  taskType={firstTaskType?._id}
                  projectType={typeId}
                  onChange={(value) => {
                    defaultStatusId = value
                  }}
                />
              {/if}
            </div>
          </SettingRow>
        {:else if step === 'workflow'}
          {#if workflows.length > 0}
            <span class="intro"><Label label={tracker.string.ProjectWizardWorkflowIntro} /></span>
            <div class="mapping-table" data-id="project-create-workflows">
              <div class="mapping-row head">
                <div class="cell type"><Label label={workflow.string.TaskType} /></div>
                <div class="cell"><Label label={tracker.string.ProjectSettingsWorkflow} /></div>
              </div>
              {#each taskTypes as taskType (taskType._id)}
                <div class="mapping-row">
                  <div class="cell type overflow-label">{taskType.name}</div>
                  <div class="cell">
                    <div class="field">
                      <ProjectWorkflowSelect
                        {taskType}
                        {workflows}
                        value={workflowsMapping[taskType._id]}
                        onChange={(id) => {
                          setWorkflow(taskType._id, id)
                        }}
                      />
                    </div>
                  </div>
                </div>
              {/each}
            </div>
            <span class="intro" data-id="project-create-workflows-hint">
              <Label label={tracker.string.ProjectWizardWorkflowsInType} />
            </span>
          {:else}
            <Callout
              tone="info"
              label={tracker.string.ProjectWizardNoWorkflows}
              labelParams={{ type: typeType?.name ?? '' }}
            />
          {/if}
        {:else}
          <div class="summary-head" data-id="project-create-summary-general">
            <ProjectIconTile {icon} {color} {name} readonly />
            <div class="summary-title">
              <span class="summary-name">{name}</span>
              <span class="summary-identifier">{identifier}</span>
            </div>
          </div>
          {#if base !== undefined}
            <div class="summary-base" data-id="project-create-summary-base">
              <span class="summary-list-title"><Label label={tracker.string.ProjectSummaryBasedOn} /></span>
              <div class="summary-grid">
                <span class="summary-key"><Label label={tracker.string.ProjectSummaryBase} /></span>
                <span class="summary-value base-value">
                  <ProjectIconTile icon={base.icon ?? tracker.icon.Home} color={base.color} name={base.name} plain />
                  <span>{base.name} ({base.identifier})</span>
                  {#if base.archived}
                    <Chip label={tracker.string.ProjectArchivedChip} kind="neutral" size="extra-small" />
                  {/if}
                </span>
                {#if !noTemplates}
                  <span class="summary-key"><Label label={tracker.string.ProjectCopyTemplates} /></span>
                  <span class="summary-value" data-id="project-create-summary-templates">
                    <Label
                      label={tracker.string.ProjectCopyOf}
                      params={{ count: copy.templates.length, total: baseTemplates.length }}
                    />
                  </span>
                {/if}
                {#if copy.workflows && !noWorkflows}
                  <span class="summary-key"><Label label={tracker.string.ProjectSettingsWorkflow} /></span>
                  <span class="summary-value">
                    <Label
                      label={tracker.string.ProjectCopyOfTypes}
                      params={{ count: mappedTypes, total: taskTypes.length }}
                    />
                  </span>
                {/if}
                {#if copy.components && baseComponents.length > 0}
                  <span class="summary-key"><Label label={tracker.string.ProjectCopyComponents} /></span>
                  <span class="summary-value">{baseComponents.length}</span>
                {/if}
                {#if copy.milestones && baseMilestones.length > 0}
                  <span class="summary-key"><Label label={tracker.string.ProjectCopyMilestones} /></span>
                  <span class="summary-value">{baseMilestones.length}</span>
                {/if}
                {#if copiedSettings.length > 0}
                  <span class="summary-key"><Label label={tracker.string.ProjectSummarySettings} /></span>
                  <span class="summary-value">
                    {#each copiedSettings as label}<span class="list-item"><Label {label} /></span>{/each}
                  </span>
                {/if}
                {#if notCopied.length > 0}
                  <span class="summary-key"><Label label={tracker.string.ProjectSummaryNotCopied} /></span>
                  <span class="summary-value">
                    {#each notCopied as label}<span class="list-item"><Label {label} /></span>{/each}
                  </span>
                {/if}
              </div>
            </div>
          {/if}
          {#each summaryLists as list (list.id)}
            <div class="summary-list" data-id={`project-create-summary-${list.id}`}>
              <span class="summary-list-title">
                <Label label={list.label} params={{ count: list.accounts.length }} />
              </span>
              {#each list.accounts as account (account)}
                <EmployeePresenter
                  value={$employeeRefByAccountUuidStore.get(account)}
                  avatarSize="small"
                  showPopup={false}
                />
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </Scroller>
  </div>
</WizardDialog>

<style lang="scss">
  // Every step has the same height, so the dialog does not jump; a longer one (Summary) scrolls inside.
  // The scroller clips: it is padded by the 4px focus ring of the fields (outline 2px + offset 2px)
  // and pulled out by as much, so the fields stay in line with the dialog padding.
  .step-frame {
    --_ring: 0.25rem;

    display: flex;
    flex-direction: column;
    height: calc(28rem + 2 * var(--_ring));
    margin: calc(-1 * var(--_ring));
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }
  .field {
    width: 15rem;
  }
  .field-fill,
  .field-with-error {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-0_5);
    width: 100%;
    min-width: 0;
  }
  .field-error {
    font-size: 0.75rem;
    color: var(--theme-warning-color);
  }
  .divider {
    height: 1px;
    background-color: var(--theme-divider-color);
  }
  .summary-head {
    display: flex;
    align-items: center;
    gap: var(--spacing-1_5);
  }
  .summary-title {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .summary-name {
    font-size: 1rem;
    font-weight: 500;
    color: var(--theme-caption-color);
  }
  .summary-identifier {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
  .summary-list {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-1);
  }
  .summary-list-title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .intro {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .mapping-table {
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
  }
  .mapping-row {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--theme-divider-color);

    &:first-child {
      border-top: none;
    }
    &.head {
      height: 2.25rem;
      background-color: var(--theme-list-row-color);
      border-radius: 0.5rem 0.5rem 0 0;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--theme-dark-color);
    }
  }
  .cell {
    box-sizing: border-box;
    flex: 1 1 0;
    min-width: 0;
    padding: 0.375rem 0.75rem;

    &.type {
      color: var(--theme-caption-color);
    }
  }
  .head .cell.type {
    color: inherit;
  }
  .base-value {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
  }
  .base-head {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
    font-size: 0.8125rem;
  }
  .base-name {
    display: flex;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .secondary {
    flex-shrink: 0;
    color: var(--global-secondary-TextColor);
  }
  .copy-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }
  .copy-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .copy-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    min-height: 1.5rem;
  }
  .copy-children {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-0_5);
    padding-left: var(--spacing-3);
  }
  .copy-value {
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--global-secondary-TextColor);

    &.with-chip {
      display: flex;
      align-items: center;
      gap: var(--spacing-0_5);
    }
  }
  .chevron {
    display: flex;
    transform: rotate(0deg);
    transition: transform 0.15s;

    &.open {
      transform: rotate(180deg);
    }
  }
  .footnote {
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
  }
  .summary-base {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    padding: var(--spacing-1_5);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);
  }
  .summary-grid {
    display: grid;
    grid-template-columns: 9.5rem 1fr;
    gap: var(--spacing-1) var(--spacing-1);
    align-items: center;
  }
  .summary-key {
    font-size: 0.8125rem;
    color: var(--global-secondary-TextColor);
  }
  .summary-value {
    min-width: 0;
    font-size: 0.875rem;
    color: var(--theme-caption-color);
  }
  .list-item + .list-item::before {
    content: ', ';
  }
</style>
