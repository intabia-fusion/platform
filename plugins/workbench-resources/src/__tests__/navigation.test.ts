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

import type { NavigatorModel } from '@hcengineering/workbench'
import { hasApplicationNavigator } from '../navigation'

describe('application menu availability', () => {
  it.each(['chunter', 'notification', 'time', 'setting', 'hr', 'process'])(
    'keeps the menu button for %s before the workspace model is upgraded',
    (alias) => {
      expect(hasApplicationNavigator({ alias }, undefined)).toBe(true)
    }
  )

  it('hides the menu button in Office and other applications without a menu', () => {
    expect(hasApplicationNavigator({ alias: 'love' }, undefined)).toBe(false)
    expect(hasApplicationNavigator({ alias: 'custom' }, undefined)).toBe(false)
    expect(hasApplicationNavigator(undefined, undefined)).toBe(false)
  })

  it('recognizes the standard navigator independently of the custom menu flag', () => {
    const navigator: NavigatorModel = { spaces: [] }
    expect(hasApplicationNavigator({ alias: 'tracker' }, navigator)).toBe(true)
  })

  it('uses explicit custom menu availability when the workspace model provides it', () => {
    expect(hasApplicationNavigator({ alias: 'custom', hasNavigator: true }, undefined)).toBe(true)
    expect(hasApplicationNavigator({ alias: 'notification', hasNavigator: false }, undefined)).toBe(false)
  })
})
