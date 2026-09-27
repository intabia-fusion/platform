<!--
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
-->
<script lang="ts">
  import { getCurrentAccount, type Doc, type DocumentQuery, type Ref } from '@hcengineering/core'
  import { getResource, translate } from '@hcengineering/platform'
  import { createQuery, getClient, type LiveQuery } from '@hcengineering/presentation'
  import {
    addNotification,
    CheckBox,
    deviceOptionsStore,
    Icon,
    Label,
    NotificationSeverity,
    Progress,
    Scroller,
    getCurrentResolvedLocation,
    location,
    navigate,
    setNavigatorVisible,
    showPopup,
    showSpotlight,
    themeStore,
    waitForElement
  } from '@hcengineering/ui'
  import {
    markOnboardingProgress,
    onboardingPreference,
    SimpleNotification,
    updateOnboardingPreference
  } from '@hcengineering/view-resources'
  import type { Application, OnboardingAction, OnboardingCard } from '@hcengineering/workbench'
  import { onMount } from 'svelte'

  import { countOnboarding, getOnboardingGroups, openStepId } from '../onboarding'
  import workbench from '../plugin'

  const client = getClient()
  const account = getCurrentAccount()

  let hiddenAppIds: Array<Ref<Application>> = []
  const hiddenAppsQuery = createQuery()
  hiddenAppsQuery.query(workbench.class.HiddenApplication, {}, (res) => {
    hiddenAppIds = res.map((r) => r.attachedTo)
  })

  $: groups = getOnboardingGroups(hiddenAppIds)
  $: completed = $onboardingPreference?.completed ?? []
  $: completedIds = new Set<string>(completed)
  $: ({ done: doneCount, total: totalCount } = countOnboarding(groups, completed))

  $: currentApp = groups.find((g) => g.app !== undefined && g.app.alias === $location.path[2])?.app
  $: if (currentApp !== undefined && !completedIds.has(openStepId(currentApp))) {
    void setDone(openStepId(currentApp), true, true)
  }

  // Preferences created before startedAt existed get it on the first widget open.
  onMount(() => {
    void client.findOne(workbench.class.OnboardingPreference, {}).then(async (pref) => {
      if (pref?.startedAt === undefined) await updateOnboardingPreference({ startedAt: Date.now() })
    })
  })

  // doneWhen: a live query flips "done" once a matching doc created since startedAt exists.
  // Cards the user unticked (dismissed) are left alone until "Start over".
  const doneWhenQueries = client
    .getModel()
    .findAllSync<OnboardingCard>(workbench.class.OnboardingCard, {})
    .filter((c) => c.doneWhen !== undefined)
    .map((card) => ({ card, query: createQuery() }))

  $: startedAt = $onboardingPreference?.startedAt
  $: if (startedAt !== undefined) {
    for (const { card, query } of doneWhenQueries) watchDone(card, query, startedAt)
  }

  function watchDone (card: OnboardingCard, query: LiveQuery, since: number): void {
    const doneWhen = card.doneWhen
    if (doneWhen === undefined) return
    const mine = doneWhen.byMember === true ? { members: account.uuid } : { createdBy: { $in: account.socialIds } }
    const filter: DocumentQuery<Doc> = { ...mine, createdOn: { $gte: since } }
    query.query(
      doneWhen._class,
      filter,
      (res) => {
        if (res.length > 0) void setDone(card._id, true, true)
      },
      { limit: 1 }
    )
  }

  async function runAction (card: OnboardingCard, action: OnboardingAction): Promise<void> {
    await markOnboardingProgress(`${card._id}:${action.label}`)
    if (action.component !== undefined) {
      showPopup(action.component, action.props ?? {}, 'top')
    } else if (action.func !== undefined) {
      const fn = await getResource(action.func)
      await fn()
    } else if (action.application !== undefined) {
      openApp(action.application)
    }
  }

  // "Show me": navigate to the target app if needed, then spotlight the real button - the user
  // clicks it themselves, nothing is done on their behalf.
  async function runTarget (card: OnboardingCard, action: OnboardingAction): Promise<void> {
    const target = action.target
    if (target === undefined) return
    await markOnboardingProgress(`${card._id}:${action.label}`)
    if (target.application !== undefined && $location.path[2] !== target.application) {
      openApp(target.application)
    }
    let el = await waitForElement(target.selector, 1500)
    // The target may sit in a hidden navigator: collapsed by the user, or floating on a narrow
    // workbench, where navigation hides it again. Open it once the navigation has settled.
    if (el === undefined && !$deviceOptionsStore.navigator.visible) {
      if ($deviceOptionsStore.navigator.float) $deviceOptionsStore.navigator.visible = true
      else setNavigatorVisible(true)
      el = await waitForElement(target.selector, 3500)
    }
    const item = await translate(action.label, {}, $themeStore.language)
    if (el === undefined) {
      addNotification(
        item,
        await translate(workbench.string.OnboardingTargetUnavailable, {}, $themeStore.language),
        SimpleNotification,
        undefined,
        NotificationSeverity.Warning
      )
      return
    }
    // HeaderButton moves secondary actions into its dropdown (data-id "header-menu <ids>"):
    // point at the dropdown and name the item to pick.
    if (target.menu === true || el.dataset.id?.startsWith('header-menu ') === true) {
      showSpotlight(el, workbench.string.OnboardingOpenMenuHint, { item })
      return
    }
    showSpotlight(el, target.hint)
  }

  // Path only, like NavLink: the previous app's fragment would open its panel over the new app.
  function openApp (alias: string): void {
    const path = getCurrentResolvedLocation().path.slice(0, 2)
    navigate({ path: [...path, alias] })
  }

  // Ids are card refs or synthetic "<app>:open" steps; both live in the same completed list.
  // Writes are chained and read the stored doc: the store may not be loaded yet and several
  // doneWhen queries fire at once on mount, so parallel read-modify-writes would drop entries.
  let writes = Promise.resolve()
  function setDone (id: string, done: boolean, auto = false): Promise<void> {
    const next = writes.then(async () => {
      const ref = id as Ref<OnboardingCard>
      const existing = await client.findOne(workbench.class.OnboardingPreference, {})
      const current = existing?.completed ?? []
      const others = (existing?.dismissed ?? []).filter((d) => d !== id)
      if (!done) {
        await updateOnboardingPreference({ completed: current.filter((c) => c !== ref), dismissed: [...others, id] })
        return
      }
      if (current.includes(ref)) return
      if (auto && existing?.dismissed?.includes(id) === true) return
      await markOnboardingProgress(`${id}:done`)
      await updateOnboardingPreference({ completed: [...current, ref], dismissed: others })
    })
    // A failed write must not block the ones queued after it.
    writes = next.catch(() => {})
    return next
  }
</script>

<div class="onboarding-widget">
  <div class="progress-row">
    <Progress value={doneCount} min={0} max={totalCount} />
    <span class="text-sm content-color progress-label">
      <Label label={workbench.string.OnboardingProgress} params={{ done: doneCount, total: totalCount }} />
    </span>
  </div>
  <span class="text-sm content-color"><Label label={workbench.string.OnboardingIntro} /></span>
  <Scroller>
    <div class="groups">
      {#each groups as group (group.app?._id ?? 'none')}
        {@const currentId = group.cards.find((c) => !completedIds.has(c._id))?._id}
        <div class="group">
          {#if group.app}
            {@const app = group.app}
            {@const opened = completedIds.has(openStepId(app))}
            <div class="group-header flex-row-center flex-gap-2">
              <Icon icon={app.icon} size="small" />
              <span class="text-sm font-medium"><Label label={app.label} /></span>
            </div>
            <div class="card step" class:done={opened}>
              <div class="card-header flex-row-center flex-gap-2">
                <CheckBox
                  kind={'todo'}
                  size={'medium'}
                  checked={opened}
                  on:value={(e) => {
                    void setDone(openStepId(app), e.detail)
                  }}
                />
                <button
                  type="button"
                  class="card-link fs-bold card-title"
                  on:click={() => {
                    openApp(app.alias)
                  }}
                >
                  <Label label={workbench.string.OnboardingOpenApp} />
                  <Label label={app.label} />
                </button>
              </div>
            </div>
          {/if}
          {#each group.cards as card (card._id)}
            {@const done = completedIds.has(card._id)}
            {@const queued = !done && card._id !== currentId}
            <div class="card" class:done class:queued>
              <div class="card-header flex-row-center flex-gap-2">
                <CheckBox
                  kind={'todo'}
                  size={'medium'}
                  checked={done}
                  on:value={(e) => {
                    void setDone(card._id, e.detail)
                  }}
                />
                {#if card.icon}
                  <Icon icon={card.icon} size="small" />
                {/if}
                <span class="fs-bold card-title"><Label label={card.label} /></span>
              </div>
              {#if !done && !queued}
                <div class="text-sm content-color card-description">
                  <Label label={card.description} />
                </div>
                {#if card.actions.length > 0}
                  <div class="card-actions">
                    {#each card.actions as action, i (i)}
                      {#if i > 0}<span class="content-dark-color">·</span>{/if}
                      {#if action.target}
                        <button
                          type="button"
                          class="card-link"
                          on:click={() => {
                            void runTarget(card, action)
                          }}
                        >
                          <Label label={workbench.string.OnboardingShowMe} />: <Label label={action.label} />
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="card-link"
                          on:click={() => {
                            void runAction(card, action)
                          }}
                        >
                          <Label label={action.label} />
                        </button>
                      {/if}
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </Scroller>
</div>

<style lang="scss">
  .onboarding-widget {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 1rem;
    gap: 0.75rem;
  }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;

    .progress-label {
      white-space: nowrap;
    }
  }

  .groups {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .group-header {
    margin-bottom: 0.25rem;
  }

  .card {
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
    border: 1px dashed var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-list-row-color);

    &.queued {
      opacity: 0.6;
    }

    &.done {
      opacity: 0.6;

      .card-title {
        text-decoration: line-through;
      }
    }
  }

  .card-description {
    margin-top: 0.25rem;
  }

  .card-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    row-gap: 0.25rem;
    column-gap: 0.375rem;
    margin-top: 0.5rem;
  }

  .card-link {
    all: unset;
    cursor: pointer;
    color: var(--theme-link-color);

    &:hover {
      text-decoration: underline;
    }
  }
</style>
