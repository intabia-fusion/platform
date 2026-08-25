<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { type AIContextMessage, type AITaskProposal, type AITaskProposalMessage } from '@hcengineering/ai-bot'
  import { type Doc, generateId, type Ref, type Space } from '@hcengineering/core'
  import { getResource, translate } from '@hcengineering/platform'
  import { createQuery, getClient, MessageViewer } from '@hcengineering/presentation'
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'

  import { issueDraftApplier } from '../stores'
  import { jsonToMarkup, markupToJSON, type MarkupNode } from '@hcengineering/text'
  import { markdownToMarkup } from '@hcengineering/text-markdown'
  import tracker, {
    type CreatedIssue,
    type Issue,
    type IssuePriority,
    type IssueTemplateChild,
    type Project
  } from '@hcengineering/tracker'
  import { Button, Component, DropdownLabels, type DropdownTextItem, EditBox, Label } from '@hcengineering/ui'
  import { ActivityMessageTemplate } from '@hcengineering/activity-resources'
  import { type Person } from '@hcengineering/contact'
  import { getPersonByPersonIdCb } from '@hcengineering/contact-resources'

  import plugin from '../plugin'
  import { aiBotNameStore } from '../utils'

  export let value: AITaskProposalMessage
  // Passed through by the activity feed; forwarded to the message template unchanged.
  export let showNotify: boolean = false
  export let isHighlighted: boolean = false
  export let isSelected: boolean = false
  export let shouldScroll: boolean = false
  export let embedded: boolean = false
  export let withActions: boolean = true
  export let hideFooter: boolean = false
  export let skipLabel: boolean = false

  const client = getClient()

  // The card is still a chat message: keep the standard header (avatar, name, time) and put the
  // proposal in the content slot, instead of replacing the whole message rendering.
  let person: Person | undefined
  $: if (value?.createdBy !== undefined) {
    getPersonByPersonIdCb(value.createdBy, (p) => {
      person = p ?? undefined
    })
  } else {
    person = undefined
  }

  let projects: Project[] = []
  const projectsQuery = createQuery()
  const rootQuery = createQuery()

  // A proposal made while drafting an issue in the create dialog belongs to that dialog: the
  // issue is created there, from the form the user can still edit. Creating it from the card too
  // would produce a second, half-edited issue.
  let isDraftSession = false
  // Applied proposals fold away: the thread keeps the history without a wall of repeated text.
  let collapsed = false
  $: collapsed = value.applied === true

  // No title check here: the model often changes the description only, and the panel keeps
  // whatever the proposal leaves out.
  async function applyToDraft (): Promise<void> {
    const applier = get(issueDraftApplier)
    if (applier === undefined) return
    applier(value)
    if (value.applied !== true) {
      await client.update(value, { applied: true })
    }
  }

  $: rootQuery.query(
    plugin.class.AIContextMessage,
    { _id: value.attachedTo as Ref<AIContextMessage> },
    (res) => {
      isDraftSession = res[0]?.purpose === 'issue-draft'
    },
    { limit: 1 }
  )
  projectsQuery.query(tracker.class.Project, { archived: false }, (res) => {
    projects = res
  })

  $: projectItems = projects.map((p): DropdownTextItem => ({ id: p._id, label: `${p.identifier} ${p.name}` }))
  // Explicit pick wins; otherwise the first one - same item DropdownLabels auto-selects, so the
  // shown project and the one the button creates in never disagree.
  $: project = value.project ?? projects[0]?._id
  // Splitting an existing task: only the sub-task block is shown, there is no new parent to name.
  $: isSplit = value.parent != null

  const toMarkup = (md?: string): string =>
    md != null && md.trim() !== '' ? jsonToMarkup(markdownToMarkup(md, { refUrl: 'ref://', imageUrl: '' })) : ''

  // The proposal stores plain data; the shared tracker control edits IssueTemplateChild, so map
  // once into that shape (ids exist only to key/drag rows).
  let children: IssueTemplateChild[] = []
  let selected: Array<Ref<Issue>> = []
  // Row ids are local, so remapping would lose the selection: keep it by position.
  let selectedIdx = new Set<number>()
  let mappedFrom = ''
  $: remap(value.subtasks ?? [])

  function remap (subtasks: AITaskProposal[]): void {
    const key = JSON.stringify(subtasks)
    if (key === mappedFrom) return
    const firstMap = mappedFrom === ''
    mappedFrom = key
    children = subtasks.map((s) => ({
      id: generateId<Issue>(),
      title: s.title,
      description: toMarkup(s.description),
      priority: (s.priority ?? 0) as IssuePriority,
      estimation: s.estimation ?? 0,
      assignee: null,
      component: null,
      milestone: null
    }))
    // Everything is proposed as checked; the user unchecks what they do not want.
    if (firstMap) selectedIdx = new Set(children.map((_, i) => i))
    // A row that already produced an issue can never be picked again - that is what stops a
    // second click from creating duplicates.
    for (const [i, sub] of subtasks.entries()) {
      if (sub.createdId != null) selectedIdx.delete(i)
    }
    selected = children.filter((_, i) => selectedIdx.has(i)).map((c) => c.id)
  }

  // Rows already turned into issues: shown as done, not selectable.
  $: createdRows = new Set(children.filter((_, i) => value.subtasks?.[i]?.createdId != null).map((c) => c.id))

  async function patch (data: Partial<AITaskProposalMessage>): Promise<void> {
    await client.updateDoc(value._class, value.space, value._id, data as any)
  }

  // Edits inside the control are written back so they survive a reload. Debounced: the control
  // fires an event per edited field.
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  function persistChildren (): void {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(doPersist, 300)
  }
  // Flush, don't drop: closing the panel within the debounce window would otherwise lose the edit.
  onDestroy(() => {
    if (persistTimer !== undefined) {
      clearTimeout(persistTimer)
      doPersist()
    }
  })

  function doPersist (): void {
    void patch({
      subtasks: children.map((c, i) => ({
        title: c.title,
        description: c.description !== '' ? c.description : undefined,
        priority: c.priority,
        estimation: c.estimation,
        createdId: value.subtasks?.[i]?.createdId
      }))
    })
  }

  function onProjectSelected (e: CustomEvent<string>): void {
    void patch({ project: e.detail as Ref<Space> })
  }

  function onSelect (e: CustomEvent<Array<Ref<Issue>>>): void {
    selected = e.detail.filter((id) => !createdRows.has(id))
    selectedIdx = new Set(children.map((c, i) => (selected.includes(c.id) ? i : -1)).filter((i) => i >= 0))
  }

  let creating = false
  let failure: string | undefined
  // Everything picked has an issue -> the card is done. A partial failure leaves rows unmade, so
  // the button stays available and only the missing ones are retried.
  $: pendingRows = children.filter((c, i) => selected.includes(c.id) && value.subtasks?.[i]?.createdId == null)
  $: created = (value.createdIds?.length ?? 0) > 0 && pendingRows.length === 0

  async function create (): Promise<void> {
    const target = projects.find((p) => p._id === project)
    if (target === undefined || creating) return
    creating = true
    failure = undefined
    try {
      await createAll(target)
    } catch (err: any) {
      failure = err?.message ?? String(err)
    } finally {
      creating = false
    }
  }

  async function createAll (target: Project): Promise<void> {
    // Via the platform registry: a direct import of tracker-resources would close the cycle
    // ai-bot-resources -> tracker-resources -> chunter-resources -> ai-bot-resources.
    const createIssue = await getResource(tracker.function.CreateIssue)
    const subtasks = [...(value.subtasks ?? [])]
    const fresh: CreatedIssue[] = []
    // Snapshot both before the loop: every flush below writes the document, and the resulting
    // live-query update re-runs remap, which rebuilds `children` with fresh ids and recomputes
    // `selected` from them. Reading either mid-loop would drop every row after the first flush.
    const priorCreatedIds = [...(value.createdIds ?? [])]
    const planned = children
      .map((child, i) => ({ child, i }))
      .filter(
        ({ child, i }) => selected.includes(child.id) && child.title.trim() !== '' && subtasks[i]?.createdId == null
      )

    // Persist after every issue: a failure midway must not lose what was already created.
    const flush = async (rootId?: Ref<Doc>): Promise<void> => {
      await patch({
        subtasks,
        createdIds: [...priorCreatedIds, ...fresh.map((i) => i._id)],
        project: target._id as Ref<Space>,
        ...(rootId !== undefined ? { createdRootId: rootId } : {})
      })
    }

    let root =
      value.parent != null
        ? await client.findOne(tracker.class.Issue, { _id: value.parent as Ref<Issue> })
        : value.createdRootId != null
          ? await client.findOne(tracker.class.Issue, { _id: value.createdRootId as Ref<Issue> })
          : undefined

    if (root === undefined) {
      const rootIssue = await createIssue(client, target, {
        title: value.title,
        description: toMarkup(value.description)
      })
      fresh.push(rootIssue)
      root = await client.findOne(tracker.class.Issue, { _id: rootIssue._id })
      await flush(rootIssue._id)
    }

    for (const { child, i } of planned) {
      const issue = await createIssue(client, target, {
        title: child.title,
        description: child.description,
        priority: child.priority,
        estimation: child.estimation,
        assignee: child.assignee,
        parent: root
      })
      fresh.push(issue)
      if (subtasks[i] !== undefined) subtasks[i] = { ...subtasks[i], createdId: issue._id }
      await flush()
    }

    await appendLinks(fresh)
  }

  // Append the links to THIS message rather than posting a new one: the card itself becomes the
  // record of what was created.
  async function appendLinks (issues: CreatedIssue[]): Promise<void> {
    if (issues.length === 0) return
    const label = await translate(plugin.string.TaskCreated, {})
    const refs = issues
      .map(
        (i) =>
          `[](ref://?_class=${encodeURIComponent(i._class)}&_id=${i._id}&label=${encodeURIComponent(i.identifier)})`
      )
      .join(' ')
    const links = markdownToMarkup(`${label}: ${refs}`, { refUrl: 'ref://', imageUrl: '' })
    const base: MarkupNode =
      value.message !== undefined && value.message !== ''
        ? markupToJSON(value.message)
        : ({ type: 'doc', content: [] } as unknown as MarkupNode)
    base.content = [...(base.content ?? []), ...(links.content ?? [])]
    await patch({ message: jsonToMarkup(base) })
  }
</script>

<ActivityMessageTemplate
  message={value}
  {person}
  {showNotify}
  {isHighlighted}
  {isSelected}
  {shouldScroll}
  {embedded}
  {withActions}
  {hideFooter}
  {skipLabel}
>
  <svelte:fragment slot="content">
    {#if value.message !== undefined && value.message !== ''}
      <MessageViewer message={value.message} />
    {/if}

    <div class="proposal">
      <div class="header" data-id="aiTaskProposal">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
          class="caption"
          on:click={() => {
            collapsed = !collapsed
          }}
        >
          <Label label={plugin.string.ProposedTask} params={{ name: $aiBotNameStore }} />
          {#if value.applied === true}
            <span class="applied"><Label label={plugin.string.AssistIssueAppliedMark} /></span>
          {/if}
        </span>
      </div>

      {#if !collapsed}
        {#if !isSplit}
          <div class="title">
            <EditBox
              bind:value={value.title}
              placeholder={plugin.string.TaskTitle}
              disabled={created}
              fullSize
              on:blur={() => patch({ title: value.title })}
            />
          </div>
          {#if value.description != null && value.description !== ''}
            <div class="description"><MessageViewer message={toMarkup(value.description)} /></div>
          {/if}
        {/if}
      {/if}
      {#if project !== undefined && children.length > 0 && !collapsed}
        <!-- The tracker sub-task control, rendered through the registry (no tracker-resources import). -->
        <Component
          is={tracker.component.SubtaskSection}
          props={{
            children,
            project,
            selectable: !created,
            selected,
            doneRows: createdRows,
            showDescription: true,
            listHeight: '40rem',
            readonly: created
          }}
          on:select={onSelect}
          on:update-issues={persistChildren}
          on:update-issue={persistChildren}
        />
      {/if}

      {#if failure !== undefined}
        <div class="failure">
          <Label label={plugin.string.CreateTaskFailed} />
          <span class="reason">{failure}</span>
        </div>
      {/if}

      <div class="actions">
        {#if created}
          <Button label={plugin.string.TaskCreated} kind={'ghost'} disabled />
        {:else}
          {#if projectItems.length > 1}
            <DropdownLabels
              items={projectItems}
              selected={project}
              kind={'regular'}
              size={'small'}
              showDropdownIcon
              placeholder={plugin.string.SelectProject}
              on:selected={onProjectSelected}
            />
          {/if}
          {#if isDraftSession}
            <!-- Applying belongs on the card, next to what is being applied. The button shows up
                 only where there is a form to apply to: in the chat sidebar there is none. -->
            {#if $issueDraftApplier !== undefined}
              <Button
                label={value.applied === true ? plugin.string.AssistIssueApplyAgain : plugin.string.AssistIssueApply}
                kind={value.applied === true ? 'regular' : 'primary'}
                on:click={applyToDraft}
              />
            {/if}
          {:else}
            <Button
              label={plugin.string.CreateTask}
              kind={'primary'}
              loading={creating}
              disabled={creating || project === undefined || (!isSplit && value.title.trim() === '')}
              on:click={create}
            />
          {/if}
        {/if}
      </div>
    </div>
  </svelte:fragment>
</ActivityMessageTemplate>

<style lang="scss">
  // A card, not a run of chat text: own surface, its own padding, clear bands inside.
  .proposal {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--theme-comp-header-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
  }

  .caption {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .applied {
    color: var(--theme-halfcontent-color);
  }

  .header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--theme-dark-color);
  }

  .title {
    font-size: 1rem;
    font-weight: 500;
    color: var(--theme-caption-color);
  }

  .description {
    color: var(--theme-content-color);
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.25rem;
  }

  .failure {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem 0.75rem;
    color: var(--theme-error-color);
    background: var(--theme-bg-color);
    border: 1px solid var(--theme-error-color);
    border-radius: 0.5rem;
    font-size: 0.8125rem;

    .reason {
      color: var(--theme-darker-color);
      word-break: break-word;
    }
  }
</style>
