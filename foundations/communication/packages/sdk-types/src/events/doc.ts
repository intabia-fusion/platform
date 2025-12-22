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

import type { Ref, Doc, Class } from '@hcengineering/core'

import type { BaseEvent } from './common'

export enum DocEventType {
  UpdateClassDoc = 'updateClassDoc',
  RemoveDoc = 'removeDoc'
}

export type DocEvent = UpdateClassDocEvent | RemoveDocEvent

export interface UpdateClassDocEvent extends BaseEvent {
  type: DocEventType.UpdateClassDoc
  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  newClass: Ref<Class<Doc>>
}

export interface RemoveDocEvent extends BaseEvent {
  type: DocEventType.RemoveDoc
  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
}
