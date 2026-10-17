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

import core from '@hcengineering/core'
import emoji from '@hcengineering/emoji'
import { type Builder } from '@hcengineering/model'
import view, { type Action } from '@hcengineering/view'

import rating from './plugin'

export function createActions (builder: Builder): void {
  builder.createDoc<Action>(
    view.class.Action,
    core.space.Model,
    {
      action: rating.actionImpl.ToggleStar,
      label: rating.string.AddStar,
      icon: rating.icon.Rating,
      input: 'focus',
      category: view.category.General,
      target: core.class.Doc,
      context: { mode: ['header'], order: 2 }
    },
    rating.action.ToggleStar
  )
  builder.createDoc<Action>(
    view.class.Action,
    core.space.Model,
    {
      action: rating.actionImpl.AddReaction,
      label: rating.string.AddReaction,
      icon: emoji.icon.EmojiAdd,
      input: 'focus',
      category: view.category.General,
      target: core.class.Doc,
      context: { mode: ['header'], order: 3 }
    },
    rating.action.AddReaction
  )
}
