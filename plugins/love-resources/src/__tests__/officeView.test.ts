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

import { officeViewOf } from '../officeView'

describe('officeViewOf', () => {
  it('opens the meetings tab', () => {
    expect(officeViewOf('meetings')).toBe('meetings')
  })

  it('opens the groups tab', () => {
    expect(officeViewOf('groups')).toBe('groups')
  })

  // The tab used to be called "permanent meetings"; old links and bookmarks must still open it.
  it('maps the old permanent segment to the groups tab', () => {
    expect(officeViewOf('permanent')).toBe('groups')
  })

  it('shows the floors when the office was just opened', () => {
    expect(officeViewOf(undefined)).toBe('floors')
  })

  it('treats any other segment as a floor id', () => {
    expect(officeViewOf('abc123')).toBe('floor')
  })
})
