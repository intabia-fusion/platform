import { type IntlString, type Metadata, plugin, type Plugin } from '@hcengineering/platform'
import { type PlatformQueueProducer } from '@hcengineering/server-core'

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
    MailQueue: '' as Metadata<PlatformQueueProducer<AccountNotification>>
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
