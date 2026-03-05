//
// Copyright © 2025 Hardcore Engineering Inc.
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

export const ThemeVariant = {
  Light: 'theme-light',
  Dark: 'theme-dark'
} as const

export type ThemeVariantType = (typeof ThemeVariant)[keyof typeof ThemeVariant]

export const AccentColor = {
  Intabia: 'accent-intabia',
  Intabia2: 'accent-intabia2',
  Huly: 'accent-huly',
  Blue: 'accent-blue',
  Purple: 'accent-purple',
  Pink: 'accent-pink',
  Red: 'accent-red',
  Orange: 'accent-orange',
  Yellow: 'accent-yellow',
  Green: 'accent-green',
  Graphite: 'accent-graphite'
} as const

export type AccentColorType = (typeof AccentColor)[keyof typeof AccentColor]
