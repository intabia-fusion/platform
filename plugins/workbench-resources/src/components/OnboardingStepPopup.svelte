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
  import { getMetadata, translate, type IntlString } from '@hcengineering/platform'
  import support from '@hcengineering/support'
  import {
    addNotification,
    ButtonIcon,
    Icon,
    IconArrowLeft,
    IconCheck,
    IconChevronRight,
    IconClose,
    Label,
    ModernButton,
    NotificationSeverity,
    themeStore
  } from '@hcengineering/ui'
  import { markOnboardingProgress, SimpleNotification, updateOnboardingPreference } from '@hcengineering/view-resources'
  import type { OnboardingAction } from '@hcengineering/workbench'
  import { createEventDispatcher } from 'svelte'

  import {
    getStepScreenshot,
    onboardingProgress,
    passOnboardingStep,
    runOnboardingAction,
    type OnboardingCategory
  } from '../onboarding'
  import workbench from '../plugin'

  const dispatch = createEventDispatcher()

  // Opens on the title page with the sections; a section pages through its own steps only.
  let categoryLabel: IntlString | undefined
  let pos = 0
  // Past the last step: "basic tour finished" with a link to the docs, until the user closes it.
  let finished = false
  // A section whose app got hidden while open is undefined here: the title page shows.
  $: category = $onboardingProgress.categories.find((c) => c.label === categoryLabel)
  $: index = category?.steps[pos]
  $: card = index === undefined || finished ? undefined : $onboardingProgress.steps[index]
  $: state = index === undefined ? undefined : $onboardingProgress.states[index]
  $: if ($onboardingProgress.total === 0 && !finished) dispatch('close')

  function passedIn (c: OnboardingCategory): number {
    return c.steps.filter((i) => $onboardingProgress.states[i] !== undefined).length
  }

  function openCategory (c: OnboardingCategory): void {
    categoryLabel = c.label
    pos = Math.max(
      0,
      c.steps.findIndex((i) => $onboardingProgress.states[i] === undefined)
    )
  }

  function back (): void {
    if (pos === 0) categoryLabel = undefined
    else pos--
  }

  // Next on a step not done yet skips it; after the section's last step the title page opens,
  // or the finish screen once every step is passed.
  async function next (): Promise<void> {
    if (card === undefined || category === undefined) return
    const current = index
    if (state === undefined) await passOnboardingStep(card._id, 'skipped')
    if (pos + 1 < category.steps.length) {
      pos++
      return
    }
    // The store may not have the skip above yet: count the current step as passed.
    if ($onboardingProgress.states.every((s, i) => s !== undefined || i === current)) finished = true
    else categoryLabel = undefined
  }

  function close (): void {
    dispatch('close')
  }

  async function cancel (): Promise<void> {
    close()
    await markOnboardingProgress('cancelled')
    await updateOnboardingPreference({ cancelled: true })
    const lang = $themeStore.language
    addNotification(
      await translate(workbench.string.OnboardingCancelled, {}, lang),
      await translate(workbench.string.OnboardingCancelledText, {}, lang),
      SimpleNotification
    )
  }

  const docsLink = getMetadata(support.metadata.DocsLink)
  function openDocs (): void {
    if (docsLink === undefined || docsLink === '') return
    window.open(docsLink, '_blank', 'externalBrowser=yes')
  }

  // No screenshots in the UI language: fall back to English, then show none.
  let shotLanguage = $themeStore.language
  let noShot = false
  let shotFor = ''
  $: if (card !== undefined && card._id !== shotFor) {
    shotFor = card._id
    shotLanguage = $themeStore.language
    noShot = false
  }
  function onShotError (): void {
    if (shotLanguage !== 'en') shotLanguage = 'en'
    else noShot = true
  }
  $: shots =
    card === undefined
      ? []
      : card.screenshots !== undefined
        ? card.screenshots.map((caption, i) => ({ caption, src: getStepScreenshot(card, shotLanguage, i + 1) }))
        : [{ caption: undefined, src: getStepScreenshot(card, shotLanguage) }]

  async function run (action: OnboardingAction): Promise<void> {
    if (card === undefined) return
    const step = card
    dispatch('close')
    if (!(await runOnboardingAction(step, action))) {
      const lang = $themeStore.language
      addNotification(
        await translate(action.label, {}, lang),
        await translate(workbench.string.OnboardingTargetUnavailable, {}, lang),
        SimpleNotification,
        undefined,
        NotificationSeverity.Warning
      )
      return
    }
    // Steps without doneWhen have nothing to wait for: doing the action is the step.
    if (step.doneWhen === undefined) await passOnboardingStep(step._id, 'completed')
  }

  // Shown without an overlay: a click elsewhere closes the tour and still reaches its target.
  let popup: HTMLElement | undefined
  function onWindowPointerDown (e: PointerEvent): void {
    const target = e.target as Element | null
    if (popup === undefined || target === null || popup.contains(target)) return
    if (target.closest('[data-id="onboarding-button"]') !== null) return
    dispatch('close')
  }
</script>

<svelte:window on:pointerdown={onWindowPointerDown} />

{#if finished}
  <div class="antiPopup onboarding-popup wide finished" data-id="onboarding-popup" bind:this={popup}>
    <span class="fs-title caption-color"><Label label={workbench.string.OnboardingFinished} /></span>
    <span class="content-color"><Label label={workbench.string.OnboardingFinishedText} /></span>
    <div class="finish-actions">
      {#if docsLink !== undefined && docsLink !== ''}
        <ModernButton
          label={workbench.string.OnboardingOpenDocs}
          kind={'secondary'}
          size={'small'}
          on:click={openDocs}
        />
      {/if}
      <ModernButton label={workbench.string.OnboardingClose} kind={'primary'} size={'small'} on:click={close} />
    </div>
  </div>
{:else if card === undefined || category === undefined}
  <div class="antiPopup onboarding-popup" data-id="onboarding-popup" bind:this={popup}>
    <div class="header">
      <span class="fs-title caption-color"><Label label={workbench.string.Onboarding} /></span>
      <ButtonIcon icon={IconClose} kind={'tertiary'} size={'small'} dataId={'onboarding-close'} on:click={close} />
    </div>
    <span class="text-sm content-dark-color">
      <!-- Same number as the button: steps complete out of order, a position would disagree. -->
      <Label
        label={workbench.string.OnboardingProgress}
        params={{ done: $onboardingProgress.done, total: $onboardingProgress.total }}
      />
    </span>
    <span class="content-color"><Label label={workbench.string.OnboardingChooseCategory} /></span>
    <div class="categories">
      {#each $onboardingProgress.categories as c (c.label)}
        {@const passed = passedIn(c)}
        <button
          type="button"
          class="category"
          data-id="onboarding-category"
          on:click={() => {
            openCategory(c)
          }}
        >
          <span class="overflow-label category-label"><Label label={c.label} /></span>
          {#if passed === c.steps.length}
            <Icon icon={IconCheck} size={'small'} />
          {/if}
          <span class="counter">{passed}/{c.steps.length}</span>
          <Icon icon={IconChevronRight} size={'small'} />
        </button>
      {/each}
    </div>
    <div class="cancel">
      <ModernButton
        label={workbench.string.OnboardingCancel}
        kind={'tertiary'}
        size={'small'}
        dataId={'onboarding-cancel'}
        on:click={() => {
          void cancel()
        }}
      />
    </div>
  </div>
{:else}
  <div class="antiPopup onboarding-popup" class:wide={shots.length > 1} data-id="onboarding-popup" bind:this={popup}>
    <div class="header">
      <ModernButton
        label={workbench.string.OnboardingAllCategories}
        icon={IconArrowLeft}
        kind={'tertiary'}
        size={'small'}
        on:click={() => {
          categoryLabel = undefined
        }}
      />
      <ButtonIcon icon={IconClose} kind={'tertiary'} size={'small'} dataId={'onboarding-close'} on:click={close} />
    </div>
    <span class="text-sm content-dark-color">
      <Label label={category.label} />:
      <Label
        label={workbench.string.OnboardingProgress}
        params={{ done: passedIn(category), total: category.steps.length }}
      />
      {#if state === 'completed'}
        · <Label label={workbench.string.OnboardingStepDone} />
      {:else if state === 'skipped'}
        · <Label label={workbench.string.OnboardingStepSkipped} />
      {/if}
    </span>
    <span class="fs-title caption-color"><Label label={card.label} /></span>
    <span class="content-color description"><Label label={card.description} /></span>
    <!-- Side by side with the caption under each: a column of tall shots does not fit low screens. -->
    <div class="shots" style:grid-template-columns={`repeat(${shots.length}, 1fr)`}>
      {#each shots as shot, i (shot.src)}
        <div class="shot-cell">
          {#if !noShot}
            <div class="shot-frame">
              <img class="shot" src={shot.src} alt="" on:error={onShotError} />
            </div>
          {/if}
          {#if shot.caption !== undefined}
            <span class="text-sm caption-color shot-caption">{i + 1}. <Label label={shot.caption} /></span>
          {/if}
        </div>
      {/each}
    </div>
    <div class="footer">
      <div class="actions">
        {#each card.actions as action, i (i)}
          <ModernButton
            label={action.label}
            kind={i === 0 ? 'primary' : 'secondary'}
            size={'small'}
            on:click={() => {
              void run(action)
            }}
          />
        {/each}
      </div>
      <!-- Back and Next stay together on the right; only the step actions wrap. -->
      <div class="nav">
        <ModernButton label={workbench.string.OnboardingBack} kind={'tertiary'} size={'small'} on:click={back} />
        <ModernButton
          label={workbench.string.OnboardingNext}
          kind={'tertiary'}
          size={'small'}
          on:click={() => {
            void next()
          }}
        />
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .onboarding-popup {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    width: 26rem;
    max-width: calc(100vw - 2rem);
    padding: var(--spacing-3);

    &.wide {
      width: 46rem;
    }
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-1);
  }

  .categories {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-0_5);
    margin: var(--spacing-1) 0;
  }

  .category {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-1) var(--spacing-1_5);
    border: none;
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-button-default);
    color: var(--theme-caption-color);
    text-align: left;
    cursor: pointer;

    &:hover {
      background-color: var(--theme-button-hovered);
    }
  }

  .category-label {
    flex-grow: 1;
  }

  .counter {
    flex-shrink: 0;
    color: var(--theme-dark-color);
    font-variant-numeric: tabular-nums;
  }

  .cancel {
    display: flex;
    justify-content: flex-start;
  }

  .finished {
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    min-height: 18rem;
    text-align: center;
  }

  .finish-actions {
    display: flex;
    gap: var(--spacing-1);
  }

  .shots {
    display: grid;
    gap: var(--spacing-2);
    margin: var(--spacing-1_5) 0;
  }

  // Each shot on its own tinted card, centered, with the caption under it: shots of different sizes
  // line up and do not merge with the popup background.
  .shot-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-1_5);
    min-width: 0;
    padding: var(--spacing-2);
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-button-default);
    text-align: center;
  }

  .shot-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 14rem;
  }

  // Phones: the two shots one under the other, each still readable.
  @media (max-width: 600px) {
    .onboarding-popup {
      padding: var(--spacing-2);
    }

    .shots {
      grid-template-columns: 1fr !important;
    }

    .shot-frame {
      height: 9rem;
    }

    .description {
      min-height: 0;
    }
  }

  .shot {
    display: block;
    max-width: 100%;
    max-height: 100%;
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--small-BorderRadius);
    box-shadow: var(--theme-popup-shadow, 0 2px 8px rgba(0, 0, 0, 0.12));
  }

  .footer {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-1);
    margin-top: var(--spacing-1);
  }

  .actions {
    display: flex;
    flex-grow: 1;
    gap: var(--spacing-1);
  }

  // Same box for every step, so Back and Next stay put while paging: room for three lines of
  // description and two lines of caption whatever the text length.
  .description {
    min-height: 4.5em;
    line-height: 1.5em;
  }

  .shot-caption {
    min-height: 3em;
    line-height: 1.5em;
  }

  .nav {
    display: flex;
    flex-shrink: 0;
    gap: var(--spacing-0_5);
  }
</style>
