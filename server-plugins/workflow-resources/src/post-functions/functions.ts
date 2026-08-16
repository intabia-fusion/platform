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

import { DocumentUpdate, groupByArray, MixinUpdate, type Tx } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import { type Task } from '@hcengineering/task'
import { type WorkflowTransition, type UpdateFieldValueProps, type ClearFieldValueProps } from '@hcengineering/workflow'

import { resolveValue } from './evaluator'

export async function UpdateFieldValue (
  control: TriggerControl,
  task: Task,
  _transition: WorkflowTransition,
  props: UpdateFieldValueProps
): Promise<Tx[]> {
  if (props?.fields == null || !Array.isArray(props.fields) || props.fields.length === 0) return []

  const res: Tx[] = []
  const update: DocumentUpdate<Task> = {}
  const unset: Record<string, true> = {}

  const fieldsByMixin = groupByArray(props.fields, (it) => it.mixin)

  for (const [mixin, configs] of fieldsByMixin.entries()) {
    if (mixin == null) {
      for (const f of configs) {
        if (f.fieldKey === '') continue
        const v = await resolveValue(f.value, task, control)
        if (v === undefined) continue
        if (v === null) {
          unset[f.fieldKey] = true
        } else {
          ;(update as any)[f.fieldKey] = v
        }
      }
    } else {
      const mixinUpdate: MixinUpdate<Task, Task> = {}
      for (const f of configs) {
        if (f.fieldKey === '') continue
        const v = await resolveValue(f.value, task, control)
        if (v === undefined) continue
        ;(mixinUpdate as any)[f.fieldKey] = v
      }
      if (Object.keys(mixinUpdate).length > 0) {
        res.push(control.txFactory.createTxMixin(task._id, task._class, task.space, mixin, mixinUpdate))
      }
    }
  }

  if (Object.keys(unset).length > 0) {
    update.$unset = unset
  }

  if (Object.keys(update).length > 0) {
    res.push(control.txFactory.createTxUpdateDoc(task._class, task.space, task._id, update))
  }

  return res
}

export async function ClearFieldValue (
  control: TriggerControl,
  task: Task,
  _transition: WorkflowTransition,
  props: ClearFieldValueProps
): Promise<Tx[]> {
  const fields = props?.fields
  if (fields == null || !Array.isArray(fields) || fields.length === 0) return []

  const fieldsToUpdate = fields.filter((it) => it.fieldKey !== '')
  if (fieldsToUpdate.length === 0) return []

  const h = control.hierarchy
  const unset: Record<string, true> = {}

  for (const f of fieldsToUpdate) {
    if (f.mixin == null) {
      unset[f.fieldKey] = true
    } else if (h.hasMixin(task, f.mixin)) {
      unset[`${f.mixin}.${f.fieldKey}`] = true
    }
  }

  if (Object.keys(unset).length === 0) return []

  const update: DocumentUpdate<Task> = { $unset: unset }
  return [control.txFactory.createTxUpdateDoc(task._class, task.space, task._id, update)]
}
