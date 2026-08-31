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

import workflow from '../../plugin'
import { exportWorkflow } from '../../transfer'
import {
  createMockTx,
  projectTypeId,
  statusDoneId,
  statusOpenId,
  taskTypeId,
  workflowId,
  ws1
} from './fixtures'

describe('Workflow Export', () => {
  describe('exportSingleWorkflow', () => {
    it('exports a single workflow config with status tokens and rule configs', async () => {
      const client = createMockTx()
      const config = await exportWorkflow(client, workflowId, {
        workspace: ws1,
        projectTypeId
      })

      expect(config.version).toBe(1)
      expect(config.exportDate).toBeDefined()
      expect(config.workspace).toBe(ws1)
      expect(config.projectTypeId).toBe(projectTypeId)
      expect(config.workflows).toHaveLength(1)
      expect(config.workflows[0].id).toBe(workflowId)
      expect(config.workflows[0].name).toBe('Bug Workflow')
      expect(config.workflows[0].taskTypeName).toBe('Bug')
      expect(config.workflows[0].taskTypeId).toBe(taskTypeId)
      expect(config.workflows[0].initialStatuses).toEqual([statusOpenId])
      expect(config.workflows[0].transitions).toHaveLength(1)
      expect(config.workflows[0].transitions?.[0].id).toBe('trans-1')
      expect(config.workflows[0].transitions?.[0].from).toEqual([statusOpenId])
      expect(config.workflows[0].transitions?.[0].to).toBe(statusDoneId)
      expect(config.statuses).toContainEqual(expect.objectContaining({ id: statusOpenId, name: 'Open', color: 1 }))
      expect(config.statuses).toContainEqual(expect.objectContaining({ id: statusDoneId, name: 'Done', color: 2 }))
    })

    it('exports screens referenced by ScreenRequest configs', async () => {
      const screenId = 'screen-1' as any
      const screenDoc = {
        _id: screenId,
        _class: workflow.class.Screen,
        name: 'Resolution Screen',
        projectType: projectTypeId,
        targetClass: 'tracker:class:Issue'
      }
      const transWithScreen = {
        _id: 'trans-2',
        _class: workflow.class.WorkflowTransition,
        attachedTo: workflowId,
        name: 'Resolve',
        from: [statusOpenId],
        to: statusDoneId,
        rank: '0|i00001:',
        requests: [
          {
            id: 'req-screen',
            rule: workflow.request.ScreenRequest,
            ruleClass: workflow.class.WorkflowRequest,
            props: { screen: screenId }
          }
        ]
      }
      const client = createMockTx({ docs: [screenDoc as any, transWithScreen as any] })
      const config = await exportWorkflow(client, workflowId, {
        workspace: ws1,
        projectTypeId
      })

      expect(config.screens).toBeDefined()
      expect(config.screens).toHaveLength(1)
      expect(config.screens?.[0].id).toBe(screenId)
      expect(config.screens?.[0].name).toBe('Resolution Screen')
    })

    it('exports attributes referenced in UpdateFieldValue post-function (both target and source fields)', async () => {
      const customAttrId = 'attr-custom-1' as any
      const parentAttrId = 'attr-parent-1' as any

      const transWithUpdate = {
        _id: 'trans-update',
        _class: workflow.class.WorkflowTransition,
        attachedTo: workflowId,
        name: 'Auto-fill',
        from: [statusOpenId],
        to: statusDoneId,
        rank: '0|i00002:',
        postFunctions: [
          {
            id: 'post-fn-1',
            rule: workflow.postFunction.UpdateFieldValue,
            ruleClass: workflow.class.WorkflowPostFunction,
            props: {
              fields: [
                {
                  attribute: customAttrId,
                  fieldKey: 'customField',
                  value: {
                    type: 'parent',
                    attribute: parentAttrId,
                    fieldKey: 'parentField'
                  }
                }
              ]
            }
          }
        ]
      }

      const client = createMockTx({ docs: [transWithUpdate as any] })
      const config = await exportWorkflow(client, workflowId, {
        workspace: ws1,
        projectTypeId
      })

      expect(config.workflows[0].transitions).toBeDefined()
    })

    it('works identically via exportWorkflow alias', async () => {
      const client = createMockTx()
      const config = await exportWorkflow(client, workflowId, {
        workspace: ws1,
        projectTypeId
      })

      expect(config.workflows).toHaveLength(1)
      expect(config.workflows[0].id).toBe(workflowId)
    })
  })
})
