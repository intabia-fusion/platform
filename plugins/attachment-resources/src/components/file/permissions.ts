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

import type { Attachment } from '@hcengineering/attachment'
import contact, { type PermissionsStore } from '@hcengineering/contact'
import core, { type BlobType } from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import { readable, type Readable } from 'svelte/store'

import { isAttachment } from '../../utils'

let permissions: Promise<Readable<PermissionsStore>> | undefined

/** Loaded once for every card that offers to delete. */
export async function permissionsStore (): Promise<Readable<PermissionsStore>> {
  // A failed load is not kept: the next card asks again.
  permissions ??= getResource(contact.store.Permissions).catch((err) => {
    permissions = undefined
    throw err
  })
  return await permissions
}

const unknown = readable<PermissionsStore | undefined>(undefined)

const loaded = readable<PermissionsStore | undefined>(undefined, (set) => {
  let unsubscribe: (() => void) | undefined
  let stopped = false
  void permissionsStore().then((store) => {
    if (!stopped) unsubscribe = store.subscribe(set)
  })
  return () => {
    stopped = true
    unsubscribe?.()
  }
})

/** Only a card that offers to delete loads the permissions. */
export function permissionsFor (removable: boolean): Readable<PermissionsStore | undefined> {
  return removable ? loaded : unknown
}

export function mayRemove (value: Attachment | BlobType, store: PermissionsStore | undefined): boolean {
  if (!isAttachment(value)) return true
  if (store == null) return false
  return (
    value.readonly !== true &&
    (store.whitelist.has(value.space) || !store.ps[value.space]?.has(core.permission.ForbidDeleteObject))
  )
}
