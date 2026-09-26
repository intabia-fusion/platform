//
// Copyright © 2023 Hardcore Engineering Inc.
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

import contact, { Employee, Person } from '@hcengineering/contact'

import core, {
  AttachedData,
  Class,
  Data,
  Doc,
  DocumentUpdate,
  Ref,
  SortingOrder,
  Timestamp,
  Tx,
  TxCUD,
  TxCreateDoc,
  TxProcessor,
  TxUpdateDoc
} from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import type { TriggerControl } from '@hcengineering/server-core'
import serverTime, { ToDoFactory } from '@hcengineering/server-time'
import task, { makeRank } from '@hcengineering/task'
import time, { ProjectToDo, ToDo, ToDoPriority, WorkSlot } from '@hcengineering/time'
import tracker, { Issue, IssueStatus, Project, TimeSpendReport } from '@hcengineering/tracker'
import {
  CreateTxNotificationFunc,
  CreateNotificationResult,
  Receiver,
  TypeMatchClient,
  TypeMatchFunc
} from '@hcengineering/server-notification'
import { jsonToMarkup, nodeDoc, nodeParagraph, nodeText } from '@hcengineering/text-core'

/**
 * @public
 */
export async function OnTask (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const mixin = control.hierarchy.classHierarchyMixin<Class<Doc>, ToDoFactory>(
      tx.objectClass,
      serverTime.mixin.ToDoFactory
    )
    if (mixin !== undefined) {
      if (tx._class !== core.class.TxRemoveDoc) {
        const factory = await getResource(mixin.factory)
        result.push(...(await factory(tx, control)))
      } else {
        const todos = await control.findAll(control.ctx, time.class.ToDo, { attachedTo: tx.objectId })
        result.push(...todos.map((p) => control.txFactory.createTxRemoveDoc(p._class, p.space, p._id)))
      }
    }
  }

  return result
}

export async function OnWorkSlotUpdate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx as TxCUD<WorkSlot>
    if (!control.hierarchy.isDerived(actualTx.objectClass, time.class.WorkSlot)) {
      continue
    }
    if (!control.hierarchy.isDerived(actualTx._class, core.class.TxUpdateDoc)) {
      continue
    }
    const updTx = actualTx as TxUpdateDoc<WorkSlot>
    const { visibility, date, dueDate } = updTx.operations
    if (visibility === undefined && date === undefined && dueDate === undefined) {
      continue
    }
    const workslot = (await control.findAll(control.ctx, time.class.WorkSlot, { _id: updTx.objectId }, { limit: 1 }))[0]
    if (workslot === undefined) {
      continue
    }
    if (visibility !== undefined) {
      const todo = (await control.findAll(control.ctx, time.class.ToDo, { _id: workslot.attachedTo }))[0]
      if (todo !== undefined) {
        result.push(control.txFactory.createTxUpdateDoc(todo._class, todo.space, todo._id, { visibility }))
      }
    }
    if (date !== undefined || dueDate !== undefined) {
      const report = (
        await control.findAll(control.ctx, tracker.class.TimeSpendReport, { workslot: workslot._id }, { limit: 1 })
      )[0]
      if (report === undefined) {
        // Slots planned before reports were tied to them, and slots that started out empty,
        // get their report on the first move instead of staying invisible forever.
        const createTx = await workSlotReportTx(control, workslot)
        if (createTx !== undefined) {
          result.push(createTx)
        }
        continue
      }
      const innerTx = control.txFactory.createTxUpdateDoc(report._class, report.space, report._id, {
        date: workslot.date,
        value: workSlotHours(workslot)
      })
      result.push(
        control.txFactory.createTxCollectionCUD(
          report.attachedToClass,
          report.attachedTo,
          report.space,
          report.collection,
          innerTx
        )
      )
    }
  }
  return result
}

function workSlotHours (workslot: WorkSlot): number {
  return (workslot.dueDate - workslot.date) / 1000 / 60 / 60
}

export async function OnWorkSlotCreate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx as TxCUD<WorkSlot>
    if (!control.hierarchy.isDerived(actualTx.objectClass, time.class.WorkSlot)) {
      continue
    }
    if (!control.hierarchy.isDerived(actualTx._class, core.class.TxCreateDoc)) {
      continue
    }
    const workslot = TxProcessor.createDoc2Doc(actualTx as TxCreateDoc<WorkSlot>)
    const reportTx = await workSlotReportTx(control, workslot)
    if (reportTx !== undefined) {
      result.push(reportTx)
    }
  }
  return result
}

async function workSlotReportTx (control: TriggerControl, workslot: WorkSlot): Promise<Tx | undefined> {
  const value = workSlotHours(workslot)
  if (value <= 0) return
  const target = await getWorkSlotIssue(control, workslot)
  if (target === undefined) return
  const { issue, todo } = target
  const data: AttachedData<TimeSpendReport> = {
    employee: todo.user,
    date: workslot.date,
    value,
    description: '',
    workslot: workslot._id
  }
  const innerTx = control.txFactory.createTxCreateDoc(
    tracker.class.TimeSpendReport,
    issue.space,
    data as Data<TimeSpendReport>
  )
  return control.txFactory.createTxCollectionCUD(issue._class, issue._id, issue.space, 'reports', innerTx)
}

export async function OnWorkSlotRemove (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx as TxCUD<WorkSlot>
    if (!control.hierarchy.isDerived(actualTx.objectClass, time.class.WorkSlot)) {
      continue
    }
    if (!control.hierarchy.isDerived(actualTx._class, core.class.TxRemoveDoc)) {
      continue
    }
    const reports = await control.findAll(control.ctx, tracker.class.TimeSpendReport, { workslot: actualTx.objectId })
    for (const report of reports) {
      const innerTx = control.txFactory.createTxRemoveDoc(report._class, report.space, report._id)
      result.push(
        control.txFactory.createTxCollectionCUD(
          report.attachedToClass,
          report.attachedTo,
          report.space,
          report.collection,
          innerTx
        )
      )
    }
  }
  return result
}

async function getWorkSlotIssue (
  control: TriggerControl,
  workslot: WorkSlot
): Promise<{ issue: Issue, todo: ToDo } | undefined> {
  const todo = (await control.findAll(control.ctx, time.class.ToDo, { _id: workslot.attachedTo }))[0]
  if (todo === undefined) return
  if (!control.hierarchy.isDerived(todo.attachedToClass, tracker.class.Issue)) return
  const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: todo.attachedTo as Ref<Issue> }))[0]
  if (issue === undefined) return
  return { issue, todo }
}

/**
 * @public
 */
export async function OnToDoUpdate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx as TxCUD<ToDo>
    if (!control.hierarchy.isDerived(actualTx.objectClass, time.class.ToDo)) {
      continue
    }
    if (!control.hierarchy.isDerived(actualTx._class, core.class.TxUpdateDoc)) {
      continue
    }
    const updTx = actualTx as TxUpdateDoc<ToDo>
    const doneOn = updTx.operations.doneOn
    const title = updTx.operations.title
    const description = updTx.operations.description
    const visibility = updTx.operations.visibility
    if (doneOn != null) {
      const todo = (await control.findAll(control.ctx, time.class.ToDo, { _id: updTx.objectId }))[0]
      if (todo === undefined) {
        continue
      }
      const wasProcessed = await control.findAll(control.ctx, core.class.TxUpdateDoc, {
        objectId: todo._id,
        doneOn: { $exists: true }
      })
      // Do not process already processed todos.
      if (wasProcessed.filter((p) => p._id !== tx._id).length > 0) {
        continue
      }
      const extra: DocumentUpdate<WorkSlot> = {}
      if (title !== undefined) {
        extra.title = title
      }
      if (description !== undefined) {
        extra.description = description
      }
      result.push(...(await trimWorkSlots(control, updTx.objectId, doneOn, extra)))
      continue
    }
    if (title !== undefined || description !== undefined || visibility !== undefined) {
      const events = await control.findAll(control.ctx, time.class.WorkSlot, { attachedTo: updTx.objectId })
      for (const event of events) {
        const upd: DocumentUpdate<WorkSlot> = {}
        if (title !== undefined) {
          upd.title = title
        }
        if (description !== undefined) {
          upd.description = description
        }
        if (visibility !== undefined) {
          const newVisibility = visibility === 'public' ? 'public' : 'freeBusy'
          if (event.visibility !== newVisibility) {
            upd.visibility = newVisibility
          }
        }
        const innerTx = control.txFactory.createTxUpdateDoc(event._class, event.space, event._id, upd)
        const outerTx = control.txFactory.createTxCollectionCUD(
          event.attachedToClass,
          event.attachedTo,
          event.space,
          event.collection,
          innerTx
        )
        result.push(outerTx)
      }
    }
  }
  return result
}

/**
 * Drops the slots planned after `until` and cuts the one in progress, so the reported time follows.
 */
async function trimWorkSlots (
  control: TriggerControl,
  todoId: Ref<ToDo>,
  until: Timestamp,
  extra: DocumentUpdate<WorkSlot> = {}
): Promise<Tx[]> {
  const result: Tx[] = []
  const events = await control.findAll(control.ctx, time.class.WorkSlot, { attachedTo: todoId })
  for (const event of events) {
    let innerTx: TxCUD<WorkSlot> | undefined
    if (event.date > until) {
      innerTx = control.txFactory.createTxRemoveDoc(event._class, event.space, event._id)
    } else if (event.dueDate > until) {
      innerTx = control.txFactory.createTxUpdateDoc(event._class, event.space, event._id, { ...extra, dueDate: until })
    }
    if (innerTx === undefined) continue
    result.push(
      control.txFactory.createTxCollectionCUD(
        event.attachedToClass,
        event.attachedTo,
        event.space,
        event.collection,
        innerTx
      )
    )
  }
  return result
}

/**
 * @public
 */
export async function IssueToDoFactory (actualTx: TxCUD<Issue>, control: TriggerControl): Promise<Tx[]> {
  if (!control.hierarchy.isDerived(actualTx.objectClass, tracker.class.Issue)) return []
  if (control.hierarchy.isDerived(actualTx._class, core.class.TxCreateDoc)) {
    const issue = TxProcessor.createDoc2Doc(actualTx as TxCreateDoc<Issue>)
    return await createIssueHandler(issue, control)
  } else if (control.hierarchy.isDerived(actualTx._class, core.class.TxUpdateDoc)) {
    const updateTx = actualTx as TxUpdateDoc<Issue>
    return await updateIssueHandler(updateTx, control)
  }
  return []
}

async function createIssueHandler (issue: Issue, control: TriggerControl): Promise<Tx[]> {
  if (issue.assignee != null) {
    const project = (await control.findAll(control.ctx, task.class.Project, { _id: issue.space }))[0]
    if (project === undefined) return []
    const type = (await control.modelDb.findAll(task.class.ProjectType, { _id: project.type }))[0]
    if (!type?.classic) return []
    const status = (await control.modelDb.findAll(core.class.Status, { _id: issue.status }))[0]
    if (status === undefined) return []
    if (status.category === task.statusCategory.Active || status.category === task.statusCategory.ToDo) {
      const tx = await getCreateToDoTx(issue, issue.assignee, control)
      if (tx !== undefined) {
        await control.apply(control.ctx, [tx])
      }
    }
  }
  return []
}

async function getIssueToDoData (
  issue: Issue,
  user: Ref<Person>,
  control: TriggerControl
): Promise<AttachedData<ProjectToDo> | undefined> {
  const employee = (
    await control.findAll(control.ctx, contact.mixin.Employee, { _id: user as Ref<Employee> }, { limit: 1 })
  )[0]
  if (employee === undefined) return
  const firstTodoItem = (
    await control.findAll(
      control.ctx,
      time.class.ToDo,
      {
        user: employee._id,
        doneOn: null
      },
      {
        limit: 1,
        sort: { rank: SortingOrder.Ascending }
      }
    )
  )[0]
  const rank = makeRank(undefined, firstTodoItem?.rank)
  const data: AttachedData<ProjectToDo> = {
    attachedSpace: issue.space,
    workslots: 0,
    description: '',
    priority: ToDoPriority.NoPriority,
    visibility: 'public',
    title: issue.title,
    user: employee._id,
    doneOn: null,
    rank
  }
  return data
}

async function getCreateToDoTx (issue: Issue, user: Ref<Person>, control: TriggerControl): Promise<Tx | undefined> {
  const data = await getIssueToDoData(issue, user, control)
  if (data === undefined) return
  const innerTx = control.txFactory.createTxCreateDoc(
    time.class.ProjectToDo,
    time.space.ToDos,
    data as Data<ProjectToDo>
  )
  innerTx.space = core.space.Tx
  const outerTx = control.txFactory.createTxCollectionCUD(issue._class, issue._id, time.space.ToDos, 'todos', innerTx)
  outerTx.space = core.space.Tx
  return outerTx
}

async function changeIssueAssigneeHandler (
  control: TriggerControl,
  newAssignee: Ref<Person>,
  issueId: Ref<Issue>
): Promise<Tx[]> {
  const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: issueId }))[0]
  if (issue === undefined) return []

  const res: Tx[] = []
  const todos = await control.findAll(control.ctx, time.class.ToDo, {
    attachedTo: issue._id
  })
  const now = Date.now()
  let assigneeHasToDo = false
  for (const todo of todos) {
    if (todo.doneOn != null) continue
    if ((todo.user as Ref<Person>) === newAssignee) {
      assigneeHasToDo = true
      if (todo.reassignedTo != null) {
        res.push(control.txFactory.createTxUpdateDoc(todo._class, todo.space, todo._id, { reassignedTo: null }))
      }
      continue
    }
    // The todo stays open, its owner decides what to do with it, but the time planned ahead is freed.
    // A todo outlives the status it was created in, so this part does not check the status at all.
    res.push(control.txFactory.createTxUpdateDoc(todo._class, todo.space, todo._id, { reassignedTo: newAssignee }))
    res.push(...(await trimWorkSlots(control, todo._id, now)))
  }

  if (!assigneeHasToDo) {
    const status = (await control.modelDb.findAll(core.class.Status, { _id: issue.status }))[0]
    const inWork =
      status !== undefined &&
      (status.category === task.statusCategory.Active || status.category === task.statusCategory.ToDo)
    if (inWork) {
      const tx = await getCreateToDoTx(issue, newAssignee, control)
      if (tx !== undefined) {
        res.push(tx)
      }
    }
  }
  return res
}

async function changeIssueStatusHandler (
  control: TriggerControl,
  newStatus: Ref<IssueStatus>,
  issueId: Ref<Issue>
): Promise<Tx[]> {
  const status = (await control.modelDb.findAll(core.class.Status, { _id: newStatus }))[0]
  if (status === undefined) return []
  if (status.category === task.statusCategory.Active || status.category === task.statusCategory.ToDo) {
    const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: issueId }))[0]
    if (issue?.assignee != null) {
      const todos = await control.findAll(control.ctx, time.class.ToDo, {
        attachedTo: issue._id,
        user: issue.assignee as Ref<Employee>
      })
      if (todos.length === 0) {
        const tx = await getCreateToDoTx(issue, issue.assignee, control)
        if (tx !== undefined) {
          await control.apply(control.ctx, [tx])
        }
      }
    }
  }
  return []
}

async function changeIssueDataHandler (control: TriggerControl, issueId: Ref<Issue>): Promise<Tx[]> {
  const res: Tx[] = []
  const issue = (await control.findAll(control.ctx, tracker.class.Issue, { _id: issueId }))[0]
  if (issue !== undefined) {
    const todos = await control.findAll(control.ctx, time.class.ToDo, {
      attachedTo: issue._id
    })
    for (const todo of todos) {
      const data = await getIssueToDoData(issue, todo.user, control)
      if (data === undefined) continue
      const update: DocumentUpdate<ToDo> = {}
      if (data.title !== todo.title) {
        update.title = data.title
      }
      if (data.attachedSpace !== todo.attachedSpace) {
        update.attachedSpace = data.attachedSpace
      }
      if (Object.keys(update).length > 0) {
        const innerTx = control.txFactory.createTxUpdateDoc(todo._class, todo.space, todo._id, update)
        const outerTx = control.txFactory.createTxCollectionCUD(
          issue._class,
          issue._id,
          time.space.ToDos,
          'todos',
          innerTx
        )
        res.push(outerTx)
      }
      if (update.attachedSpace !== undefined) {
        // Workslots live in the todo's space (project or personal), keep them in sync with it.
        const workslots = await control.findAll(control.ctx, time.class.WorkSlot, { attachedTo: todo._id })
        for (const workslot of workslots) {
          const wsInnerTx = control.txFactory.createTxUpdateDoc(workslot._class, workslot.space, workslot._id, {
            space: update.attachedSpace
          })
          const wsOuterTx = control.txFactory.createTxCollectionCUD(
            workslot.attachedToClass,
            workslot.attachedTo,
            workslot.space,
            workslot.collection,
            wsInnerTx
          )
          res.push(wsOuterTx)
        }
      }
    }
  }
  return res
}

async function updateIssueHandler (tx: TxUpdateDoc<Issue>, control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  const project = (await control.findAll(control.ctx, task.class.Project, { _id: tx.objectSpace as Ref<Project> }))[0]
  if (project === undefined) return []
  const type = (await control.modelDb.findAll(task.class.ProjectType, { _id: project.type }))[0]
  if (!type?.classic) return []
  const newAssignee = tx.operations.assignee
  if (newAssignee != null) {
    res.push(...(await changeIssueAssigneeHandler(control, newAssignee, tx.objectId)))
  }
  const newStatus = tx.operations.status
  if (newStatus !== undefined) {
    res.push(...(await changeIssueStatusHandler(control, newStatus, tx.objectId)))
  }
  const name = tx.operations.title
  const space = tx.operations.space
  if (space !== undefined || name !== undefined) {
    res.push(...(await changeIssueDataHandler(control, tx.objectId)))
  }
  return res
}

const TodoCreateNotification: CreateTxNotificationFunc = async (
  _client: TypeMatchClient,
  _tx: TxCUD<Doc>,
  _attachedToDoc: Doc | undefined,
  object: Doc,
  receiver: Receiver
): Promise<CreateNotificationResult | undefined> => {
  const todo = object as ToDo

  if (todo.user !== receiver.employeeRef) return undefined

  return {
    notification: {
      header: {
        titleIntl: time.string.ToDo,
        icon: time.icon.Planned,
        objectId: todo._id,
        objectClass: todo._class
      },
      markup: jsonToMarkup(nodeDoc(nodeParagraph(nodeText(todo.title))))
    }
  }
}

const TodoReassignedMatch: TypeMatchFunc = (_client, _type, _typeObject, doc, receiver): boolean => {
  const todo = doc as ToDo
  // The same field is cleared when the task comes back, and that is not worth a notification.
  return todo.reassignedTo != null && todo.doneOn == null && todo.user === receiver.employeeRef
}

const TodoReassignedNotification: CreateTxNotificationFunc = async (
  _client: TypeMatchClient,
  _tx: TxCUD<Doc>,
  _attachedToDoc: Doc | undefined,
  object: Doc,
  receiver: Receiver
): Promise<CreateNotificationResult | undefined> => {
  const todo = object as ToDo

  if (todo.user !== receiver.employeeRef) return undefined

  return {
    notification: {
      header: {
        titleIntl: time.string.ToDoReassigned,
        icon: time.icon.Planned,
        objectId: todo._id,
        objectClass: todo._class
      },
      markup: jsonToMarkup(nodeDoc(nodeParagraph(nodeText(todo.title))))
    }
  }
}

async function hasOpenToDo (client: TypeMatchClient, issue: Issue, receiver: Receiver): Promise<boolean> {
  const todos = await client.findAll(
    client.ctx,
    time.class.ToDo,
    { attachedTo: issue._id, user: receiver.employeeRef, doneOn: null },
    { limit: 1 }
  )
  return todos.length > 0
}

const IssueClosedToDoMatch: TypeMatchFunc = async (
  client: TypeMatchClient,
  _type,
  _typeObject,
  doc: Doc,
  receiver: Receiver
): Promise<boolean> => {
  const issue = doc as Issue
  const status = (await client.modelDb.findAll(core.class.Status, { _id: issue.status }))[0]
  if (status === undefined) return false
  if (status.category !== task.statusCategory.Won && status.category !== task.statusCategory.Lost) return false
  return await hasOpenToDo(client, issue, receiver)
}

const IssueClosedToDoNotification: CreateTxNotificationFunc = async (
  _client: TypeMatchClient,
  _tx: TxCUD<Doc>,
  _attachedToDoc: Doc | undefined,
  object: Doc,
  _receiver: Receiver
): Promise<CreateNotificationResult | undefined> => {
  // The receiver got here only through IssueClosedToDoMatch, which already checked the todo.
  const issue = object as Issue

  return {
    notification: {
      header: {
        titleIntl: time.string.IssueClosedCloseToDo,
        icon: time.icon.Planned,
        objectId: issue._id,
        objectClass: issue._class
      },
      markup: jsonToMarkup(nodeDoc(nodeParagraph(nodeText(issue.title))))
    }
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  function: {
    IssueToDoFactory,
    TodoCreateNotification,
    TodoReassignedNotification,
    TodoReassignedMatch,
    IssueClosedToDoNotification,
    IssueClosedToDoMatch
  },
  trigger: {
    OnTask,
    OnToDoUpdate,
    OnWorkSlotCreate,
    OnWorkSlotUpdate,
    OnWorkSlotRemove
  }
})
