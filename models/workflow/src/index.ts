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

import { type Builder } from '@hcengineering/model'
import core, { AccountRole } from '@hcengineering/core'
import setting from '@hcengineering/setting'
import workflow from './plugin'

export function createModel (builder: Builder): void {
  builder.createDoc(setting.class.WorkspaceSettingCategory, core.space.Model, {
    name: 'workflows',
    label: workflow.string.Workflow,
    icon: setting.icon.Views,
    component: workflow.component.WorkflowsSettings,
    group: 'settings-editor',
    role: AccountRole.Maintainer,
    order: 5500
  })
}

export * from './types'
export { workflowId } from '@hcengineering/workflow'
export default workflow
