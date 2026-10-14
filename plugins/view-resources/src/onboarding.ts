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

import { derived, readable, type Readable } from 'svelte/store'

import core, { type Doc } from '@hcengineering/core'
import { createQuery, getClient } from '@hcengineering/presentation'
import workbench, { type OnboardingPreference } from '@hcengineering/workbench'

type OnboardingPreferenceData = Omit<OnboardingPreference, keyof Doc>

const defaultPreference: OnboardingPreferenceData = {
  attachedTo: '',
  showHints: true,
  completed: [],
  skipped: [],
  progress: {}
}

// Whole preference doc, lazy live query started on first subscriber
// (settings page, onboarding button, empty states).
export const onboardingPreference: Readable<OnboardingPreference | undefined> = readable<
  OnboardingPreference | undefined
>(undefined, (set) => {
  const query = createQuery(true)
  query.query(workbench.class.OnboardingPreference, {}, (res) => {
    set(res[0])
  })
  return () => {
    query.unsubscribe()
  }
})

// Per-user "show onboarding hints" flag; gates "create first X" buttons in empty states.
export const onboardingHints: Readable<boolean> = derived(onboardingPreference, (p) => p?.showHints ?? true)

export async function updateOnboardingPreference (patch: Partial<OnboardingPreferenceData>): Promise<void> {
  const client = getClient()
  const existing = await client.findOne(workbench.class.OnboardingPreference, {})
  if (existing === undefined) {
    await client.createDoc<OnboardingPreference>(workbench.class.OnboardingPreference, core.space.Workspace, {
      ...defaultPreference,
      startedAt: Date.now(),
      ...patch
    })
  } else {
    await client.updateDoc(workbench.class.OnboardingPreference, existing.space, existing._id, patch)
  }
}

// Records the first time a stable key happens (widget opened, card action clicked, card done);
// later occurrences are no-ops so the timestamp always reflects the first one, for analytics.
export async function markOnboardingProgress (key: string): Promise<void> {
  const client = getClient()
  const existing = await client.findOne(workbench.class.OnboardingPreference, {})
  if (existing?.progress?.[key] !== undefined) return
  await updateOnboardingPreference({ progress: { ...(existing?.progress ?? {}), [key]: Date.now() } })
}
