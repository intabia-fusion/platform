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

import type { Client } from '@hcengineering/core'
import type { Task } from '@hcengineering/task'
import type { IntlString, Resource } from '@hcengineering/platform'
import type { WorkflowTransition } from './core'
import type { WorkflowValidator } from './rules'

export interface ValidationSuccess {
  ok: true
}

export interface ValidationError {
  ok: false
  reason: string
  reasonIntl: IntlString
  intlParams: Record<string, any>
}

export type ValidationResult = ValidationSuccess | ValidationError

export type ValidatorClient = Pick<Client, 'findAll' | 'findOne' | 'getHierarchy' | 'getModel'>

export type ValidatorFunc = (
  client: ValidatorClient,
  task: Task,
  transition: WorkflowTransition,
  props: Record<string, any>
) => Promise<ValidationResult>

export interface ValidatorImpl extends WorkflowValidator {
  executor: Resource<ValidatorFunc>
}
