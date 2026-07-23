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

import '@hcengineering/platform-rig/profiles/ui/svelte'
import type { Resources } from '@hcengineering/platform'

import ProjectTypeWorkflowsSectionEditor from './components/ProjectTypeWorkflowsSectionEditor.svelte'
import ProjectTypeScreensSectionEditor from './components/ProjectTypeScreensSectionEditor.svelte'
import WorkflowEditor from './components/editor/WorkflowEditor.svelte'
import ScreenEditor from './components/editor/ScreenEditor.svelte'
import ScreenRequestEditor from './components/requests/editors/ScreenRequestEditor.svelte'
import ScreenRequestPresenter from './components/requests/presenters/ScreenRequestPresenter.svelte'
import FieldRequired from './components/validators/editors/FieldRequared.svelte'
import SubtaskStatus from './components/validators/editors/SubtaskStatus.svelte'
import ParentStatus from './components/validators/editors/ParentStatus.svelte'
import FieldRequiredPresenter from './components/validators/presenters/FieldRequiredPresenter.svelte'
import SubtaskStatusPresenter from './components/validators/presenters/SubtaskStatusPresenter.svelte'
import ParentStatusPresenter from './components/validators/presenters/ParentStatusPresenter.svelte'
import * as validators from './validators'

export default async (): Promise<Resources> => ({
  component: {
    ProjectTypeWorkflowsSectionEditor,
    ProjectTypeScreensSectionEditor,
    WorkflowEditor,
    ScreenEditor
  },
  requestEditor: {
    ScreenRequest: ScreenRequestEditor
  },
  requestPresenter: {
    ScreenRequest: ScreenRequestPresenter
  },
  validatorExecutor: {
    FieldRequired: validators.FieldRequired,
    SubtaskStatus: validators.SubtaskStatus,
    ParentStatus: validators.ParentStatus
  },
  validatorEditor: {
    FieldRequired,
    SubtaskStatus,
    ParentStatus
  },
  validatorPresenter: {
    FieldRequired: FieldRequiredPresenter,
    SubtaskStatus: SubtaskStatusPresenter,
    ParentStatus: ParentStatusPresenter
  }
})
