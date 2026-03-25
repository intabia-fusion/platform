//
// Copyright © 2026 Intabia Fusion Inc.
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

import {
  Branding,
  type Class,
  type Doc,
  type DocumentQuery,
  type FindOptions,
  FindResult,
  Hierarchy,
  MeasureContext,
  ModelDb,
  Ref,
  TxFactory,
  type WithLookup,
  WorkspaceInfoWithStatus
} from '@hcengineering/core'
import { StorageAdapter } from '@hcengineering/storage'

export interface Client {
  ctx: MeasureContext
  workspace: WorkspaceInfoWithStatus
  storage: StorageAdapter
  model: ModelDb
  hierarchy: Hierarchy
  branding?: Branding
  txFactory: TxFactory
  findAll: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<FindResult<T>>

  findOne: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<WithLookup<T> | undefined>
}
