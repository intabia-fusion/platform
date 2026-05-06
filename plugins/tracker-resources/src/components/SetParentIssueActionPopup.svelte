<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import core, { AttachedData, FindOptions, type Rank, Ref, SortingOrder } from '@hcengineering/core'
  import { ObjectPopup, getClient } from '@hcengineering/presentation'
  import task, { makeRank, TaskType } from '@hcengineering/task'
  import { Issue, IssueDraft } from '@hcengineering/tracker'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../plugin'
  import IssueStatusIcon from './issues/IssueStatusIcon.svelte'

  export let value: Issue | AttachedData<Issue> | Issue[] | IssueDraft
  export let width: 'medium' | 'large' | 'full' = 'large'
  export let kind: Ref<TaskType> | undefined

  const client = getClient()
  const dispatch = createEventDispatcher()

  let allowedParentKinds: Ref<TaskType>[] | undefined = undefined

  $: effectiveKind = kind ?? (!Array.isArray(value) && 'kind' in value ? value.kind : undefined)

  $: if (effectiveKind !== undefined) {
    void client.findOne(task.class.TaskType, { _id: effectiveKind }).then((taskType) => {
      allowedParentKinds = taskType?.allowedAsChildOf
    })
  } else {
    allowedParentKinds = undefined
  }

  const options: FindOptions<Issue> = {
    lookup: {
      status: [tracker.class.IssueStatus, { category: core.class.StatusCategory }]
    },
    sort: { modifiedOn: SortingOrder.Descending }
  }

  // Filter shown issues to only those whose kind is allowed as parent of the task kind.
  // allowedParentKinds === undefined  → no kind info, show all
  // allowedParentKinds === []         → no parents configured, show nothing
  // allowedParentKinds.length > 0     → filter by kinds, then check existence
  $: docQuery = allowedParentKinds !== undefined ? { kind: { $in: allowedParentKinds } } : {}

  // True once we know there are no issues of the allowed parent types in this space
  let noParentIssuesExist: boolean = false

  $: if (allowedParentKinds !== undefined && allowedParentKinds.length === 0) {
    // No parent types configured at all
    noParentIssuesExist = true
  } else if (allowedParentKinds !== undefined && allowedParentKinds.length > 0) {
    void client
      .findOne(tracker.class.Issue, { kind: { $in: allowedParentKinds } }, { projection: { _id: 1 } })
      .then((found) => {
        noParentIssuesExist = found === undefined
      })
  } else {
    noParentIssuesExist = false
  }

  async function onClose ({ detail: parentIssue }: CustomEvent<Issue | undefined | null>): Promise<void> {
    const vv = Array.isArray(value) ? value : [value]
    for (const docValue of vv) {
      if (
        '_class' in docValue &&
        parentIssue !== undefined &&
        parentIssue?._id !== docValue.attachedTo &&
        parentIssue?._id !== docValue._id
      ) {
        let rank: Rank | null = null

        if (parentIssue) {
          const lastAttachedIssue = await client.findOne<Issue>(
            tracker.class.Issue,
            { attachedTo: parentIssue._id },
            { sort: { rank: SortingOrder.Descending } }
          )

          rank = makeRank(lastAttachedIssue?.rank, undefined)
        }

        await client.update(docValue, {
          attachedTo: parentIssue === null ? tracker.ids.NoParent : parentIssue._id,
          ...(rank ? { rank } : {})
        })
      }
    }

    dispatch('close', parentIssue)
  }

  $: selected = !Array.isArray(value) ? ('attachedTo' in value ? value.attachedTo : undefined) : undefined
  $: ignoreObjects = getIgnoreObjects(value)

  function getIgnoreObjects (issues: Issue | AttachedData<Issue> | Issue[] | IssueDraft): Ref<Issue>[] {
    if (!Array.isArray(issues)) {
      const own = '_id' in issues ? issues._id : undefined
      const childs = 'childInfo' in issues ? issues.childInfo.map((c) => c.childId) : []
      return own !== undefined ? [own, ...childs] : childs
    } else {
      const res = new Set<Ref<Issue>>()
      for (const issue of issues) {
        const own = '_id' in issue ? issue._id : undefined
        const childs = 'childInfo' in issue ? issue.childInfo.map((c) => c.childId) : []
        if (own !== undefined) {
          res.add(own)
          for (const child of childs) {
            res.add(child)
          }
        } else {
          for (const child of childs) {
            res.add(child)
          }
        }
      }
      return [...res]
    }
  }
</script>

<ObjectPopup
  _class={tracker.class.Issue}
  {options}
  {docQuery}
  {selected}
  category={tracker.completion.IssueCategory}
  multiSelect={false}
  allowDeselect={true}
  placeholder={noParentIssuesExist ? tracker.string.NoParentIssuesExist : tracker.string.SetParent}
  create={undefined}
  {ignoreObjects}
  shadows={true}
  {width}
  searchMode={'spotlight'}
  on:update
  on:close={onClose}
>
  <svelte:fragment slot="item" let:item={issue}>
    <div class="flex-center clear-mins w-full h-9">
      {#if issue?.$lookup?.status}
        <div class="icon mr-4 h-8">
          <IssueStatusIcon value={issue.$lookup.status} taskType={issue.kind} space={issue.space} size="small" />
        </div>
      {/if}
      <span class="overflow-label flex-no-shrink mr-3">{issue.identifier}</span>
      <span class="overflow-label w-full content-color">{issue.title}</span>
    </div>
  </svelte:fragment>
</ObjectPopup>
