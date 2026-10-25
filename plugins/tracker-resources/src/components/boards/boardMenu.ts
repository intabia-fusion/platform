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

import type { Ref } from '@hcengineering/core'
import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import task from '@hcengineering/task'
import { sortBoards, type Board, type Project } from '@hcengineering/tracker'
import type { MenuItem } from '@hcengineering/ui/kit'
import view from '@hcengineering/view'
import tracker from '../../plugin'
import BoardMenuRow from './BoardMenuRow.svelte'

interface Section {
  heading: IntlString
  boards: Board[]
  // Boards of one project show it in the heading, the others list their projects on the right
  identifiers: boolean
}

// One section per project of the team boards with one project, then the team boards of several projects, then personal ones
function sections (boards: Board[], pinned: ReadonlySet<Ref<Board>>, projects: Map<Ref<Project>, Project>): Section[] {
  const single = new Map<Ref<Project>, Board[]>()
  const multiple: Board[] = []
  const mine: Board[] = []
  for (const b of sortBoards(boards, pinned)) {
    if (b.visibility === 'me') mine.push(b)
    else if (b.projects.length === 1 && projects.has(b.projects[0])) {
      single.set(b.projects[0], [...(single.get(b.projects[0]) ?? []), b])
    } else multiple.push(b)
  }
  const result: Section[] = [...single.entries()]
    .map(([id, list]) => ({ project: projects.get(id), list }))
    .sort((a, b) => (a.project?.name ?? '').localeCompare(b.project?.name ?? ''))
    .map(({ project, list }) => ({
      heading: getEmbeddedLabel(`${project?.name ?? ''} · ${project?.identifier ?? ''}`),
      boards: list,
      identifiers: false
    }))
  if (multiple.length > 0) {
    result.push({ heading: tracker.string.BoardsSeveralProjects, boards: multiple, identifiers: true })
  }
  if (mine.length > 0) result.push({ heading: tracker.string.MyBoards, boards: mine, identifiers: true })
  return result
}

// Board rows in sections, for the board switcher and the project boards menu.
// `hint` sets the text on the right; by default pinned boards say so, others list their projects.
export function boardMenuItems (
  boards: Board[],
  pinned: ReadonlySet<Ref<Board>>,
  projects: Map<Ref<Project>, Project>,
  hint?: (b: Board) => IntlString | undefined
): MenuItem[] {
  const result: MenuItem[] = []
  for (const [i, section] of sections(boards, pinned, projects).entries()) {
    for (const [j, b] of section.boards.entries()) {
      const label = getEmbeddedLabel(b.title)
      result.push({
        id: b._id,
        label,
        icon: hint === undefined && pinned.has(b._id) ? view.icon.Pin : task.icon.Kanban,
        heading: j === 0 ? section.heading : undefined,
        divider: i > 0 && j === 0 ? true : undefined,
        component: BoardMenuRow,
        componentProps: {
          label,
          hint: hint !== undefined ? hint(b) : defaultHint(b, section.identifiers, pinned, projects)
        }
      })
    }
  }
  return result
}

function defaultHint (
  b: Board,
  identifiers: boolean,
  pinned: ReadonlySet<Ref<Board>>,
  projects: Map<Ref<Project>, Project>
): IntlString | undefined {
  if (pinned.has(b._id)) return tracker.string.BoardPinnedHint
  if (!identifiers) return undefined
  const ids = b.projects.map((id) => projects.get(id)?.identifier).filter((it) => it !== undefined)
  return ids.length > 0 ? getEmbeddedLabel(ids.join(' · ')) : undefined
}
