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

import core, {
  AnyAttribute,
  AttachedDoc,
  Collection,
  DocumentUpdate,
  groupByArray,
  type Hierarchy,
  MixinUpdate,
  type Tx
} from '@hcengineering/core'
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
  const fields = props.fields ?? []
  if (fields == null || !Array.isArray(props.fields) || props.fields.length === 0) return []

  const h = control.hierarchy
  const res: Tx[] = []
  const unset: Record<string, true> = {}

  for (const f of fields) {
    if (f.fieldKey === '' || (f.mixin != null && !h.hasMixin(task, f.mixin))) continue

    const attr = h.findAttribute(f.mixin ?? task._class, f.fieldKey)
    if (attr != null && isCollectionAttr(h, attr)) {
      const type = attr.type as Collection<AttachedDoc>
      const attachedDocs = await control.findAll(control.ctx, type.of, { attachedTo: task._id })
      for (const it of attachedDocs) {
        res.push(
          control.txFactory.createTxCollectionCUD(
            it.attachedToClass,
            it.attachedTo,
            it.space,
            it.collection,
            control.txFactory.createTxRemoveDoc(it._class, it.space, it._id)
          )
        )
      }
    } else {
      const key = f.mixin != null ? `${f.mixin}.${f.fieldKey}` : f.fieldKey
      unset[key] = true
    }
  }

  if (Object.keys(unset).length > 0) {
    res.push(control.txFactory.createTxUpdateDoc(task._class, task.space, task._id, { $unset: unset }))
  }

  return res.map((it) => ({ ...it, space: core.space.Tx }))
}

function isCollectionAttr (hierarchy: Hierarchy, attr: AnyAttribute | undefined): boolean {
  if (attr == null) return false
  return hierarchy.isDerived(attr.type._class, core.class.Collection)
}
