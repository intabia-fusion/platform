import type { Doc, Ref } from '@hcengineering/core'

export type DocsCache = Map<Ref<Doc>, Doc | null>
export const ActivityMessagesTriggerCacheKey = 'ActivityMessagesTrigger'
