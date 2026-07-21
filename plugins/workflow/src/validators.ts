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

import { Client, notEmpty } from '@hcengineering/core'
import type { Task } from '@hcengineering/task'

import workflow from './plugin'
import { type ValidationResult, type WorkflowTransition } from './types'

export function isEmpty (value: any): boolean {
  if (value === undefined || value === null) {
    return true
  }
  if (typeof value === 'string') {
    return value.trim() === ''
  }
  if (Array.isArray(value)) {
    return value.length === 0
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0
  }
  return false
}

export async function FieldRequired (
  _client: Client,
  task: Task,
  transition: WorkflowTransition,
  props: Record<string, any>
): Promise<ValidationResult> {
  const fields = ((props.fields ?? []) as string[]).filter(notEmpty)
  if (fields.length === 0) {
    return { ok: true }
  }

  for (const field of fields) {
    const val = (task as any)[field]
    if (isEmpty(val)) {
      return {
        ok: false,
        reason: `Field "${field}" is required for transition "${transition.name}".`,
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: { field, transition: transition.name }
      }
    }
  }

  return { ok: true }
}
