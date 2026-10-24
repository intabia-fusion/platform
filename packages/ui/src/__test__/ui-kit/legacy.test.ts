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

import { describe, expect, it } from 'vitest'

import { fromLegacySelectWidth } from '../../ui-kit/button/legacy'

describe('legacy button values', () => {
  it('keeps a wrapper width only for a width the place sets', () => {
    expect(fromLegacySelectWidth('100%')).toBe('100%')
    expect(fromLegacySelectWidth('10rem')).toBe('10rem')
    expect(fromLegacySelectWidth('min-content')).toBeUndefined()
    expect(fromLegacySelectWidth(undefined)).toBeUndefined()
  })
})
