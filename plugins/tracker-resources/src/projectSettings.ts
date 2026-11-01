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
import { settingId } from '@hcengineering/setting'
import type { ProjectType } from '@hcengineering/task'
import { projectSettingsId, trackerId, type Project } from '@hcengineering/tracker'
import { getCurrentLocation, getCurrentResolvedLocation, navigate } from '@hcengineering/ui'
import type { Workflow } from '@hcengineering/workflow'

// Ids of the project specials in models/tracker/src/index.ts
const issuesSpecialId = 'issues'
const templatesSpecialId = 'templates'

function openProjectSpecial (project: Ref<Project>, special: string): void {
  const loc = getCurrentLocation()
  loc.path[2] = trackerId
  loc.path[3] = project
  loc.path[4] = special
  loc.path.length = 5
  loc.query = undefined
  loc.fragment = undefined
  navigate(loc)
}

export function openProjectSettings (project: Ref<Project>): void {
  openProjectSpecial(project, projectSettingsId)
}

// A section of the open settings page, kept in the address so a reload stays there
export function openProjectSection (section: string): void {
  const loc = getCurrentLocation()
  loc.query = { ...loc.query, section }
  navigate(loc, true)
}

export function closeProjectSettings (project: Ref<Project>): void {
  openProjectSpecial(project, issuesSpecialId)
}

export function openProjectTemplates (project: Ref<Project>): void {
  openProjectSpecial(project, templatesSpecialId)
}

// Same target as ProjectTypeSettingsLink, for buttons styled by the settings page itself;
// `section` is a section id of the project type editor (models/task/src/index.ts), it scrolls there
export function openProjectType (type: Ref<ProjectType>, section?: string): void {
  const loc = getCurrentResolvedLocation()
  loc.path[2] = settingId
  loc.path[3] = 'spaceTypes'
  loc.path[4] = type
  loc.path.length = 5
  loc.fragment = section
  navigate(loc)
}

// The workflow editor of the project type, as navigateToWorkflow in workflow-resources
export function openProjectTypeWorkflow (type: Ref<ProjectType>, workflow: Ref<Workflow>): void {
  const loc = getCurrentResolvedLocation()
  loc.path[2] = settingId
  loc.path[3] = 'spaceTypes'
  loc.path[4] = type
  loc.path[5] = 'workflows'
  loc.path[6] = workflow
  loc.path.length = 7
  loc.query = undefined
  loc.fragment = undefined
  navigate(loc)
}
