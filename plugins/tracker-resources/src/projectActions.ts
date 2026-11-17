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

import { MessageBox, getClient } from '@hcengineering/presentation'
import type { Project } from '@hcengineering/tracker'
import { showPopup } from '@hcengineering/ui'
import tracker from './plugin'

export async function deleteProject (project: Project | undefined): Promise<void> {
  if (project !== undefined) {
    const client = getClient()

    if (project.archived) {
      // Clean project and all issues
      showPopup(MessageBox, {
        label: tracker.string.DeleteProject,
        labelProps: { name: project.name },
        message: tracker.string.DeleteProjectConfirm,
        action: async () => {
          const client = getClient()
          await client.remove(project)
        }
      })
    } else {
      const anyIssue = await client.findOne(tracker.class.Issue, { space: project._id })
      showPopup(MessageBox, {
        label: tracker.string.ArchiveProjectName,
        labelProps: { name: project.name },
        message: anyIssue !== undefined ? tracker.string.ProjectHasIssues : tracker.string.ArchiveProjectConfirm,
        action: async () => {
          await client.update(project, { archived: true })
        }
      })
    }
  }
}
