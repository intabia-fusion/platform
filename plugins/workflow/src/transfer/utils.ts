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

import core, { type Ref, type TxOperations } from '@hcengineering/core'
import { type ProjectType } from '@hcengineering/task'

import workflow from '../plugin'
import type {
  Field,
  FieldListProps,
  UpdateFieldValueProps,
  WorkflowRule
} from '../schema'

/**
 * @internal
 * FOR TESTING AND CLEAN STATE RESETS ONLY.
 *
 * Removes all workflows, transitions, screens and project workflow mappings from a project type.
 * Do NOT use in production user flows.
 */

export async function clearWorkflowConfig (client: TxOperations, projectTypeId: Ref<ProjectType>): Promise<void> {
  const op = client.apply()
  const workflows = await client.findAll(workflow.class.Workflow, { projectType: projectTypeId })
  for (const wf of workflows) {
    await op.removeDoc(workflow.class.Workflow, core.space.Workspace, wf._id)
  }
  const screens = await client.findAll(workflow.class.Screen, { projectType: projectTypeId })
  for (const sc of screens) {
    await op.removeDoc(workflow.class.Screen, core.space.Workspace, sc._id)
  }
  await op.commit()
}

/**
 * Extracts all field references (attributes) used by a specific workflow rule
 * based on its concrete rule type and schema.
 */
export function extractRuleFieldReferences (
  ruleId: Ref<WorkflowRule>,
  props: Record<string, any> | undefined
): Field[] {
  if (props == null) return []

  if (ruleId === workflow.validator.FieldRequired || ruleId === workflow.postFunction.ClearFieldValue) {
    const p = props as FieldListProps
    return p.fields ?? []
  }

  if (ruleId === workflow.postFunction.UpdateFieldValue) {
    const p = props as UpdateFieldValueProps
    const fields: Field[] = []
    for (const f of p.fields ?? []) {
      fields.push(f)
      if (f.value.type === 'this' || f.value.type === 'parent') {
        const sourceVal = f.value
        if (sourceVal.fieldKey !== '' && sourceVal.attribute !== undefined) {
          fields.push({
            attribute: sourceVal.attribute,
            fieldKey: sourceVal.fieldKey,
            mixin: sourceVal.mixin
          })
        }
      }
    }
    return fields
  }

  return []
}
