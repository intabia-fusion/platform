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

import task from '@hcengineering/task'
import { timeManagedUpdate } from '../timeManaged'

const { Active, Won, Lost, UnStarted } = task.statusCategory

describe('timeManagedUpdate', () => {
  it('Active fills start only if empty', () => {
    expect(timeManagedUpdate(undefined, Active, 10)).toEqual({ startDate: 10 })
    expect(timeManagedUpdate({ startDate: 5 }, Active, 10)).toEqual({})
  })
  it('Won/Lost and reopen do not touch dates', () => {
    expect(timeManagedUpdate(undefined, Won, 10)).toEqual({})
    expect(timeManagedUpdate({ startDate: 50 }, Lost, 10)).toEqual({})
    expect(timeManagedUpdate({ startDate: 5 }, Active, 10)).toEqual({})
  })
  it('ignores other categories', () => {
    expect(timeManagedUpdate(undefined, UnStarted, 10)).toEqual({})
    expect(timeManagedUpdate(undefined, undefined, 10)).toEqual({})
  })
})
