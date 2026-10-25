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

// Imports dev/design/demo/<lang> on top of tests/demo-ws*: statuses, extra issues, boards.
// Existing statuses, issues and boards are left as they are.

import { formatName } from '@hcengineering/contact'
import { WorkspaceImporter, type FileUploader, type Logger } from '@hcengineering/importer'
import core, {
  generateId,
  type AccountUuid,
  type Class,
  type Doc,
  type Hierarchy,
  type Mixin,
  type Ref,
  type Status,
  type TxOperations
} from '@hcengineering/core'
import task, { createStatusAtomic, type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, { type Component } from '@hcengineering/tracker'
import { existsSync, readdirSync, readFileSync } from 'fs'
import * as yaml from 'js-yaml'
import { join, resolve } from 'path'
import { convertBoard, type BoardContext, type DemoBoard, type FilterKeyInfo } from './demoBoards'
import { type PlannerAccount } from './plannerData'

// view:mixin:AttributeFilter, the tool has no dependency on the view plugin
interface AttributeFilter extends Doc {
  component: string
  group?: string
}

interface DemoFile {
  header: Record<string, any>
  body: string
  name: string
  folder: string
}

const categories: Record<string, Ref<any>> = {
  backlog: task.statusCategory.UnStarted,
  todo: task.statusCategory.ToDo,
  active: task.statusCategory.Active,
  won: task.statusCategory.Won,
  lost: task.statusCategory.Lost
}

// .mdx files of the folder tree: YAML header between the first two `---` lines, then the text
function readFiles (root: string, folder: string = ''): DemoFile[] {
  const result: DemoFile[] = []
  const entries = readdirSync(join(root, folder), { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { numeric: true })
  )
  for (const e of entries) {
    if (e.isDirectory()) result.push(...readFiles(root, join(folder, e.name)))
    else if (e.name.endsWith('.mdx')) {
      const [, head, ...rest] = readFileSync(join(root, folder, e.name), 'utf8').split(/^---$/m)
      result.push({
        header: (yaml.load(head) as Record<string, any>) ?? {},
        body: rest.join('---').trim(),
        name: e.name,
        folder: folder.split('/')[0]
      })
    }
  }
  return result
}

// Palette names in the order of packages/ui/src/colors.ts: a status and a rule store the index
function paletteNames (): string[] {
  const src = readFileSync(resolve(__dirname, '../../../packages/ui/src/colors.ts'), 'utf8')
  const start = src.indexOf('export const whitePalette')
  const body = src.slice(start, src.indexOf('\n])', start))
  return Array.from(body.matchAll(/define\('(\w+)'/g), (m) => m[1])
}

// The KeyFilter the filter editor stores, found the way buildFilterKey of view-resources does
function filterKeyOf (hierarchy: Hierarchy, field: string): FilterKeyInfo | undefined {
  const filterMixin = 'view:mixin:AttributeFilter' as Ref<Mixin<AttributeFilter>>
  if (!hierarchy.getAllAttributes(tracker.class.Issue).has(field)) return undefined
  const attribute = hierarchy.getAttribute(tracker.class.Issue, field)
  let filter: AttributeFilter | undefined
  if (hierarchy.isDerived(attribute.type._class, core.class.RefTo)) {
    filter = hierarchy.classHierarchyMixin((attribute.type as any).to as Ref<Class<any>>, filterMixin)
  }
  if (filter?.component === undefined) {
    filter = hierarchy.as<Doc, AttributeFilter>(
      hierarchy.getClass(attribute.type._class) as unknown as Doc,
      filterMixin
    )
  }
  if (filter?.component === undefined) return undefined
  return {
    key: {
      _class: tracker.class.Issue,
      key: field,
      attribute,
      label: attribute.label,
      component: filter.component,
      group: filter.group
    },
    kind: filter.component === 'view:component:ValueFilter' ? 'value' : 'object'
  }
}

async function createStatuses (client: TxOperations, files: DemoFile[], colors: string[]): Promise<void> {
  const types = new Set((await client.findAll(tracker.class.Project, { archived: false })).map((p) => p.type))
  for (const typeId of types) {
    const type = await client.findOne(task.class.ProjectType, { _id: typeId as Ref<ProjectType> })
    if (type === undefined) continue
    const issueTypes = await client.findAll(task.class.TaskType, {
      _id: { $in: type.tasks },
      ofClass: tracker.class.Issue
    })
    for (const f of files) {
      const { title, category, color } = f.header
      const placements = issueTypes.map((taskType: TaskType) => ({
        taskType: taskType._id,
        // After the last status of the category, as the status editor puts a new one
        place: (list: Array<Ref<Status>>, id: Ref<Status>): Array<Ref<Status>> => {
          const known = client.getModel().findAllSync(core.class.Status, { _id: { $in: list } })
          const last = list.findLastIndex((s) => known.find((k) => k._id === s)?.category === categories[category])
          return [...list.slice(0, last + 1), id, ...list.slice(last + 1).filter((s) => s !== id)]
        }
      }))
      const index = colors.indexOf(color)
      await createStatusAtomic(
        client,
        typeId as Ref<ProjectType>,
        tracker.class.IssueStatus,
        {
          ofAttribute: tracker.attribute.IssueStatus,
          name: title,
          category: categories[category],
          color: index >= 0 ? index : undefined,
          description: ''
        },
        placements
      )
    }
  }
  console.log(`[demo-data] statuses: ${files.map((f) => f.header.title).join(', ')}`)
}

async function createIssues (
  client: TxOperations,
  files: DemoFile[],
  persons: Map<string, Ref<any>>,
  logger: Logger,
  uploader: FileUploader
): Promise<void> {
  const importer = new WorkspaceImporter(client, logger, uploader, {})
  let count = 0
  for (const f of files) {
    const project = await client.findOne(tracker.class.Project, { name: f.folder })
    const number = parseInt(f.name)
    if (project === undefined || Number.isNaN(number)) continue
    const identifier = `${project.identifier}-${number}`
    if ((await client.findOne(tracker.class.Issue, { identifier })) !== undefined) continue
    const h = f.header
    await importer.createIssueWithSubissues(
      {
        class: tracker.class.Issue,
        title: h.title,
        number,
        status: { name: h.status },
        priority: h.priority,
        estimation: h.estimation,
        remainingTime: h.remainingTime,
        assignee: h.assignee !== undefined ? persons.get(h.assignee) : undefined,
        descrProvider: async () => f.body,
        subdocs: []
      },
      tracker.ids.NoParent,
      project,
      project._id,
      []
    )
    // The sequence hands out the next number: it must stay ahead of the imported ones
    const fresh = await client.findOne(tracker.class.Project, { _id: project._id })
    if (fresh !== undefined && fresh.sequence < number) {
      await client.updateDoc(tracker.class.Project, core.space.Space, project._id, { sequence: number })
    }
    count++
  }
  console.log(`[demo-data] extra issues: ${count}`)
}

async function createBoards (
  accounts: PlannerAccount[],
  files: DemoFile[],
  colors: string[],
  persons: Map<string, Ref<any>>
): Promise<void> {
  const [owner] = accounts
  const client = owner.client
  const hierarchy = client.getHierarchy()
  const projects = await client.findAll(tracker.class.Project, {})
  const projectTypes = await client.findAll(task.class.ProjectType, {})
  const statuses = await client.findAll(tracker.class.IssueStatus, {})
  const components: Component[] = await client.findAll(tracker.class.Component, {})
  const accountByName = new Map(
    accounts.map((a) => [formatName(a.person.name, 'false'), a.token.info.account as AccountUuid])
  )

  for (const f of files) {
    const src = f.header as DemoBoard
    if ((await client.findOne(tracker.class.Board, { title: src.title })) !== undefined) continue
    const ctx: BoardContext = {
      project: (id) => projects.find((p) => p.identifier === id)?._id,
      statuses: (name, ids) => {
        const allowed = new Set(
          projects
            .filter((p) => ids.includes(p.identifier))
            .flatMap((p) => projectTypes.find((t) => t._id === p.type)?.statuses.map((s) => s._id) ?? [])
        )
        return statuses.filter((s) => s.name === name && allowed.has(s._id)).map((s) => s._id)
      },
      category: (name) => categories[name],
      person: (name) => persons.get(name),
      account: (name) => accountByName.get(name),
      component: (label) => components.find((c) => c.label === label)?._id,
      color: (name) => {
        const index = colors.indexOf(name)
        return index >= 0 ? index : undefined
      },
      filterKey: (field) => filterKeyOf(hierarchy, field),
      me: owner.person._id,
      newId: () => generateId()
    }
    const { board, skipped } = convertBoard(src, ctx)
    for (const line of skipped) console.log(`[demo-data] board condition skipped: ${line}`)
    const id = await client.createDoc(tracker.class.Board, core.space.Workspace, board)
    // Pinned for the first account, the viewer of the mockups
    if (src.pinned === true) { await client.createDoc(tracker.class.BoardPreference, core.space.Workspace, { attachedTo: id }) }
    console.log(`[demo-data] board: ${src.title}${src.pinned === true ? ' (pinned)' : ''}`)
  }
}

export async function importDesignDemo (
  dir: string,
  accounts: PlannerAccount[],
  logger: Logger,
  uploader: FileUploader
): Promise<void> {
  if (!existsSync(dir)) throw new Error(`design demo dir not found: ${dir}`)
  const files = readFiles(dir)
  const byClass = (cls: string): DemoFile[] => files.filter((f) => f.header.class === cls)
  const colors = paletteNames()
  const client = accounts[0].client
  // Names as the mockups write them: "First Last"
  const persons = new Map(accounts.map((a) => [formatName(a.person.name, 'false'), a.person._id]))
  await createStatuses(client, byClass('tracker:class:IssueStatus'), colors)
  await createIssues(client, byClass('tracker:class:Issue'), persons, logger, uploader)
  await createBoards(accounts, byClass('tracker:class:Board'), colors, persons)
}

export function designDirFor (dir: string): string {
  const lang = /-en\/?$/.test(dir) ? 'en' : 'ru'
  return resolve(__dirname, '../../design/demo', lang)
}
