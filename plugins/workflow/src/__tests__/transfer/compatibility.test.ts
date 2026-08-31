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

import core from '@hcengineering/core'

import {
  checkWorkflowCompatibility,
  exportWorkflow,
  isAttributeTypeCompatible
} from '../../transfer'
import {
  createMockTx,
  projectTypeId,
  statusOpenId,
  statusResolvedId,
  targetTaskTypeId,
  workflowId,
  ws1
} from './fixtures'

describe('Workflow Compatibility Check', () => {
  it('identifies matched statuses and unmatched statuses', async () => {
    const client = createMockTx()
    const config = await exportWorkflow(client, workflowId, {
      workspace: ws1,
      projectTypeId
    })
    const report = await checkWorkflowCompatibility(client, config, targetTaskTypeId)

    expect(report.statuses).toBeDefined()
    const openStatus = report.statuses.find((s) => s.sourceName === 'Open')
    const doneStatus = report.statuses.find((s) => s.sourceName === 'Done')

    expect(openStatus?.isMatched).toBe(true)
    expect(openStatus?.targetStatusId).toBe(statusOpenId)

    // Done is matched to Resolved via same category ('completed')
    expect(doneStatus?.isMatched).toBe(true)
    expect(doneStatus?.targetStatusId).toBe(statusResolvedId)
  })

  it('identifies matched and unmatched attributes in rules', async () => {
    const client = createMockTx()
    const config = await exportWorkflow(client, workflowId, {
      workspace: ws1,
      projectTypeId
    })
    const report = await checkWorkflowCompatibility(client, config, targetTaskTypeId)

    expect(report.attributes).toBeDefined()
    const assigneeAttr = report.attributes.find((a) => a.fieldKey === 'assignee')
    expect(assigneeAttr?.isMatched).toBe(true)
  })

  it('identifies affected transitions and unmatched statuses', async () => {
    const client = createMockTx()
    const customStatusId = 'status-custom-unmatched' as any
    const transWithUnmatched = {
      id: 'trans-unmatched',
      name: 'Custom Step',
      from: [statusOpenId],
      to: customStatusId
    }

    const config = await exportWorkflow(client, workflowId, {
      workspace: ws1,
      projectTypeId
    })
    config.workflows[0].transitions?.push(transWithUnmatched as any)
    config.statuses?.push({
      id: customStatusId,
      name: 'Custom Unmatched',
      color: 1,
      category: 'custom-unknown' as any
    })

    const report = await checkWorkflowCompatibility(client, config, targetTaskTypeId)
    const customStatus = report.statuses.find((s) => s.sourceStatusId === customStatusId)
    expect(customStatus?.isMatched).toBe(false)

    const transitionReport = report.transitions.find((t) => t.id === 'trans-unmatched')
    expect(transitionReport).toBeDefined()
    expect(transitionReport?.to).toBe(customStatusId)
  })

  it('correctly sets hasScreens flag', async () => {
    const client = createMockTx()
    const config = await exportWorkflow(client, workflowId, {
      workspace: ws1,
      projectTypeId
    })

    const reportWithoutScreens = await checkWorkflowCompatibility(client, config, targetTaskTypeId)
    expect(reportWithoutScreens.hasScreens).toBe(false)

    // With screens in config
    config.screens = [
      {
        id: 'screen-1' as any,
        name: 'Screen 1',
        targetClass: 'core:class:Doc' as any
      }
    ]
    const reportWithScreens = await checkWorkflowCompatibility(client, config, targetTaskTypeId)
    expect(reportWithScreens.hasScreens).toBe(true)
  })

  it('checks strict attribute type compatibility', () => {
    const client = createMockTx()
    const hierarchy = client.getHierarchy()

    expect(
      isAttributeTypeCompatible(
        hierarchy,
        { _class: 'core:class:TypeString' } as any,
        { _class: 'core:class:TypeString' } as any
      )
    ).toBe(true)

    expect(
      isAttributeTypeCompatible(
        hierarchy,
        { _class: 'core:class:TypeString' } as any,
        { _class: 'core:class:TypeNumber' } as any
      )
    ).toBe(false)

    expect(
      isAttributeTypeCompatible(
        hierarchy,
        { _class: core.class.EnumOf, of: 'custom:enum:1' } as any,
        { _class: core.class.EnumOf, of: 'custom:enum:1' } as any
      )
    ).toBe(true)

    expect(
      isAttributeTypeCompatible(
        hierarchy,
        { _class: core.class.EnumOf, of: 'custom:enum:1' } as any,
        { _class: core.class.EnumOf, of: 'custom:enum:2' } as any
      )
    ).toBe(false)

    // ArrOf compatibility
    expect(
      isAttributeTypeCompatible(
        hierarchy,
        { _class: core.class.ArrOf, of: { _class: 'core:class:TypeString' } } as any,
        { _class: core.class.ArrOf, of: { _class: 'core:class:TypeString' } } as any
      )
    ).toBe(true)

    expect(
      isAttributeTypeCompatible(
        hierarchy,
        { _class: core.class.ArrOf, of: { _class: 'core:class:TypeString' } } as any,
        { _class: core.class.ArrOf, of: { _class: 'core:class:TypeNumber' } } as any
      )
    ).toBe(false)

    // RefTo compatibility
    expect(
      isAttributeTypeCompatible(
        hierarchy,
        { _class: core.class.RefTo, to: 'core:class:Doc' } as any,
        { _class: core.class.RefTo, to: 'core:class:Doc' } as any
      )
    ).toBe(true)
  })
})
