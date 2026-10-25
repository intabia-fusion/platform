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
  import type { Employee } from '@hcengineering/contact'
  import type { AccountUuid, Data, Ref, Role, RolesAssignment } from '@hcengineering/core'
  import core, { generateId, getCurrentAccount, notEmpty, SortingOrder } from '@hcengineering/core'
  import { EmployeePresenter, employeeRefByAccountUuidStore } from '@hcengineering/contact-resources'
  import { getEmbeddedLabel, type Asset } from '@hcengineering/platform'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import type { Project as TaskProject, ProjectType, TaskType } from '@hcengineering/task'
  import task from '@hcengineering/task'
  import { taskTypeStore, typeStore } from '@hcengineering/task-resources'
  import type { IssueStatus, Project } from '@hcengineering/tracker'
  import { TimeReportDayType, TrackerEvents } from '@hcengineering/tracker'
  import ui, {
    getColorNumberByText,
    Label,
    ModernPopupLabels,
    Scroller,
    showPopup,
    type DropdownTextItem
  } from '@hcengineering/ui'
  import { Callout, SelectButton, SettingRow, TextArea, TextInput, Toggle, WizardDialog } from '@hcengineering/ui/kit'
  import { IconPicker, statusStore } from '@hcengineering/view-resources'
  import type { ProjectWorkflow, Workflow } from '@hcengineering/workflow'
  import workflow from '@hcengineering/workflow'

  import tracker from '../../plugin'
  import { applyRoles, isAccessValid, mergeOwners, removeFromRoles } from '../../projectSettingsLogic'
  import ProjectAssigneeSelect from './settings/ProjectAssigneeSelect.svelte'
  import ProjectIconTile from './settings/ProjectIconTile.svelte'
  import ProjectMembersTable from './settings/ProjectMembersTable.svelte'
  import ProjectStatusSelect from './settings/ProjectStatusSelect.svelte'
  import ProjectWorkflowSelect from './settings/ProjectWorkflowSelect.svelte'

  export let namePlaceholder: string = ''
  export let descriptionPlaceholder: string = ''

  type Step = 'general' | 'members' | 'issues' | 'workflow' | 'summary'
  const steps = [
    { id: 'general' as const, label: tracker.string.ProjectSettingsGeneral },
    { id: 'members' as const, label: tracker.string.ProjectSettingsAccess },
    { id: 'issues' as const, label: tracker.string.ProjectSettingsIssues },
    { id: 'workflow' as const, label: tracker.string.ProjectSettingsWorkflow },
    { id: 'summary' as const, label: tracker.string.ProjectWizardSummary }
  ]
  let step: Step = 'general'

  const client = getClient()
  // The creator stays a member and the owner of the project: the wizard locks their row
  const me = getCurrentAccount().uuid
  const dispatch = createEventDispatcher()

  let name: string = namePlaceholder
  let description: string = descriptionPlaceholder
  // Comes from the name, so an empty wizard does not start with a taken default
  let identifier: string = toIdentifier(name)
  let isPrivate: boolean = false
  let icon: Asset = tracker.icon.Home
  let color = getColorNumberByText(name)
  let isColorSelected = false
  let defaultAssignee: Ref<Employee> | undefined = undefined
  let defaultStatusId: Ref<IssueStatus> | undefined = undefined
  let members: AccountUuid[] = [me]
  let owners: AccountUuid[] = [me]
  let membersChanged: boolean = false
  let rolesAssignment: RolesAssignment = {}
  let workflowsMapping: Record<Ref<TaskType>, Ref<Workflow>> = {}
  let projectsIdentifiers = new Set<string>()
  let isSaving = false
  // Bumped on a rejected role change to rebuild the role fields
  let resetKey = 0

  let types: ProjectType[] = []
  let typeId: Ref<ProjectType> | undefined
  $: typeType = typeId !== undefined ? $typeStore.get(typeId) : undefined

  const projectsQuery = createQuery()
  const typesQuery = createQuery()
  const rolesQuery = createQuery()
  const workflowsQuery = createQuery()

  $: projectsQuery.query(tracker.class.Project, {}, (res) => {
    projectsIdentifiers = new Set(res.map(({ identifier }) => identifier))
  })

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

  $: identifier = identifier.toLocaleUpperCase().replaceAll('-', '_').replaceAll(' ', '_').substring(0, 5)
  $: identifierExists = !isSaving && projectsIdentifiers.has(identifier.toUpperCase())

  $: generalValid = typeId !== undefined && name.trim().length > 0 && identifier.trim().length > 0 && !identifierExists
  $: accessValid = isAccessValid(isPrivate, mergeOwners(members, owners), owners)
  $: canSave = generalValid && accessValid
  $: canProceed = step === 'general' ? generalValid : step === 'members' ? accessValid : true

  let typeOpened = false

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
          <SettingRow kind="column" label={task.string.ProjectType} hint={tracker.string.ProjectTypeHint} fullWidth>
            <SelectButton
              data-id="project-type"
              label={typeType !== undefined ? getEmbeddedLabel(typeType.name) : undefined}
              placeholder={task.string.ProjectType}
              field
              fullWidth
              chevron
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

          <SettingRow kind="column" label={tracker.string.Description} fullWidth let:labelId>
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

          <SettingRow kind="column" label={tracker.string.ProjectSettingsIcon}>
            <ProjectIconTile id="project-icon" {icon} {color} {name} on:click={chooseIcon} />
          </SettingRow>
        {:else if step === 'members'}
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
</style>
