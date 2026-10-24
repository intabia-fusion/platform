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

import { getEmbeddedLabel } from '@hcengineering/platform'
import type { FilterButtonActiveFilter, FilterButtonCategory } from '@hcengineering/ui/kit'

export const categories: FilterButtonCategory[] = [
  {
    id: 'type',
    label: getEmbeddedLabel('Type'),
    options: [
      { id: 'user', label: getEmbeddedLabel('User') },
      { id: 'group', label: getEmbeddedLabel('Group') },
      { id: 'channel', label: getEmbeddedLabel('Channel') }
    ]
  },
  {
    id: 'mode',
    label: getEmbeddedLabel('Sync mode'),
    options: [
      { id: 'enabled', label: getEmbeddedLabel('Sync enabled') },
      { id: 'disabled', label: getEmbeddedLabel('Sync disabled') }
    ]
  }
]

export const typeGroup: FilterButtonActiveFilter = {
  categoryId: 'type',
  optionId: 'group',
  categoryLabel: getEmbeddedLabel('Type'),
  optionLabel: getEmbeddedLabel('Group')
}

export const modeEnabled: FilterButtonActiveFilter = {
  categoryId: 'mode',
  optionId: 'enabled',
  categoryLabel: getEmbeddedLabel('Sync mode'),
  optionLabel: getEmbeddedLabel('Sync enabled')
}
