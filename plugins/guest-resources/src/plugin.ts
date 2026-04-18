import guest, { guestId } from '@intabiafusion/guest'
import { type IntlString, mergeIds } from '@intabiafusion/platform'

export default mergeIds(guestId, guest, {
  string: {
    CreatePublicLink: '' as IntlString,
    PublicLink: '' as IntlString,
    Revoke: '' as IntlString,
    Copy: '' as IntlString,
    RevokeConfirmation: '' as IntlString,
    LinkWasRevoked: '' as IntlString
  }
})
