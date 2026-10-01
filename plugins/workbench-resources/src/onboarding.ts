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

import { AccountRole, getCurrentAccount, hasAccountRole, type Ref } from '@hcengineering/core'
import { getMetadata } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'
import { markOnboardingProgress, updateOnboardingPreference } from '@hcengineering/view-resources'
import { type Application, type OnboardingCard, type Widget } from '@hcengineering/workbench'

import workbench from './plugin'
import { openWidget } from './sidebar'
import { isAllowedToRole } from './utils'

export interface OnboardingGroup {
  app?: Application
  cards: OnboardingCard[]
}

// First step of every app group: "Open <app>", done once the user has been there.
export function openStepId (app: Application): string {
  return `${app._id}:open`
}

// Cards the current account can see, grouped by app in `order`. The app-less group (invite) is first
// for the workspace owner and last for everyone else. Shared by the widget and the settings counter.
export function getOnboardingGroups (hiddenAppIds: Array<Ref<Application>>): OnboardingGroup[] {
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

  const groups = client
    .getModel()
    .findAllSync<OnboardingCard>(workbench.class.OnboardingCard, {})
    .sort((a, b) => a.order - b.order)
    .filter(isVisible)
    .reduce<OnboardingGroup[]>((acc, card) => {
      const app = card.application !== undefined ? allApps.find((a) => a._id === card.application) : undefined
      let group = acc.find((g) => g.app?._id === app?._id)
      if (group === undefined) {
        group = { app, cards: [] }
        acc.push(group)
      }
      group.cards.push(card)
      return acc
    }, [])

  const generalRank = hasAccountRole(account, AccountRole.Owner) ? 0 : 1
  const rank = (g: OnboardingGroup): number => (g.app === undefined ? generalRank : 0)
  return groups.sort((a, b) => rank(a) - rank(b))
}

export function countOnboarding (groups: OnboardingGroup[], completed: string[]): { done: number, total: number } {
  const ids = groups.flatMap((g) => [
    ...(g.app !== undefined ? [openStepId(g.app)] : []),
    ...g.cards.map((c) => c._id as string)
  ])
  return { done: ids.filter((id) => completed.includes(id)).length, total: ids.length }
}

function getOnboardingWidget (): Widget | undefined {
  return getClient()
    .getModel()
    .findAllSync<Widget>(workbench.class.Widget, { _id: workbench.ids.OnboardingWidget as Ref<Widget> })[0]
}

// Manual reopen: settings "Open panel" and the AccountPopup "Onboarding" menu item.
export async function openOnboarding (): Promise<void> {
  const widget = getOnboardingWidget()
  if (widget === undefined) return
  await markOnboardingProgress('opened')
  openWidget(widget, undefined, { active: true, openedByUser: true })
}

// Called once from Workbench.svelte onMount: opens the widget on the very first visit only.
export async function maybeAutoOpenOnboarding (): Promise<void> {
  // Automated browsers (Playwright sanity runs): the panel narrows every view the tests drive.
  if (navigator.webdriver) return
  // Model without the widget (not redeployed yet): keep autoOpened unset so it still opens later.
  const widget = getOnboardingWidget()
  if (widget === undefined) return
  const client = getClient()
  const existing = await client.findOne(workbench.class.OnboardingPreference, {})
  if (existing?.autoOpened === true) return
  await updateOnboardingPreference({ autoOpened: true })
  if (existing?.showHints === false) return
  await markOnboardingProgress('opened')
  openWidget(widget, undefined, { active: true, openedByUser: false })
}
