//
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
//

import core, { type Doc, type Ref, type Status, type StatusCategory, type TxOperations } from '@hcengineering/core'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'

import workflow from '../../plugin'
import type { Workflow, WorkflowTransition } from '../../schema'
import {
  checkWorkflowCompatibility,
  exportWorkflow,
  exportWorkflowConfig,
  importWorkflowConfig,
  type WorkflowConfig,
  type WorkflowImportResolution
} from '../../transfer'
import { type StatusRuleTarget, loadStatusRuleTarget, remapStatusRuleProps } from '../../transfer/statusRules'
import { createMockTx, ws1 } from './fixtures'

const todo = task.statusCategory.ToDo
const won = task.statusCategory.Won
const lost = task.statusCategory.Lost

function taskType (_id: string, name: string, parent: string, statuses: string[]): Doc {
  return { _id, _class: task.class.TaskType, name, parent, statuses } as unknown as Doc
}

function status (_id: string, name: string, category: Ref<StatusCategory>): Doc {
  return { _id, _class: core.class.Status, name, color: 1, category } as unknown as Doc
}

const ref = <T extends Doc>(id: string): Ref<T> => id as Ref<T>

// Issue's "Done" has the smallest ref: matching statuses by name across task types gives it to every row.
const source = {
  projectType: ref<ProjectType>('pt-src'),
  issue: ref<TaskType>('tt-src-issue'),
  bug: ref<TaskType>('tt-src-bug'),
  story: ref<TaskType>('tt-src-story'),
  issueDone: ref<Status>('st-a-done-i'),
  bugDone: ref<Status>('st-b-done-b'),
  bugVerified: ref<Status>('st-b-verified-b'),
  storyDone: ref<Status>('st-c-done-s')
}

const sourceDocs: Doc[] = [
  taskType(source.issue, 'Issue', source.projectType, ['st-a-backlog-i', source.issueDone]),
  taskType(source.bug, 'Bug', source.projectType, ['st-b-open-b', source.bugDone, source.bugVerified]),
  taskType(source.story, 'Story', source.projectType, ['st-c-todo-s', source.storyDone]),
  status('st-a-backlog-i', 'Backlog', todo),
  status(source.issueDone, 'Done', won),
  status('st-b-open-b', 'Open', todo),
  status(source.bugDone, 'Done', won),
  status(source.bugVerified, 'Verified', won),
  status('st-c-todo-s', 'Todo', todo),
  status(source.storyDone, 'Done', won),
  {
    _id: 'wf-src',
    _class: workflow.class.Workflow,
    name: 'Main',
    projectType: source.projectType,
    taskType: source.issue,
    initialStatuses: ['st-a-backlog-i']
  } as unknown as Doc,
  {
    _id: 'tr-src-close',
    _class: workflow.class.WorkflowTransition,
    attachedTo: 'wf-src',
    name: 'Close',
    from: ['st-a-backlog-i'],
    to: source.issueDone,
    rank: '0|i00000:',
    validators: [
      {
        id: 'subtasks',
        rule: workflow.validator.SubtaskStatus,
        ruleClass: workflow.class.WorkflowValidator,
        props: {
          statuses: { [source.bug]: [source.bugDone, source.bugVerified], [source.issue]: [source.issueDone] },
          categories: { [source.bug]: [lost] },
          defaultCategories: [won]
        }
      },
      {
        id: 'parent',
        rule: workflow.validator.ParentStatus,
        ruleClass: workflow.class.WorkflowValidator,
        props: { statuses: { [source.issue]: null } }
      }
    ]
  } as unknown as Doc
]

// The same workspace, another project type: no "Verified" and no "Done" for bugs, the type name differs in case.
const sibling = {
  projectType: ref<ProjectType>('pt-dst'),
  issue: ref<TaskType>('tt-dst-issue'),
  bug: ref<TaskType>('tt-dst-bug'),
  issueDone: ref<Status>('st-d-done-i')
}

const siblingDocs: Doc[] = [
  taskType(sibling.issue, 'Issue', sibling.projectType, ['st-d-todo-i', sibling.issueDone]),
  taskType(sibling.bug, 'bug', sibling.projectType, ['st-d-open-b', 'st-d-closed-b']),
  status('st-d-todo-i', 'Todo', todo),
  status(sibling.issueDone, 'Done', won),
  status('st-d-open-b', 'Open', todo),
  status('st-d-closed-b', 'Closed', won)
]

async function exportSource (): Promise<WorkflowConfig> {
  const config = await exportWorkflow(createMockTx({ docs: sourceDocs }), ref<Workflow>('wf-src'), {
    workspace: ws1,
    projectTypeId: source.projectType
  })
  // The file goes through JSON on the way to another workspace
  return JSON.parse(JSON.stringify(config))
}

async function importInto (
  client: TxOperations,
  projectType: Ref<ProjectType>,
  resolution: WorkflowImportResolution
): Promise<{ props: Record<string, any>, warnings: Array<Record<string, string>> }> {
  const config = await exportSource()
  const report = await checkWorkflowCompatibility(client, config, resolution.targetTaskTypeId as Ref<TaskType>)
  await importWorkflowConfig(client, projectType, config, resolution)

  const calls = (client.updateCollection as jest.Mock).mock.calls.filter((c) => c[6]?.validators !== undefined)
  expect(calls).toHaveLength(1)
  const props: Record<string, any> = {}
  for (const v of calls[0][6].validators) props[v.id] = v.props
  return {
    props,
    warnings: report.warnings.filter((w) => w.kind === 'rule').map((w) => ({ message: w.message, ...w.params }))
  }
}

const exactProps = {
  subtasks: {
    statuses: { [source.bug]: [source.bugDone, source.bugVerified], [source.issue]: [source.issueDone] },
    categories: { [source.bug]: [lost] },
    defaultCategories: [won]
  },
  parent: { statuses: { [source.issue]: null } }
}

describe('subtask and parent status rules transfer', () => {
  it('exports rule statuses with their categories', async () => {
    const config = await exportSource()

    // Bug's own "Done" is not the one the name resolves to, it is still written by name
    expect(config.workflows[0].transitions?.[0].validators?.[0].props.statuses).toEqual({
      '$taskType:Bug': ['$status:Done', '$status:Verified'],
      '$taskType:Issue': ['$status:Done']
    })

    expect(config.ruleStatuses?.map((s) => [s.id, s.name, s.category])).toEqual([
      [source.bugDone, 'Done', won],
      [source.bugVerified, 'Verified', won],
      [source.issueDone, 'Done', won]
    ])
    // The status mapping step works on the statuses of the workflow itself only
    expect(config.statuses?.map((s) => s.id)).toEqual(['st-a-backlog-i', source.issueDone])
  })

  it('exports rule statuses of the whole project type too', async () => {
    const config = await exportWorkflowConfig(createMockTx({ docs: sourceDocs }), source.projectType, {
      workspace: ws1,
      projectTypeId: source.projectType
    })

    expect(config.ruleStatuses?.map((s) => s.id).sort()).toEqual([source.issueDone, source.bugDone, source.bugVerified])
  })

  it('imports into the same task type as is', async () => {
    const client = createMockTx({ docs: sourceDocs })
    const result = await importInto(client, source.projectType, { targetTaskTypeId: source.issue })

    expect(result).toEqual({ props: exactProps, warnings: [] })
  })

  it('keeps rows of other task types when bound to another task type of the project type', async () => {
    const client = createMockTx({ docs: sourceDocs })
    const result = await importInto(client, source.projectType, { targetTaskTypeId: source.story, name: 'Stories' })

    expect(result).toEqual({ props: exactProps, warnings: [] })
  })

  it('matches rows by task type name in another project type and falls back to categories', async () => {
    const client = createMockTx({ docs: [...sourceDocs, ...siblingDocs] })
    const result = await importInto(client, sibling.projectType, { targetTaskTypeId: sibling.issue })

    expect(result.props).toEqual({
      subtasks: {
        statuses: { [sibling.issue]: [sibling.issueDone] },
        categories: { [sibling.bug]: [won, lost] },
        defaultCategories: [won]
      },
      parent: { statuses: { [sibling.issue]: null } }
    })
    expect(result.warnings).toEqual([
      {
        message: workflow.string.ImportWarningRuleStatusToCategory,
        rule: 'SubtaskStatus',
        transition: 'Close',
        taskType: 'bug',
        status: 'Done',
        category: won
      },
      {
        message: workflow.string.ImportWarningRuleStatusToCategory,
        rule: 'SubtaskStatus',
        transition: 'Close',
        taskType: 'bug',
        status: 'Verified',
        category: won
      }
    ])
  })

  it('drops rows of task types missing in another workspace', async () => {
    const issue = ref<TaskType>('tt-x-issue')
    const client = createMockTx({
      docs: [
        taskType(issue, 'Issue', 'pt-x', ['st-x-backlog', 'st-x-done']),
        status('st-x-backlog', 'Backlog', todo),
        status('st-x-done', 'Done', won)
      ]
    })
    const result = await importInto(client, ref<ProjectType>('pt-x'), { targetTaskTypeId: issue })

    expect(result.props).toEqual({
      subtasks: { statuses: { [issue]: ['st-x-done'] }, defaultCategories: [won] },
      parent: { statuses: { [issue]: null } }
    })
    expect(result.warnings).toEqual([
      {
        message: workflow.string.ImportWarningRuleTaskTypeMissing,
        rule: 'SubtaskStatus',
        transition: 'Close',
        taskType: 'Bug'
      }
    ])
  })

  it('imports into a workspace with other names without failing', async () => {
    const own = ref<TaskType>('tt-y-task')
    const client = createMockTx({
      docs: [
        taskType(own, 'Задача', 'pt-y', ['st-y-new', 'st-y-done']),
        status('st-y-new', 'Новая', todo),
        status('st-y-done', 'Готово', won)
      ]
    })
    const result = await importInto(client, ref<ProjectType>('pt-y'), { targetTaskTypeId: own })

    // Only the default categories survive, the parent rule has nothing left
    expect(result.props).toEqual({ subtasks: { statuses: {}, defaultCategories: [won] } })
    expect(result.warnings.map((w) => [w.rule, w.taskType])).toEqual([
      ['SubtaskStatus', 'Bug'],
      ['SubtaskStatus', 'Issue'],
      ['ParentStatus', 'Issue']
    ])
  })
})

describe('rule rows of the workflow task type', () => {
  const issue = ref<TaskType>('tt-c-issue')
  const done = ref<Status>('st-c-done')

  // The workflow goes Review -> Done, the target has no Review and no status in its category
  function config (): WorkflowConfig {
    return {
      version: 1,
      exportDate: '',
      workspace: ws1,
      projectTypeId: ref<ProjectType>('pt-src'),
      statuses: [
        { id: ref<Status>('src-review'), name: 'Review', color: 1, category: todo },
        { id: ref<Status>('src-done'), name: 'Done', color: 1, category: won }
      ],
      workflows: [
        {
          id: ref<Workflow>('wf-c'),
          name: 'Main',
          taskTypeName: 'Issue',
          taskTypeId: issue,
          transitions: [
            {
              id: ref<WorkflowTransition>('tr-c'),
              name: 'Close',
              from: [ref<Status>('src-review')],
              to: ref<Status>('src-done'),
              validators: [
                {
                  id: 'subtasks',
                  rule: workflow.validator.SubtaskStatus,
                  ruleClass: workflow.class.WorkflowValidator,
                  props: { statuses: { '$taskType:Issue': ['$status:Review', '$status:Verified'] } }
                }
              ]
            }
          ]
        }
      ]
    }
  }

  function client (): TxOperations {
    const result = createMockTx({
      docs: [taskType(issue, 'Issue', 'pt-c', [done]), status(done, 'Done', won)]
    })
    // Missing statuses are created for the status attribute of the task type class
    const statusAttr = { _id: 'attr-status', name: 'status', type: { _class: core.class.RefTo, to: core.class.Status } }
    ;(result.getHierarchy().getAllAttributes as jest.Mock).mockReturnValue(new Map([['status', statusAttr]]))
    return result
  }

  function savedRule (tx: TxOperations): Record<string, any> | undefined {
    const call = (tx.updateCollection as jest.Mock).mock.calls.find((c) => c[6]?.validators !== undefined)
    return call?.[6].validators[0].props
  }

  it('takes a status the import creates', async () => {
    const tx = client()
    const resolution: WorkflowImportResolution = {
      targetTaskTypeId: issue,
      createMissingStatuses: true,
      statusMap: { [ref<Status>('src-done')]: done }
    }
    await importWorkflowConfig(tx, ref<ProjectType>('pt-c'), config(), resolution)

    const created = resolution.statusMap?.[ref<Status>('src-review')]
    expect(created).toBeDefined()
    expect(savedRule(tx)).toEqual({ statuses: { [issue]: [created] } })
  })

  it('takes the status the wizard mapped', async () => {
    const tx = client()
    await importWorkflowConfig(tx, ref<ProjectType>('pt-c'), config(), {
      targetTaskTypeId: issue,
      statusMap: { [ref<Status>('src-review')]: done, [ref<Status>('src-done')]: done }
    })

    expect(savedRule(tx)).toEqual({ statuses: { [issue]: [done] } })
  })

  it('warns only about statuses the status mapping does not cover', async () => {
    const report = await checkWorkflowCompatibility(client(), config(), issue)

    expect(report.warnings.filter((w) => w.kind === 'rule').map((w) => w.params.status)).toEqual(['Verified'])
  })
})

describe('remapStatusRuleProps', () => {
  const issue = ref<TaskType>('tt-z-issue')
  const done = ref<Status>('st-z-done')

  async function target (config: Partial<WorkflowConfig> = {}): Promise<StatusRuleTarget> {
    const client = createMockTx({
      docs: [taskType(issue, 'Issue', 'pt-z', [done]), status(done, 'Done', won)]
    })
    return await loadStatusRuleTarget(client, ref<ProjectType>('pt-z'), {
      version: 1,
      exportDate: '',
      workspace: ws1,
      projectTypeId: ref<ProjectType>('pt-z'),
      workflows: [],
      ...config
    })
  }

  it('keeps raw refs that exist in the target task type', async () => {
    const result = remapStatusRuleProps({ statuses: { [issue]: [done] } }, await target())

    expect(result).toEqual({ props: { statuses: { [issue]: [done] } }, issues: [] })
  })

  it('drops a status that has no category to fall back to', async () => {
    const result = remapStatusRuleProps(
      { statuses: { '$taskType:Issue': ['$status:Done', '$status:Review'] } },
      await target()
    )

    expect(result).toEqual({
      props: { statuses: { [issue]: [done] } },
      issues: [{ kind: 'status', taskType: 'Issue', status: 'Review' }]
    })
  })

  it('takes the category of a missing status from the config statuses', async () => {
    const result = remapStatusRuleProps(
      { statuses: { '$taskType:Issue': ['$status:Accepted'] } },
      await target({ statuses: [{ id: ref<Status>('st-accepted'), name: 'Accepted', color: 1, category: won }] })
    )

    expect(result).toEqual({
      props: { statuses: {}, categories: { [issue]: [won] } },
      issues: [{ kind: 'category', taskType: 'Issue', status: 'Accepted', category: won }]
    })
  })

  it('does not fall back to a category the task type has no status in', async () => {
    const result = remapStatusRuleProps(
      { statuses: { '$taskType:Issue': ['$status:Review'] } },
      await target({ statuses: [{ id: ref<Status>('st-review'), name: 'Review', color: 1, category: todo }] })
    )

    expect(result).toEqual({ issues: [{ kind: 'status', taskType: 'Issue', status: 'Review' }] })
  })

  it('drops unknown categories and broken props', async () => {
    const t = await target()

    expect(
      remapStatusRuleProps(
        { statuses: { '$taskType:Issue': 'Done' }, categories: { '$taskType:Issue': ['custom'] } },
        t
      )
    ).toEqual({ issues: [] })
    expect(remapStatusRuleProps({ statuses: [], defaultCategories: ['custom', won] }, t)).toEqual({
      props: { statuses: {}, defaultCategories: [won] },
      issues: []
    })
  })
})
