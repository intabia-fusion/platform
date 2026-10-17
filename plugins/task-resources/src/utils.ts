import {
  type CategoryType,
  type Class,
  type Doc,
  type DocumentQuery,
  type Hierarchy,
  type IdMap,
  type Ref,
  type Space,
  type Status,
  type TxOperations
} from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import { getStatusNameSuffixes, type Project, type ProjectType, type Task, type TaskType } from '@hcengineering/task'
import {
  type CategoryOption,
  type ViewOptionModel,
  type ViewOptions,
  type ViewQueryOption,
  type Viewlet
} from '@hcengineering/view'
import { getCategories, getCategorySpaces, concatCategories } from '@hcengineering/view-resources'
import { clearSettingsStore } from '@hcengineering/setting-resources'
import { getCurrentResolvedLocation, navigate } from '@hcengineering/ui'

/**
 * @public
 */
export async function updateTaskKanbanCategories (
  client: TxOperations,
  viewlet: Viewlet,
  _class: Ref<Class<Doc>>,
  space: Ref<Space> | undefined,
  docs: Doc[],
  groupByKey: string,
  viewOptions: ViewOptions,
  viewOptionsModel: ViewOptionModel[] | undefined,
  update: () => void,
  queryId: Ref<Doc>
): Promise<CategoryType[]> {
  let categories = await getCategories(client, _class, space, docs, groupByKey, viewlet.descriptor)
  for (const viewOption of viewOptionsModel ?? []) {
    if (viewOption.actionTarget !== 'category') continue
    const categoryFunc = viewOption as CategoryOption
    if ((viewOptions[viewOption.key] as boolean) ?? viewOption.defaultValue) {
      const categoryAction = await getResource(categoryFunc.action)

      const spaces = getCategorySpaces(categories)
      if (space !== undefined) {
        spaces.push(space)
      }
      const res = await categoryAction(
        _class,
        spaces.length > 0 ? { space: { $in: Array.from(spaces.values()) } } : {},
        space,
        groupByKey,
        update,
        queryId,
        viewlet.descriptor
      )
      if (res !== undefined) {
        categories = concatCategories(res, categories)
        break
      }
    }
  }
  return categories
}

/**
 * @public
 */
export async function getTaskKanbanResultQuery (
  hierarchy: Hierarchy,
  query: DocumentQuery<Task>,
  viewOptions: ViewOptionModel[] | undefined,
  viewOptionsStore: ViewOptions
): Promise<DocumentQuery<Task>> {
  if (viewOptions === undefined) return query
  let result = hierarchy.clone(query)
  for (const viewOption of viewOptions) {
    if (viewOption.actionTarget !== 'query') continue
    const queryOption = viewOption as ViewQueryOption
    const f = await getResource(queryOption.action)
    result = f(viewOptionsStore[queryOption.key] ?? queryOption.defaultValue, result)
  }
  return result
}

/**
 * Opens the settings of a task type inside the project type settings.
 * @public
 */
export function openTaskTypeSettings (id: Ref<TaskType> | undefined): void {
  const loc = getCurrentResolvedLocation()
  if (id !== undefined) {
    loc.path[5] = 'taskTypes'
    loc.path[6] = id
    loc.path.length = 7
  } else {
    loc.path.length = 5
  }

  clearSettingsStore()
  navigate(loc)
}

/**
 * Opens a workflow inside the project type settings.
 * @public
 */
export function openWorkflowSettings (id: string): void {
  const loc = getCurrentResolvedLocation()
  loc.path[5] = 'workflows'
  loc.path[6] = id
  loc.path.length = 7

  clearSettingsStore()
  navigate(loc)
}

let suffixCache: { key: unknown[], value: Map<Ref<Status>, string> } | undefined

/**
 * Name suffixes of the statuses among `values` (group values of one list), computed once per list state:
 * every header of the list calls this with the same inputs.
 * @public
 */
export function getSuffixes (
  values: CategoryType[],
  statuses: IdMap<Status>,
  types: IdMap<ProjectType>,
  projects: IdMap<Project>,
  taskTypes: IdMap<TaskType>
): Map<Ref<Status>, string> {
  const key = [values, statuses, types, projects, taskTypes]
  if (suffixCache?.key.every((it, i) => it === key[i]) === true) return suffixCache?.value ?? new Map()
  const shown = values.map((it) => statuses.get(it as Ref<Status>)).filter((it): it is Status => it !== undefined)
  const value = getStatusNameSuffixes(shown, types.values(), projects.values(), taskTypes.values())
  suffixCache = { key, value }
  return value
}
