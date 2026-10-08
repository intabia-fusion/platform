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

import { type TriggerControl } from '@hcengineering/server-core'
import { type Task } from '@hcengineering/task'
import workflow, { type WorkflowFieldValue, WorkflowValueFunction } from '@hcengineering/workflow'

import tracker from '@hcengineering/tracker'
import core, { AnyAttribute, Class, Doc, Mixin, PersonId, Ref, RefTo } from '@hcengineering/core'
import contact, { Person, SocialIdentityRef } from '@hcengineering/contact'

import { applyValueFunctions } from './transforms'

export async function resolveValue (
  val: WorkflowFieldValue,
  task: Task,
  control: TriggerControl,
  target?: AnyAttribute
): Promise<unknown> {
  try {
    if (val == null) return undefined

    const functions = getFunctions(control, val)
    let result = await evaluateWorkflowValue(val, task, control)
    if (result == null) return undefined

    if (target != null) {
      result = await convertPersonId(control, task, val, target, result)
      if (result == null) return undefined
    }

    if (functions.length > 0 && val.functions != null) {
      result = applyValueFunctions(val.functions, result, functions)
    }

    return result
  } catch (error) {
    control.ctx.error('Failed to resolve workflow value', { error })
  }
}

function getFunctions (control: TriggerControl, val: WorkflowFieldValue): WorkflowValueFunction[] {
  if (val.functions == null || val.functions.length === 0) return []
  const functions = val.functions.map((it) => it.func)
  return control.modelDb.findAllSync(workflow.class.WorkflowValueFunction, { _id: { $in: functions } })
}

async function evaluateWorkflowValue (
  parsed: WorkflowFieldValue,
  task: Task,
  control: TriggerControl
): Promise<unknown> {
  switch (parsed.type) {
    case 'preset':
      return await evalPreset(parsed.preset, control)
    case 'this':
      return evalThisField(control, task, parsed.fieldKey, parsed.mixin)
    case 'parent':
      return await evalParentField(control, task, parsed.fieldKey, parsed.mixin)
    case 'const':
      return parsed.value
    default:
      return undefined
  }
}

async function evalPreset (preset: string, control: TriggerControl): Promise<any> {
  if (preset === '$currentUser') {
    return await getCurrentUser(control)
  }
  if (preset === '$now' || preset === '$today') {
    return Date.now()
  }
}

export async function getCurrentUser (control: TriggerControl): Promise<Ref<Person> | undefined> {
  return await getPersonRef(control, control.ctx.contextData.account.primarySocialId)
}

async function getPersonRef (control: TriggerControl, personId: PersonId): Promise<Ref<Person> | undefined> {
  return (
    await control.findAll(
      control.ctx,
      contact.class.SocialIdentity,
      { _id: personId as SocialIdentityRef },
      { limit: 1 }
    )
  )[0]?.attachedTo
}

/**
 * A PersonId field (createdBy) holds a social id, while a person field takes the Person ref.
 * Undefined for a social id without a person (System, integrations).
 */
async function convertPersonId (
  control: TriggerControl,
  task: Task,
  val: WorkflowFieldValue,
  target: AnyAttribute,
  value: unknown
): Promise<unknown> {
  if (val.type !== 'this' && val.type !== 'parent') return value
  const h = control.hierarchy
  const source = h.findAttribute(val.mixin ?? task._class, val.fieldKey)
  if (source?.type._class !== core.class.TypePersonId) return value
  if (!h.isDerived(target.type._class, core.class.RefTo)) return value
  if (!h.isDerived((target.type as RefTo<Doc>).to, contact.class.Person)) return value
  return await getPersonRef(control, value as PersonId)
}

function evalThisField (control: TriggerControl, task: Task, fieldKey: string, mixin?: Ref<Mixin<Doc>>): unknown {
  if (fieldKey === '') return undefined
  return getDocFieldValue(control, task, fieldKey, mixin)
}

async function evalParentField (
  control: TriggerControl,
  task: Task,
  fieldKey: string,
  mixin?: Ref<Mixin<Doc>>
): Promise<unknown> {
  if (
    task.attachedTo == null ||
    task.attachedToClass == null ||
    task.attachedTo === tracker.ids.NoParent ||
    fieldKey === ''
  ) {
    return undefined
  }

  try {
    const parent = (await control.findAll(control.ctx, task.attachedToClass, { _id: task.attachedTo }, { limit: 1 }))[0]
    if (parent == null) return undefined
    return getDocFieldValue(control, parent, fieldKey, mixin)
  } catch (ex) {
    control.ctx.error('[UpdateFieldValue] Failed to fetch parent task field for ' + fieldKey, { error: ex })
  }
}

function getDocFieldValue (control: TriggerControl, doc: Doc, key: string, mixin?: Ref<Class<Mixin<Doc>>>): any {
  if (mixin == null) {
    return (doc as any)[key]
  } else {
    const mixinDoc = control.hierarchy.as(doc, mixin)
    return (mixinDoc as any)[key]
  }
}
