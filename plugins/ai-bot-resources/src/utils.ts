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
import { writable } from 'svelte/store'
import { type Ref } from '@hcengineering/core'
import contact, { getFirstName, type Person, type SocialIdentity } from '@hcengineering/contact'
import { createQuery } from '@hcengineering/presentation'
import { aiBotEmailSocialKey } from '@hcengineering/ai-bot'

// Empty until the query resolves, and empty again if the bot has not been provisioned yet.
export const aiBotSocialIdentityStore = writable<SocialIdentity | undefined>(undefined)
/** First name of the bot as the pod created it (FIRST_NAME), for labels that name the assistant. */
export const aiBotNameStore = writable<string>('')
const identityQuery = createQuery(true)
const personQuery = createQuery(true)

let identityLoaded: Promise<void> | undefined

export async function ensureAiBotIdentityLoaded (): Promise<void> {
  identityLoaded ??= loadAiBotIdentity()
  await identityLoaded
}

async function loadAiBotIdentity (): Promise<void> {
  await new Promise<void>((resolve) => {
    identityQuery.query(contact.class.SocialIdentity, { key: aiBotEmailSocialKey }, (res) => {
      const identity = res[0]
      aiBotSocialIdentityStore.set(identity)
      if (identity !== undefined) loadAiBotName(identity.attachedTo)
      resolve()
    })
  })
}

function loadAiBotName (person: Ref<Person>): void {
  personQuery.query<Person>(contact.class.Person, { _id: person }, (persons) => {
    aiBotNameStore.set(getFirstName(persons[0]?.name ?? ''))
  })
}
