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

export interface AccentColorOption {
  id: string
  name: string
  value: string
  color: string
}

export const accentColorOptions: AccentColorOption[] = [
  {
    id: 'accent-intabia',
    name: 'Intabia',
    value: 'accent-intabia',
    color: '#CF13A2' // New Intabia accent color
  },
  {
    id: 'accent-huly',
    name: 'Huly',
    value: 'accent-huly',
    color: '#205DC2' // Restored Huly base color (pre-accent changes)
  },
  {
    id: 'accent-blue',
    name: 'Blue',
    value: 'accent-blue',
    color: '#3478F6'
  },
  {
    id: 'accent-purple',
    name: 'Purple',
    value: 'accent-purple',
    color: '#8A4292'
  },
  {
    id: 'accent-pink',
    name: 'Pink',
    value: 'accent-pink',
    color: '#E45C9C'
  },
  {
    id: 'accent-red',
    name: 'Red',
    value: 'accent-red',
    color: '#CE4745'
  },
  {
    id: 'accent-orange',
    name: 'Orange',
    value: 'accent-orange',
    color: '#E8883A'
  },
  {
    id: 'accent-yellow',
    name: 'Yellow',
    value: 'accent-yellow',
    color: '#F6C94E'
  },
  {
    id: 'accent-green',
    name: 'Green',
    value: 'accent-green',
    color: '#78B856'
  },
  {
    id: 'accent-graphite',
    name: 'Graphite',
    value: 'accent-graphite',
    color: '#989898'
  }
]

export function getAccentColorName (id: string): string {
  const option = accentColorOptions.find((o) => o.id === id)
  return option?.name ?? 'Blue'
}
