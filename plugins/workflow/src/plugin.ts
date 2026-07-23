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
import { Asset, IntlString, plugin, Plugin, Resource } from '@hcengineering/platform'
import { AnyComponent } from '@hcengineering/ui'
import {
  ProjectWorkflow,
  Workflow,
  WorkflowTransition,
  WorkflowValidator,
  ValidatorImpl,
  ValidatorFunc,
  WorkflowRule,
  WorkflowRequest,
  Screen,
  ScreenTab,
  ScreenField
} from './types'

export const workflowId = 'workflow' as Plugin

export default plugin(workflowId, {
  class: {
    Workflow: '' as Ref<Class<Workflow>>,
    WorkflowTransition: '' as Ref<Class<WorkflowTransition>>,
    WorkflowRule: '' as Ref<Class<WorkflowRule>>,
    WorkflowValidator: '' as Ref<Class<WorkflowValidator>>,
    WorkflowRequest: '' as Ref<Class<WorkflowRequest>>,
    Screen: '' as Ref<Class<Screen>>,
    ScreenTab: '' as Ref<Class<ScreenTab>>,
    ScreenField: '' as Ref<Class<ScreenField>>
  },
  validator: {
    FieldRequired: '' as Ref<WorkflowValidator>,
    SubtaskStatus: '' as Ref<WorkflowValidator>,
    ParentStatus: '' as Ref<WorkflowValidator>
  },
  validatorExecutor: {
    FieldRequired: '' as Resource<ValidatorFunc>,
    SubtaskStatus: '' as Resource<ValidatorFunc>,
    ParentStatus: '' as Resource<ValidatorFunc>
  },
  validatorEditor: {
    FieldRequired: '' as AnyComponent,
    SubtaskStatus: '' as AnyComponent,
    ParentStatus: '' as AnyComponent
  },
  validatorPresenter: {
    FieldRequired: '' as AnyComponent,
    SubtaskStatus: '' as AnyComponent,
    ParentStatus: '' as AnyComponent
  },
  request: {
    ScreenRequest: '' as Ref<WorkflowRequest>
  },
  requestEditor: {
    ScreenRequest: '' as AnyComponent
  },
  requestPresenter: {
    ScreenRequest: '' as AnyComponent
  },
  mixin: {
    ProjectWorkflow: '' as Ref<Mixin<ProjectWorkflow>>,
    ValidatorImpl: '' as Ref<Mixin<ValidatorImpl>>
  },
  component: {
    ProjectTypeWorkflowsSectionEditor: '' as AnyComponent,
    WorkflowEditor: '' as AnyComponent,
    ProjectTypeScreensSectionEditor: '' as AnyComponent,
    ScreenEditor: '' as AnyComponent
  },
  icon: {
    Workflows: '' as Asset,
    Workflow: '' as Asset,
    Transition: '' as Asset,
    Check: '' as Asset,
    Screens: '' as Asset,
    Screen: '' as Asset,
    ScreenTab: '' as Asset
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
    Screens: '' as IntlString,
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
    StatusToRequired: '' as IntlString,
    Validators: '' as IntlString,
    FieldRequiredValidator: '' as IntlString,
    FieldRequiredDescription: '' as IntlString,
    FieldRequiredError: '' as IntlString,
    SubtaskStatusValidator: '' as IntlString,
    SubtaskStatusDescription: '' as IntlString,
    SubtaskStatusError: '' as IntlString,
    SubtaskStatusRequired: '' as IntlString,
    ParentStatusValidator: '' as IntlString,
    ParentStatusDescription: '' as IntlString,
    ParentStatusError: '' as IntlString,
    ParentStatusRequired: '' as IntlString,
    TransitionConflictError: '' as IntlString,
    SelfTransitionError: '' as IntlString,
    AddValidator: '' as IntlString,
    Validator: '' as IntlString,
    AddRule: '' as IntlString,
    AllRules: '' as IntlString,
    RuleTypes: '' as IntlString,
    RestrictTransition: '' as IntlString,
    RequestInput: '' as IntlString,
    ValidateDetails: '' as IntlString,
    PerformActions: '' as IntlString,
    SearchRules: '' as IntlString,
    Transition: '' as IntlString,
    Screen: '' as IntlString,
    ScreenTab: '' as IntlString,
    ScreenField: '' as IntlString,
    FieldId: '' as IntlString,
    Label: '' as IntlString,
    Required: '' as IntlString,
    Description: '' as IntlString,
    Requests: '' as IntlString,
    WorkflowRequest: '' as IntlString,
    ScreenRequest: '' as IntlString,
    ScreenRequestDescription: '' as IntlString,
    TabNumbered: '' as IntlString,
    DeleteScreen: '' as IntlString,
    DeleteScreenConfirm: '' as IntlString,
    DeleteScreenTab: '' as IntlString,
    DeleteScreenTabConfirm: '' as IntlString,
    AddTab: '' as IntlString,
    AddField: '' as IntlString,
    TabName: '' as IntlString,
    ConfigureScreen: '' as IntlString,
    ScreenRequestPresenter: '' as IntlString,
    ScreenNotSelected: '' as IntlString
  }
})
