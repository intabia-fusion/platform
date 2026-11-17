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

import type { Ref } from '@hcengineering/core'
import type { Project } from '@hcengineering/tracker'
import { getCurrentLocation, navigate } from '@hcengineering/ui'
import { openProjectSettings, openProjectTemplates } from '../projectSettings'

jest.mock('@hcengineering/ui', () => ({
  getCurrentLocation: jest.fn(),
  getCurrentResolvedLocation: jest.fn(),
  navigate: jest.fn()
}))

describe('project settings navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentLocation as jest.Mock).mockReturnValue({
      path: ['workbench', 'workspace', 'tracker', 'old-project', 'project-settings'],
      query: { section: 'issues' },
      fragment: 'old-fragment'
    })
  })

  it('keeps the exact project and a return target when opening templates', () => {
    openProjectTemplates('archived-project' as Ref<Project>)
    expect(navigate).toHaveBeenCalledWith({
      path: ['workbench', 'workspace', 'tracker', 'archived-project', 'templates'],
      query: { fromProjectSettings: 'issues' },
      fragment: undefined
    })
  })

  it('clears the template return marker when opening project settings', () => {
    openProjectSettings('archived-project' as Ref<Project>)
    expect(navigate).toHaveBeenCalledWith({
      path: ['workbench', 'workspace', 'tracker', 'archived-project', 'project-settings'],
      query: undefined,
      fragment: undefined
    })
  })
})
