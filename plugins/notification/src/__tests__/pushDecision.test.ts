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

import type { Doc, Ref } from '@hcengineering/core'

import { shouldSuppressPush, type PushVisibilityState, type PushWindowClient } from '../pushDecision'

const objectId = '66aa1234abcd' as Ref<Doc>
const origin = 'https://app.example.com'

function client (
  url: string,
  focused = true,
  visibilityState: PushVisibilityState = 'visible',
  id?: string
): PushWindowClient {
  return { id, focused, visibilityState, url }
}

describe('shouldSuppressPush', () => {
  it('suppresses when a focused visible tab shows the channel by its link id', () => {
    expect(shouldSuppressPush({ objectId }, [client(`${origin}/workbench/ws/chunter/general-${objectId}`)])).toBe(true)
  })

  it('suppresses when the tab addresses the object as id|class, percent-encoded', () => {
    const segment = encodeURIComponent(`${objectId}|chunter:class:Channel`)
    expect(
      shouldSuppressPush({ objectId }, [client(`${origin}/workbench/ws/notification/ctx-1/${segment}?message=m`)])
    ).toBe(true)
  })

  it('suppresses for a thread open by its root message id', () => {
    expect(shouldSuppressPush({ objectId }, [client(`${origin}/workbench/ws/chunter/general-c1/${objectId}`)])).toBe(
      true
    )
  })

  it('shows when the tab with the document is not focused or is hidden', () => {
    const url = `${origin}/workbench/ws/chunter/general-${objectId}`
    expect(shouldSuppressPush({ objectId }, [client(url, false, 'visible')])).toBe(false)
    expect(shouldSuppressPush({ objectId }, [client(url, true, 'hidden')])).toBe(false)
  })

  it('shows when the focused tab is on another document of the same origin', () => {
    expect(shouldSuppressPush({ objectId }, [client(`${origin}/workbench/ws/chunter/random-other1`)])).toBe(false)
  })

  it('never matches an id that is only a substring of a segment', () => {
    expect(shouldSuppressPush({ objectId }, [client(`${origin}/workbench/ws/chunter/x${objectId}y`)])).toBe(false)
  })

  it('never suppresses without an object id or without clients', () => {
    expect(shouldSuppressPush({}, [client(`${origin}/workbench/ws/chunter/general-${objectId}`)])).toBe(false)
    expect(shouldSuppressPush({ objectId }, [])).toBe(false)
  })

  it('ignores a client with an unparsable url', () => {
    expect(shouldSuppressPush({ objectId }, [client('not a url')])).toBe(false)
  })

  describe('what the tab reported it shows (sidebar)', () => {
    const inboxUrl = `${origin}/workbench/ws/notification`

    it('suppresses when the focused tab reports the object open in its sidebar', () => {
      const viewing = new Map([['c1', ['other-doc' as Ref<Doc>, objectId]]])
      expect(shouldSuppressPush({ objectId }, [client(inboxUrl, true, 'visible', 'c1')], viewing)).toBe(true)
    })

    it('ignores what a hidden or unfocused tab reports', () => {
      const viewing = new Map([['c1', [objectId]]])
      expect(shouldSuppressPush({ objectId }, [client(inboxUrl, false, 'visible', 'c1')], viewing)).toBe(false)
      expect(shouldSuppressPush({ objectId }, [client(inboxUrl, true, 'hidden', 'c1')], viewing)).toBe(false)
    })

    it('ignores a report of another tab', () => {
      const viewing = new Map([['c2', [objectId]]])
      expect(shouldSuppressPush({ objectId }, [client(inboxUrl, true, 'visible', 'c1')], viewing)).toBe(false)
    })

    it('falls back to the url when the tab did not answer', () => {
      const viewing = new Map<string, Array<Ref<Doc>>>()
      expect(
        shouldSuppressPush(
          { objectId },
          [client(`${origin}/workbench/ws/chunter/general-${objectId}`, true, 'visible', 'c1')],
          viewing
        )
      ).toBe(true)
    })

    it('shows when the tab answered and the object is neither reported nor in the url', () => {
      const viewing = new Map([['c1', ['other-doc' as Ref<Doc>]]])
      expect(shouldSuppressPush({ objectId }, [client(inboxUrl, true, 'visible', 'c1')], viewing)).toBe(false)
    })
  })
})
