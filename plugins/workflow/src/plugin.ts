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

import { Class, Mixin, Ref } from '@hcengineering/core'
import { Asset, IntlString, plugin, Plugin } from '@hcengineering/platform'
import { AnyComponent } from '@hcengineering/ui'
import { ProjectWorkflow, Workflow, WorkflowTransition } from './types'

export const workflowId = 'workflow' as Plugin

export default plugin(workflowId, {
  class: {
    Workflow: '' as Ref<Class<Workflow>>,
    WorkflowTransition: '' as Ref<Class<WorkflowTransition>>
  },
  mixin: {
    ProjectWorkflow: '' as Ref<Mixin<ProjectWorkflow>>
  },
  component: {
    ProjectTypeWorkflowsSectionEditor: '' as AnyComponent,
    WorkflowEditor: '' as AnyComponent
  },
  icon: {
    Workflows: '' as Asset,
    Workflow: '' as Asset,
    Transition: '' as Asset
  },
  string: {
    Workflow: '' as IntlString,
    WorkflowTransition: '' as IntlString,
    WorkflowMapping: '' as IntlString,
    Name: '' as IntlString,
    From: '' as IntlString,
    To: '' as IntlString,
    TaskType: '' as IntlString,
    DefaultWorkflow: '' as IntlString,
    Untitled: '' as IntlString,
    AnyStatus: '' as IntlString,
    Workflows: '' as IntlString,
    DeleteWorkflow: '' as IntlString,
    DeleteWorkflowConfirm: '' as IntlString,
    DeleteWorkflowTransition: '' as IntlString,
    DeleteWorkflowTransitionConfirm: '' as IntlString,
    Export: '' as IntlString,
    Transitions: '' as IntlString,
    AddTransition: '' as IntlString,
    CreateTransition: '' as IntlString,
    TransitionNamed: '' as IntlString,
    TaskTypeRequired: '' as IntlString,
    UnknownTaskType: '' as IntlString,
    WorkflowName: '' as IntlString,
    NameRequired: '' as IntlString,
    StatusToRequired: '' as IntlString
  }
})
