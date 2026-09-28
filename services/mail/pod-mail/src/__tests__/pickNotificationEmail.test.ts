import { SocialIdType, type PersonId, type SocialId } from '@hcengineering/core'

import { pickNotificationEmail } from '../notification'

// notification.ts pulls in config, which throws without the service's env.
jest.mock('../config', () => ({
  __esModule: true,
  default: { source: 'platform@intabia.ru', replyTo: 'support@intabia.ru', mode: 'queue', port: 1025 }
}))

const id = (
  _id: string,
  value: string,
  type: SocialIdType = SocialIdType.EMAIL,
  extra: Partial<SocialId> = {}
): SocialId => ({ _id: _id as PersonId, type, value, key: `${type}:${value}`, verifiedOn: 1, ...extra })

describe('pickNotificationEmail', () => {
  it('takes the first verified email or Google identity that was not released', () => {
    expect(
      pickNotificationEmail([
        id('gone', 'gone@example.com', SocialIdType.EMAIL, { isDeleted: true }),
        id('pending', 'pending@example.com', SocialIdType.EMAIL, { verifiedOn: undefined }),
        id('google', 'me@gmail.com', SocialIdType.GOOGLE),
        id('work', 'work@example.com')
      ])
    ).toBe('me@gmail.com')
  })

  it('has nothing to send to without a verified email', () => {
    expect(pickNotificationEmail([id('phone', '+1', SocialIdType.PHONE)])).toBeUndefined()
  })
})
