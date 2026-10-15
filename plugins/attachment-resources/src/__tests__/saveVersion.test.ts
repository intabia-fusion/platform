/* eslint-disable import/first */
/**
 * @jest-environment jsdom
 */

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

// Mocked before importing utils - Jest can't parse Svelte syntax otherwise.
jest.mock(
  '@hcengineering/platform',
  () => ({
    plugin: jest.fn(() => ({})),
    mergeIds: jest.fn(() => ({})),
    getMetadata: jest.fn(),
    getResource: jest.fn(),
    setPlatformStatus: jest.fn(),
    unknownError: jest.fn()
  }),
  { virtual: true }
)
jest.mock('@hcengineering/presentation', () => ({}), { virtual: true })
jest.mock('@hcengineering/ui', () => ({}), { virtual: true })
jest.mock('@hcengineering/workbench', () => ({}), { virtual: true })
jest.mock('@hcengineering/view', () => ({}), { virtual: true })
jest.mock('../components/AttachmentPreviewPopup.svelte', () => ({}), { virtual: true })

import { SaveVersion } from '../utils'

describe('SaveVersion', () => {
  it('drops the pre-save copy and takes the saved doc', () => {
    const version = new SaveVersion()
    version.seen(1000)
    version.saving(1000)
    expect(version.isAfterSave(1000)).toBe(false)
    expect(version.isAfterSave(1500)).toBe(true)
  })

  it('takes a newer copy seen before the save as the base, not the stale prop', () => {
    const version = new SaveVersion()
    version.seen(2000)
    version.saving(1000)
    expect(version.isAfterSave(2000)).toBe(false)
  })

  it("takes another user's edit made after the save, with the client clock an hour ahead", () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000 + 3600_000)
    try {
      const version = new SaveVersion()
      version.seen(1000)
      version.saving(1000)
      // Server time: our save at 1100, the other edit at 1200.
      expect(version.isAfterSave(1100)).toBe(true)
      expect(version.isAfterSave(1200)).toBe(true)
    } finally {
      now.mockRestore()
    }
  })
})
