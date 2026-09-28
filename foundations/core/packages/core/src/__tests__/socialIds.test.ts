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

import { SocialIdType, type PersonId, type SocialId } from '../classes'
import { pickVerifiedEmail } from '../utils'

const id = (
  _id: string,
  value: string,
  type: SocialIdType = SocialIdType.EMAIL,
  extra: Partial<SocialId> = {}
): SocialId => ({ _id: _id as PersonId, type, value, key: `${type}:${value}`, verifiedOn: 1, ...extra })

describe('pickVerifiedEmail', () => {
  it('takes the first verified email or Google identity that was not released', () => {
    expect(
      pickVerifiedEmail([
        id('gone', 'gone@example.com', SocialIdType.EMAIL, { isDeleted: true }),
        id('pending', 'pending@example.com', SocialIdType.EMAIL, { verifiedOn: undefined }),
        id('google', 'me@gmail.com', SocialIdType.GOOGLE),
        id('work', 'work@example.com')
      ])
    ).toBe('me@gmail.com')
  })

  it('has nothing to send to without a verified email', () => {
    expect(pickVerifiedEmail([id('phone', '+1', SocialIdType.PHONE)])).toBeUndefined()
    expect(pickVerifiedEmail([])).toBeUndefined()
  })
})
