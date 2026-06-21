import type { Class, Doc, Domain, Ref } from '@hcengineering/core'

export enum QueueWorkspaceEvent {
  Up = 'up',
  Down = 'down',
  Created = 'created',
  CreateFailed = 'create-failed',
  Upgraded = 'upgraded',
  Upgradefailed = 'upgrade-failed',
  Deleted = 'deleted',
  Archived = 'archived',
  Restored = 'restored',
  Restoring = 'restoring',
  FullReindex = 'full-fulltext-reindex',
  Reindex = 'fulltext-reindex',
  ClearIndex = 'clear-fulltext-index',
  LimitsChanged = 'limits-changed'
}

export interface QueueWorkspaceMessage {
  type: QueueWorkspaceEvent
}

export interface QueueWorkspaceReindexMessage extends QueueWorkspaceMessage {
  type: QueueWorkspaceEvent.Reindex

  domain: Domain
  classes: Ref<Class<Doc>>[]
}

/** Which limit a LimitsChanged event is about. 'plan' = plan/limits snapshot changed
 * (upgrade/downgrade): consumers re-read plan limits. */
export enum LimitCategory {
  Disk = 'disk',
  Tokens = 'tokens',
  Transcript = 'transcript',
  Payment = 'payment',
  Plan = 'plan'
}

export enum LimitStatus {
  Exhausted = 'exhausted',
  Ok = 'ok'
}

export interface QueueWorkspaceLimitsMessage extends QueueWorkspaceMessage {
  type: QueueWorkspaceEvent.LimitsChanged

  category: LimitCategory
  status: LimitStatus
}

export const workspaceEvents = {
  open: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Up }),
  down: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Down }),
  created: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Created }),
  upgraded: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Upgraded }),
  upgradeFailed: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Upgradefailed }),
  createFailed: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.CreateFailed }),
  deleted: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Deleted }),
  archived: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Archived }),
  restoring: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Restoring }),
  restored: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.Restored }),
  fullReindex: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.FullReindex }),
  clearIndex: (): QueueWorkspaceMessage => ({ type: QueueWorkspaceEvent.ClearIndex }),
  limitsChanged: (category: LimitCategory, status: LimitStatus): QueueWorkspaceLimitsMessage => ({
    type: QueueWorkspaceEvent.LimitsChanged,
    category,
    status
  }),
  reindex: (domain: Domain, classes: Ref<Class<Doc>>[]): QueueWorkspaceReindexMessage => ({
    type: QueueWorkspaceEvent.Reindex,
    domain,
    classes
  })
}
