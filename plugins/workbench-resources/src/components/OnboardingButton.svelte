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
  import { getCurrentAccount, type Doc, type DocumentQuery } from '@hcengineering/core'
  import { createQuery, getClient, type LiveQuery } from '@hcengineering/presentation'
  import { Icon, Label, showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import {
    markOnboardingProgress,
    onboardingPreference,
    updateOnboardingPreference
  } from '@hcengineering/view-resources'
  import type { OnboardingCard } from '@hcengineering/workbench'
  import { onMount } from 'svelte'

  import { onboardingOpenRequest, onboardingProgress, passOnboardingStep } from '../onboarding'
  import workbench from '../plugin'
  import OnboardingStepPopup from './OnboardingStepPopup.svelte'

  const client = getClient()
  const account = getCurrentAccount()

  // doneWhen only counts docs created since startedAt; set it on the first visit.
  onMount(() => {
    void client.findOne(workbench.class.OnboardingPreference, {}).then(async (pref) => {
      if (pref?.startedAt === undefined) await updateOnboardingPreference({ startedAt: Date.now() })
    })
  })

  // doneWhen: a live query completes the step once a matching doc created since startedAt exists.
  // Lives here, not in the popup, so steps complete while the popup is closed.
  const doneWhenQueries = client
    .getModel()
    .findAllSync<OnboardingCard>(workbench.class.OnboardingCard, {})
    .filter((c) => c.doneWhen !== undefined)
    .map((card) => ({ card, query: createQuery() }))

  $: startedAt = $onboardingPreference?.startedAt
  $: completed = $onboardingPreference?.completed ?? []
  $: if (startedAt !== undefined) {
    for (const { card, query } of doneWhenQueries) {
      if (completed.includes(card._id)) query.unsubscribe()
      else watchDone(card, query, startedAt)
    }
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
        if (res.length > 0) void passOnboardingStep(card._id, 'completed')
      },
      { limit: 1 }
    )
  }

  let pressed = false
  let pulse = false
  let button: HTMLButtonElement | undefined

  // "Take the tour again" from the help center: open as soon as the button is back.
  let handledRequest = $onboardingOpenRequest
  $: if (
    $onboardingOpenRequest !== handledRequest &&
    $onboardingProgress.current !== undefined &&
    button !== undefined
  ) {
    handledRequest = $onboardingOpenRequest
    // The button has just mounted: wait a frame so the popup is placed under its laid-out position.
    requestAnimationFrame(() => {
      open()
    })
  }
  // The button unmounts once every step is passed, while the finish screen is still open: keep its last place.
  let lastRect: DOMRect | undefined
  function anchorRect (anchor: HTMLElement): DOMRect {
    if (anchor.isConnected || lastRect === undefined) lastRect = anchor.getBoundingClientRect()
    return lastRect
  }

  function open (): void {
    void markOnboardingProgress('opened')
    const anchor = button
    if (anchor === undefined) return
    pressed = true
    showPopup(
      OnboardingStepPopup,
      {},
      { getBoundingClientRect: () => anchorRect(anchor), kind: 'centered' },
      () => {
        pressed = false
        // Show where the tour went: people closing it with Escape did not know how to get it back.
        pulse = true
      },
      undefined,
      { category: 'popup', overlay: false, id: 'onboarding-step' }
    )
  }
</script>

{#if $onboardingProgress.current !== undefined && $onboardingProgress.showHints && !$onboardingProgress.cancelled}
  <button
    type="button"
    class="onboarding-button"
    class:pressed
    class:pulse
    bind:this={button}
    on:animationend={() => (pulse = false)}
    data-id="onboarding-button"
    on:click={() => {
      open()
    }}
  >
    <Icon icon={view.icon.TodoList} size={'small'} />
    <span class="overflow-label step-label">
      <Label label={workbench.string.Onboarding} />: <Label label={$onboardingProgress.current.label} />
    </span>
    <span class="counter">{$onboardingProgress.done}/{$onboardingProgress.total}</span>
  </button>
{/if}

<style lang="scss">
  .onboarding-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 30rem;
    padding: 0.25rem 0.625rem;
    border: none;
    border-radius: var(--small-BorderRadius);
    background: var(--primary-button-default);
    color: var(--primary-button-color);
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    outline: none;

    &:hover,
    &.pressed {
      background: var(--primary-button-hovered);
    }

    &.pulse {
      animation: onboarding-pulse 0.8s ease-out 2;
    }
  }

  @keyframes onboarding-pulse {
    from {
      box-shadow: 0 0 0 0 var(--primary-button-default);
    }
    to {
      box-shadow: 0 0 0 0.5rem transparent;
    }
  }

  // Phones put the button in the second top row next to the plan chip: icon and counter only.
  @media (max-width: 600px) {
    .step-label {
      display: none;
    }
  }

  .counter {
    flex-shrink: 0;
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }
</style>
