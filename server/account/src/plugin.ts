import { type IntlString, type Metadata, plugin, type Plugin } from '@hcengineering/platform'
import { type PlatformQueueProducer, type QueueWorkspaceLimitsMessage } from '@hcengineering/server-core'
import { type TierLimits } from './types'

/**
 * @public
 */
export const accountId = 'account' as Plugin

export interface EmailNotification {
  html: string
  to: string
  text: string
  subject: string
}
export interface AccountNotification {
  type: 'email'
  data: any
}

export interface CrmNotification {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  cookies?: string
}

/**
 * @public
 */
export const accountPlugin = plugin(accountId, {
  metadata: {
    FrontURL: '' as Metadata<string>,
    ProductName: '' as Metadata<string>,
    Transactors: '' as Metadata<string>,
    OtpTimeToLiveSec: '' as Metadata<number>,
    OtpRetryDelaySec: '' as Metadata<number>,
    WsLivenessDays: '' as Metadata<number>,
    AllowReadonlyGuests: '' as Metadata<boolean>,
    // Free fallback limits (defaults, FREE_PLAN_LIMITS env overrides). Always present — applied to every
    // tier subscription on read; an unpaid workspace runs on these instead of full read-only. Not persisted.
    FreePlanLimits: '' as Metadata<TierLimits>,
    MailQueue: '' as Metadata<PlatformQueueProducer<AccountNotification>>,
    CrmQueue: '' as Metadata<PlatformQueueProducer<CrmNotification>>,
    WorkspaceQueue: '' as Metadata<PlatformQueueProducer<QueueWorkspaceLimitsMessage>>
  },
  string: {
    ConfirmationText: '' as IntlString,
    ConfirmationHTML: '' as IntlString,
    ConfirmationSubject: '' as IntlString,
    RecoveryText: '' as IntlString,
    RecoveryHTML: '' as IntlString,
    RecoverySubject: '' as IntlString,
    InviteText: '' as IntlString,
    InviteHTML: '' as IntlString,
    InviteSubject: '' as IntlString,
    ResendInviteText: '' as IntlString,
    ResendInviteHTML: '' as IntlString,
    ResendInviteSubject: '' as IntlString,
    OtpText: '' as IntlString,
    OtpHTML: '' as IntlString,
    OtpSubject: '' as IntlString
  }
})
