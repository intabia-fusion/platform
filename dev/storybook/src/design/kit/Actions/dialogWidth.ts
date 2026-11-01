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

import type { DialogWidth } from '@hcengineering/ui/kit'

// Named widths of the product Dialog in px: x-small 25rem ... x-large 58.25rem
const widths: Array<[DialogWidth, number]> = [
  ['x-small', 400],
  ['small', 480],
  ['medium', 600],
  ['large', 720],
  ['x-large', 932]
]

export function dialogWidth (px: number | undefined): DialogWidth | undefined {
  if (px === undefined) return undefined
  return widths.reduce((best, w) => (Math.abs(w[1] - px) < Math.abs(best[1] - px) ? w : best))[0]
}
