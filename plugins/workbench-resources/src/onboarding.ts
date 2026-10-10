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

import { getCurrentAccount, hasAccountRole, type Ref } from '@hcengineering/core'
import { getMetadata, getResource, type IntlString } from '@hcengineering/platform'
import { createQuery, getClient } from '@hcengineering/presentation'
import {
  deviceOptionsStore,
  getCurrentResolvedLocation,
  navigate,
  setNavigatorVisible,
  showPopup,
  waitForElement
} from '@hcengineering/ui'
import { markOnboardingProgress, onboardingPreference, updateOnboardingPreference } from '@hcengineering/view-resources'
import {
  type Application,
  type OnboardingAction,
  type OnboardingCard,
  type OnboardingPreference
} from '@hcengineering/workbench'
import { derived, get, readable, writable, type Readable } from 'svelte/store'

import workbench from './plugin'
import { isAllowedToRole } from './utils'

// Steps the current account can see, in `order`.
function getOnboardingSteps (hiddenAppIds: Array<Ref<Application>>): OnboardingCard[] {
  const client = getClient()
  const account = getCurrentAccount()
  const allApps = client.getModel().findAllSync<Application>(workbench.class.Application, {})
  const excludedApps = getMetadata(workbench.metadata.ExcludedApplications) ?? []

  function isVisible (card: OnboardingCard): boolean {
    if (card.accessLevel !== undefined && !hasAccountRole(account, card.accessLevel)) return false
    if (card.application === undefined) return true
    const app = allApps.find((a) => a._id === card.application)
    if (app === undefined || app.hidden) return false
    if (excludedApps.includes(app._id) || hiddenAppIds.includes(app._id)) return false
    return isAllowedToRole(app.accessLevel, account)
  }

  return client
    .getModel()
    .findAllSync<OnboardingCard>(workbench.class.OnboardingCard, {})
    .filter(isVisible)
    .sort((a, b) => a.order - b.order)
}

export type OnboardingStepState = 'completed' | 'skipped' | undefined

function getStepState (pref: OnboardingPreference | undefined, id: Ref<OnboardingCard>): OnboardingStepState {
  if (pref?.completed.includes(id) === true) return 'completed'
  if (pref?.skipped?.includes(id) === true) return 'skipped'
  return undefined
}

export interface OnboardingCategory {
  label: IntlString
  steps: number[] // indexes into OnboardingProgress.steps
}

export interface OnboardingProgress {
  steps: OnboardingCard[] // visible steps in order
  states: OnboardingStepState[] // per step
  categories: OnboardingCategory[] // in the order of their first step
  current?: OnboardingCard // first step neither done nor skipped; undefined once all are passed
  done: number // done or skipped, out of the visible steps only
  total: number
  showHints: boolean
  cancelled: boolean
}

const hiddenApps: Readable<Array<Ref<Application>>> = readable<Array<Ref<Application>>>([], (set) => {
  const query = createQuery(true)
  query.query(workbench.class.HiddenApplication, {}, (res) => {
    set(res.map((r) => r.attachedTo))
  })
  return () => {
    query.unsubscribe()
  }
})

// Shared by the top bar button, its step popup and the settings counter.
export const onboardingProgress: Readable<OnboardingProgress> = derived(
  [onboardingPreference, hiddenApps],
  ([pref, hidden]) => {
    const steps = getOnboardingSteps(hidden)
    const states = steps.map((s) => getStepState(pref, s._id))
    const categories: OnboardingCategory[] = []
    steps.forEach((s, i) => {
      const category = categories.find((c) => c.label === s.category)
      if (category === undefined) categories.push({ label: s.category, steps: [i] })
      else category.steps.push(i)
    })
    return {
      steps,
      states,
      categories,
      current: steps.find((s, i) => states[i] === undefined),
      done: states.filter((s) => s !== undefined).length,
      total: steps.length,
      showHints: pref?.showHints ?? true,
      cancelled: pref?.cancelled === true
    }
  }
)

// Screenshots live in the front's public dir (dev/prod/public/onboarding), one set per UI language,
// file named after the card id, with _<n> for the n-th of `screenshots`;
// tests/sanity/tests/onboarding/screenshots.spec.ts re-shoots them.
export function getStepScreenshot (card: OnboardingCard, language: string, n?: number): string {
  return `/onboarding/${language}/${card._id.replace(/:/g, '_')}${n !== undefined ? `_${n}` : ''}.jpg`
}

// Bumped to ask the top bar button to open its popup right after a restart.
export const onboardingOpenRequest = writable(0)

// Help center "take the tour again": all steps again, and the button back even if hints were off or the tour cancelled.
export async function restartOnboarding (): Promise<void> {
  await updateOnboardingPreference({
    completed: [],
    skipped: [],
    startedAt: Date.now(),
    showHints: true,
    cancelled: false
  })
  onboardingOpenRequest.update((n) => n + 1)
}

// Writes are chained and read the stored doc: several doneWhen queries can fire at once on mount,
// and parallel read-modify-writes would drop entries.
let writes = Promise.resolve()
export async function passOnboardingStep (id: Ref<OnboardingCard>, how: 'completed' | 'skipped'): Promise<void> {
  const next = writes.then(async () => {
    const existing = await getClient().findOne(workbench.class.OnboardingPreference, {})
    const list = (how === 'completed' ? existing?.completed : existing?.skipped) ?? []
    if (list.includes(id)) return
    await markOnboardingProgress(`${id}:${how === 'completed' ? 'done' : 'skipped'}`)
    await updateOnboardingPreference(how === 'completed' ? { completed: [...list, id] } : { skipped: [...list, id] })
  })
  // A failed write must not block the ones queued after it.
  writes = next.catch(() => {})
  await next
}

// "Do it": goes to the step's app, then opens its dialog or presses the button the screenshot shows.
// Returns false when that button is not there (no rights, hidden feature).
export async function runOnboardingAction (card: OnboardingCard, action: OnboardingAction): Promise<boolean> {
  await markOnboardingProgress(`${card._id}:${action.label}`)
  const target = action.target
  if (target?.application !== undefined && getCurrentResolvedLocation().path[2] !== target.application) {
    // Path only, like NavLink: the previous app's fragment would open its panel over the new app.
    const path = getCurrentResolvedLocation().path.slice(0, 2)
    navigate({ path: [...path, target.application] })
  }
  if (action.component !== undefined) {
    // Popups close on navigation: let the app switch above settle before opening the dialog.
    if (target?.application !== undefined) await new Promise((resolve) => setTimeout(resolve, 500))
    showPopup(action.component, {}, 'top')
    return true
  }
  // A func either is the action itself or prepares the page for the button (e.g. opens a drive).
  if (action.func !== undefined) {
    const fn = await getResource(action.func)
    await fn()
  }
  if (target?.selector === undefined) return true
  let el = await waitForElement(target.selector, 1500)
  // The button may sit in a hidden navigator: collapsed by the user, or floating on a narrow workbench.
  const device = get(deviceOptionsStore)
  if (el === undefined && !device.navigator.visible) {
    if (device.navigator.float) {
      deviceOptionsStore.update((d) => ({ ...d, navigator: { ...d.navigator, visible: true } }))
    } else setNavigatorVisible(true)
    el = await waitForElement(target.selector, 3500)
  }
  if (el === undefined) return false
  el.click()
  return true
}
