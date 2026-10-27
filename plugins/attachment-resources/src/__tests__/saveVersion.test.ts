/* eslint-disable import/first */
/**
 * @vitest-environment jsdom
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

import { describe, expect, it, vi } from 'vitest'

// Mocked before importing utils: keeps the platform's heavy modules out of a pure test.
vi.mock('@hcengineering/platform', () => ({
  plugin: vi.fn(() => ({})),
  mergeIds: vi.fn(() => ({})),
  getMetadata: vi.fn(),
  getResource: vi.fn(),
  setPlatformStatus: vi.fn(),
  unknownError: vi.fn()
}))
vi.mock('@hcengineering/presentation', () => ({}))
vi.mock('@hcengineering/ui', () => ({}))
vi.mock('@hcengineering/workbench', () => ({}))
vi.mock('@hcengineering/view', () => ({}))
vi.mock('../components/AttachmentPreviewPopup.svelte', () => ({}))

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
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000 + 3600_000)
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
