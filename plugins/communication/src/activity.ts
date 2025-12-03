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

import { Class, Doc, DocumentQuery, Ref, Tx } from '@hcengineering/core'

export interface Messageable extends Class<Doc> {
}

export interface ActivityControl<T extends Doc = Doc> extends Doc {
  objectClass: Ref<Class<Doc>>

  // A set of rules to be skipped from generate doc update activity messages
  skip: DocumentQuery<Tx>[]

  // Skip field activity operations.
  skipFields?: (keyof T)[]
  allowedFields?: (keyof T)[]
}

export interface IgnoreActivity extends Class<Doc> {}
