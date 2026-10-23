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

import { getPlatformColorDef, PaletteColorIndexes } from '@hcengineering/ui'
import type { StatusCategory } from './types'

// Palette color of a status category when the status has none (kit.CATEGORY of the Penpot kit)
export const categoryColor: Record<StatusCategory, string> = {
  backlog: 'Cloud',
  todo: 'Porpoise',
  active: 'Cerulean',
  won: 'Grass',
  lost: 'Coin'
}

export const paletteIndex = (name: string): number => PaletteColorIndexes[name as keyof typeof PaletteColorIndexes]

// CSS colors of a palette color name; a value that is not a name (hex) is used as is
export function paletteDef (name: string, dark: boolean): { color: string, title: string, background: string } {
  if (name.startsWith('#') || name.startsWith('var(')) return { color: name, title: name, background: name }
  const def = getPlatformColorDef(paletteIndex(name), dark)
  return { color: def.color, title: def.title ?? def.color, background: def.background ?? def.color }
}
