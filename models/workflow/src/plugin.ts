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

import { mergeIds, type Resource } from '@hcengineering/platform'
import workflow, { workflowId } from '@hcengineering/workflow'
import {} from '@hcengineering/ui'
import { type Ref } from '@hcengineering/core'
import { type PresentationMiddlewareCreator, type PresentationMiddlewareFactory } from '@hcengineering/presentation'

export default mergeIds(workflowId, workflow, {
  function: {
    CreateMiddleware: '' as Resource<PresentationMiddlewareCreator>
  },
  pipeline: {
    WorkflowMiddleware: '' as Ref<PresentationMiddlewareFactory>
  }
})
