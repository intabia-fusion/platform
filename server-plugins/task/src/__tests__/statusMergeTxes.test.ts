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

import core, { systemAccount, TxOperations, type Client, type MeasureContext, type Tx } from '@hcengineering/core'
import { NormalizeTxMiddleware } from '@hcengineering/middleware'
import task from '@hcengineering/task'
import { mergeStatuses } from '../statusMergeOps'

const WF = 'workflow:class:Workflow'
const TR = 'workflow:class:WorkflowTransition'
const DUM = 'activity:class:DocUpdateMessage'
const FV = 'view:class:FilteredView'

const matches = (doc: any, query: Record<string, any>): boolean =>
  Object.entries(query).every(([k, v]) => (v?.$in !== undefined ? (v.$in as any[]).includes(doc[k]) : doc[k] === v))

const base = (id: string, _class: string, extra: Record<string, any> = {}): any => ({
  _id: id,
  _class,
  space: 'core:space:Workspace',
  modifiedBy: '9040845210464455032',
  modifiedOn: 1788351422729,
  ...extra
})

// Docs shaped like the ones the pipeline returns; the real TxOperations builds the txes.
function docs (): any[] {
  const status = (id: string): any =>
    base(id, core.class.Status, { name: id, ofAttribute: 'attr', category: 'active', space: core.space.Model })
  return [
    status('a'),
    status('b'),
    status('o'),
    base('P', task.class.ProjectType, {
      space: core.space.Model,
      tasks: ['T1'],
      statuses: [
        { _id: 'a', taskType: 'T1' },
        { _id: 'b', taskType: 'T1' },
        { _id: 'o', taskType: 'T1' }
      ]
    }),
    base('T1', task.class.TaskType, { space: core.space.Model, statuses: ['a', 'b', 'o'] }),
    base('t1', task.class.Task, {
      kind: 'T1',
      status: 'b',
      space: 'prj',
      attachedTo: 'parent',
      attachedToClass: task.class.Task,
      collection: 'subIssues'
    }),
    base('prj', task.class.Project, { type: 'P', defaultIssueStatus: 'b', space: core.space.Space }),
    base('w1', WF, { projectType: 'P', initialStatuses: ['b', 'o'] }),
    base('tr1', TR, {
      attachedTo: 'w1',
      attachedToClass: WF,
      collection: 'transitions',
      rank: '1',
      name: 'in',
      from: ['o'],
      to: 'b'
    }),
    base('tr2', TR, {
      attachedTo: 'w1',
      attachedToClass: WF,
      collection: 'transitions',
      rank: '2',
      name: 'out',
      from: ['b'],
      to: 'o'
    }),
    base('m1', DUM, {
      action: 'update',
      space: 'prj',
      attributeUpdates: { attrKey: 'status', set: ['b'] },
      attachedTo: 'x',
      attachedToClass: 'c',
      collection: 'c'
    }),
    base('f1', FV, { filters: '{"status":["b"]}', space: core.space.Workspace })
  ]
}

describe('txes of the status merge', () => {
  it('every tx passes the real NormalizeTxMiddleware', async () => {
    const data = docs()
    const txes: Tx[] = []
    const known = new Set([WF, TR, DUM, FV])
    const client = {
      getHierarchy: () =>
        ({
          hasClass: (c: string) => known.has(c),
          hasMixin: () => false,
          isMixin: () => false,
          isDerived: (c: string, b: string) =>
            b === core.class.AttachedDoc && [TR, DUM, task.class.Task].includes(c as any)
        }) as any,
      getModel: () => ({}) as any,
      findAll: async (_class: string, query: Record<string, any> = {}) =>
        data
          .filter((d) => d._class === _class && matches(d, query))
          .map((d) => {
            // the lookup middleware drops scalar query fields from the docs it returns
            const copy = { ...d }
            for (const [k, v] of Object.entries(query)) {
              if (typeof v === 'string' && copy[k] === v) delete copy[k] // eslint-disable-line @typescript-eslint/no-dynamic-delete
            }
            return copy
          }),
      findOne: async (_class: string, query: Record<string, any> = {}) =>
        data.find((d) => d._class === _class && matches(d, query)),
      tx: async (tx: Tx) => {
        txes.push(tx)
        const cud = tx as any
        const at = data.findIndex((d) => d._id === cud.objectId)
        if (tx._class === core.class.TxUpdateDoc) Object.assign(data[at], cud.operations)
        if (tx._class === core.class.TxRemoveDoc) data.splice(at, 1)
        return {}
      },
      close: async () => {},
      domainRequest: async () => ({ domain: '' as any, value: null }),
      searchFulltext: async () => ({ docs: [] })
    } as unknown as Client

    // a stored (not model) status has no colons, so the source is removed as well
    const res = await mergeStatuses(
      { client: new TxOperations(client, core.account.System), flush: async () => {} },
      { projectType: 'P' as any, target: 'a' as any, sources: ['b' as any] }
    )
    expect(res.ok).toBe(true)
    const classes = new Set(txes.map((t) => (t as any).objectClass))
    // workflow, transition, task type, project type, task, project, message, filter and the removed status
    expect(classes).toEqual(
      new Set([
        WF,
        TR,
        task.class.TaskType,
        task.class.ProjectType,
        task.class.Task,
        task.class.Project,
        DUM,
        FV,
        core.class.Status
      ])
    )

    const mw = await NormalizeTxMiddleware.create({} as any, {} as any, undefined)
    const ctx = { contextData: { account: systemAccount }, warn: () => {} } as unknown as MeasureContext<any>
    // BadRequest is thrown for the whole batch when any tx cannot be parsed
    await expect(mw.tx(ctx, JSON.parse(JSON.stringify(txes)))).resolves.toBeDefined()
    for (const t of txes) await expect(mw.tx(ctx, [JSON.parse(JSON.stringify(t))])).resolves.toBeDefined()
    expect(txes.every((t) => t.meta?.silent === true)).toBe(true)
  })
})
