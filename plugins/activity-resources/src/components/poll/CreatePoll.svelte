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
  import { createEventDispatcher, tick } from 'svelte'
  import ui, {
    Label,
    showPopup,
    themeStore,
    ticker1,
    tooltip
  } from '@hcengineering/ui'
  import { Dialog, IconButton, Radio, SettingRow, TextInput, Toggle } from '@hcengineering/ui/kit'
  import { generateId } from '@hcengineering/core'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import emoji from '@hcengineering/emoji'
  import presentation from '@hcengineering/presentation'
  import view from '@hcengineering/view'
  import {
    pollLimits,
    type Applet,
    type CreatePollParams,
    type OptionID,
    type PollOption
  } from '@hcengineering/activity'

  import activity from '../../plugin'
  import { DAY_MS, getPollTimeError, HOUR_MS, resolvePollTimes } from '../../pollTime'
  import PollTimeSetting from './PollTimeSetting.svelte'

  export let applet: Applet
  export let params: CreatePollParams = {
    question: '',
    options: [{ id: generateId(), label: '' }],
    mode: 'single',
    anonymous: false,
    quiz: false,
    revote: true,
    quizAnswer: undefined,
    startAt: undefined,
    startDelay: undefined,
    endAt: undefined,
    duration: undefined
  }
  export let isEdit: boolean = false

  const dispatch = createEventDispatcher<{
    close: CreatePollParams | undefined
  }>()

  // By option id: an index would shift to another input when a middle option is removed.
  const optionInputs: Record<OptionID, TextInput | undefined> = {}
  let questionInput: TextInput | undefined
  let dialog: Dialog | undefined

  // The popup host asks it on Escape and an outside click, as the close button does.
  export function canClose (): boolean {
    return dialog?.canClose() ?? true
  }
  // One radio set across the option rows: arrows move the correct answer between them.
  const quizAnswerGroup = `poll-quiz-answer-${generateId()}`

  let correctAnswerLabel = ''
  $: translateCB(activity.string.CorrectAnswer, {}, $themeStore.language, (text) => {
    correctAnswerLabel = text
  })
  let optionLabel = ''
  $: translateCB(activity.string.Option, {}, $themeStore.language, (text) => {
    optionLabel = text
  })

  // Option fields look alike to a screen reader, so each is named by its number.
  const questionLabelId = `poll-question-${generateId()}`
  const optionsLabelId = `poll-options-${generateId()}`
  function getOptionName (index: number): string {
    return `${optionLabel} ${index + 1}`
  }
  function getQuizRadioName (option: PollOption, index: number): string {
    const text = option.label.trim()
    return `${correctAnswerLabel}: ${text !== '' ? text : getOptionName(index)}`
  }

  params = {
    ...params,
    options:
      (params.options?.length ?? 0) > 0 ? params.options.map((o) => ({ ...o })) : [{ id: generateId(), label: '' }]
  }

  // After the normalization, so an untouched form closes without asking.
  const initial = JSON.stringify(params)
  $: dirty = JSON.stringify(params) !== initial

  $: updateOptions(params.options)

  // A chosen time can pass while the form is open.
  $: resolvedTimes = resolvePollTimes(params, $ticker1)
  $: error = getErrorMessage(params, $ticker1)

  // Mirrors ActivityMiddleware.validatePollCreate, the server rejects the whole message otherwise.
  function getErrorMessage (p: CreatePollParams, now: number): IntlString | undefined {
    if ((p.question ?? '').trim() === '') return activity.string.AskQuestion
    const filled = p.options.filter((it) => it.label.trim() !== '')
    if (filled.length < 2) return activity.string.AtLeastTwoOptions
    if (p.quiz === true && !filled.some((it) => it.id === p.quizAnswer)) return activity.string.ChooseCorrectAnswer
    // The server accepts a past exact start, but in the form it is a slip.
    if (p.startDelay == null && p.startAt != null && p.startAt < now) return activity.string.StartInPast
    return getPollTimeError(p, now)
  }

  function canSave (p: CreatePollParams, now: number): boolean {
    return getErrorMessage(p, now) == null
  }

  function okAction (): void {
    if (!canSave(params, Date.now())) return

    const validQuestion = (params.question ?? '').trim()
    const validOptions = params.options.map((it) => ({ ...it, label: it.label.trim() })).filter((it) => it.label !== '')

    const validIds = new Set(validOptions.map((it) => it.id))
    const saveConfig: CreatePollParams = {
      ...params,
      question: validQuestion,
      options: validOptions,
      quizAnswer:
        params.quiz === true && params.quizAnswer != null && validIds.has(params.quizAnswer)
          ? params.quizAnswer
          : undefined
    }

    dispatch('close', saveConfig)
  }

  function handleCancel (): void {
    dispatch('close')
  }

  // Exactly one empty option at the end, in one step: Svelte does not rerun this statement in the same pass.
  function updateOptions (options: PollOption[]): void {
    if (!Array.isArray(options) || options.length === 0) return

    let end = options.length
    while (end > 1 && options[end - 1].label.trim() === '' && options[end - 2].label.trim() === '') end--
    const appendEmpty = options[end - 1].label.trim() !== '' && end < pollLimits.maxOptions
    if (end === options.length && !appendEmpty) return

    const kept = options.slice(0, end)
    const newOptions = appendEmpty ? [...kept, { id: generateId(), label: '' }] : kept

    const validIds = new Set(newOptions.map((o) => o.id))
    const cleanedQuizAnswer =
      params.quizAnswer != null && validIds.has(params.quizAnswer) ? params.quizAnswer : undefined
    params = {
      ...params,
      options: newOptions,
      quizAnswer: cleanedQuizAnswer
    }
  }

  function handleKeydown (e: KeyboardEvent, option?: OptionID): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      okAction()
      return
    }

    // The question is row -1, the options follow.
    const step = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || e.isComposing) return
    e.preventDefault()
    const index = option != null ? params.options.findIndex((it) => it.id === option) : -1
    const target = index + step
    if (target === -1) questionInput?.focus()
    else if (target >= 0) {
      const next = params.options[target]
      if (next != null) optionInputs[next.id]?.focus()
    }
  }

  async function removeOption (option: OptionID): Promise<void> {
    if (params.options.length <= 1) return
    const index = params.options.findIndex((it) => it.id === option)
    params = {
      ...params,
      options: params.options.filter((it) => it.id !== option),
      quizAnswer: params.quizAnswer === option ? undefined : params.quizAnswer
    }
    // The removed cross took the focus with it.
    await tick()
    const next = params.options[Math.min(index, params.options.length - 1)]
    if (next != null) optionInputs[next.id]?.focus()
  }

  function showEmojiPicker (evt: MouseEvent, optionId: OptionID): void {
    const target = (evt.currentTarget ?? evt.target) as HTMLElement | undefined
    if (target == null) return

    showPopup(
      emoji.component.EmojiPopup,
      {},
      target,
      async (result) => {
        const text = result?.text
        // A custom emoji is an image, a plain text label would show its shortcode.
        if (text == null || result?.image != null) return
        const label = params.options.find((it) => it.id === optionId)?.label ?? ''
        if (label.length + text.length > pollLimits.maxOptionLength) return

        params = {
          ...params,
          options: params.options.map((it) => {
            if (it.id === optionId) {
              return { ...it, label: it.label + text }
            }
            return it
          })
        }
      },
      () => {}
    )
  }

  function selectQuizAnswer (optionId: OptionID): void {
    params = { ...params, quizAnswer: optionId }
  }

  function handleAnonymousToggle (): void {
    params = {
      ...params,
      anonymous: !(params.anonymous ?? false)
    }
  }

  function handleRevoteToggle (): void {
    params = {
      ...params,
      revote: params.revote === false
    }
  }

  function handleModeToggle (): void {
    if (params.quiz === true) return
    const nextMode = params.mode === 'multiple' ? 'single' : 'multiple'

    params = {
      ...params,
      mode: nextMode
    }
  }

  function handleQuizToggle (): void {
    const nextQuiz = !(params.quiz ?? false)
    params = {
      ...params,
      quiz: nextQuiz,
      mode: nextQuiz ? 'single' : params.mode,
      quizAnswer: nextQuiz ? params.quizAnswer : undefined
    }
  }
</script>

<Dialog
  bind:this={dialog}
  label={isEdit ? applet.editLabel : applet.createLabel}
  submitLabel={isEdit ? presentation.string.Save : presentation.string.Create}
  canSubmit={error == null}
  submitTooltip={error != null ? { label: error } : undefined}
  closeConfirmationIntl={dirty ? activity.string.ClosePollWithoutSaving : undefined}
  on:submit={okAction}
  on:close={handleCancel}
>
  <div class="poll">
    <div class="poll__setting-item">
      <span class="label" id={questionLabelId}><Label label={activity.string.Question} /></span>
      <TextInput
        bind:this={questionInput}
        aria-labelledby={questionLabelId}
        bind:value={params.question}
        placeholder={activity.string.AskQuestion}
        maxlength={pollLimits.maxQuestionLength}
        size="medium"
        fullWidth
        autofocus
        on:keydown={(e) => {
          handleKeydown(e)
        }}
      />
    </div>

    <div class="poll__setting-item" role="group" aria-labelledby={optionsLabelId}>
      <span class="label" id={optionsLabelId}><Label label={activity.string.PollOptions} /></span>
      {#each params.options as option, i (option.id)}
        <TextInput
          bind:this={optionInputs[option.id]}
          bind:value={option.label}
          placeholder={activity.string.Option}
          aria-label={getOptionName(i)}
          maxlength={pollLimits.maxOptionLength}
          size="medium"
          fullWidth
          on:keydown={(e) => {
            handleKeydown(e, option.id)
          }}
        >
          <svelte:fragment slot="before">
            {#if params.quiz === true}
              <span class="flex-center" use:tooltip={{ label: activity.string.CorrectAnswer }}>
                <Radio
                  value={option.id}
                  group={params.quizAnswer ?? null}
                  name={quizAnswerGroup}
                  aria-label={getQuizRadioName(option, i)}
                  on:change={() => {
                    selectQuizAnswer(option.id)
                  }}
                />
              </span>
            {/if}
          </svelte:fragment>
          <svelte:fragment slot="after">
            <div class="option-actions">
              <IconButton
                icon={activity.icon.Emoji}
                size="small"
                kind="ghost"
                tooltip={{ label: activity.string.AddEmoji }}
                on:click={(e) => {
                  showEmojiPicker(e, option.id)
                }}
              />
              <!-- The last option is the empty one to type into, unless the limit left no room for it. -->
              {#if params.options.length > 2 && (i !== params.options.length - 1 || option.label.trim() !== '')}
                <IconButton
                  icon={ui.icon.Cross}
                  size="small"
                  kind="ghost"
                  tooltip={{ label: presentation.string.Remove }}
                  on:click={() => {
                    void removeOption(option.id)
                  }}
                />
              {/if}
            </div>
          </svelte:fragment>
        </TextInput>
      {/each}
    </div>

    <div class="poll__setting-item">
      <span class="label"><Label label={activity.string.PollSettings} /></span>
      <div class="settings">
        <SettingRow
          variant="list"
          icon={view.icon.EyeCrossed}
          color="Mauve"
          label={activity.string.AnonymousVoting}
          description={activity.string.AnonymousVotingHint}
          let:labelId
          let:descriptionId
          let:controlId
        >
          <Toggle
            id={controlId}
            kind="primary"
            checked={params.anonymous ?? false}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            on:change={handleAnonymousToggle}
          />
        </SettingRow>
        <SettingRow
          variant="list"
          icon={view.icon.TodoList}
          color="Cerulean"
          label={activity.string.MultipleChoice}
          description={activity.string.MultipleChoiceHint}
          disabled={params.quiz === true}
          let:labelId
          let:descriptionId
          let:controlId
        >
          <Toggle
            id={controlId}
            kind="primary"
            checked={params.mode === 'multiple'}
            disabled={params.quiz === true}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            on:change={handleModeToggle}
          />
        </SettingRow>
        <!-- A quiz vote is always final: the voter sees the correct option right after voting. -->
        <SettingRow
          variant="list"
          icon={ui.icon.Lock}
          color="Lavander"
          label={activity.string.NoRevote}
          description={activity.string.NoRevoteHint}
          disabled={params.quiz === true}
          let:labelId
          let:descriptionId
          let:controlId
        >
          <Toggle
            id={controlId}
            kind="primary"
            checked={params.quiz === true || params.revote === false}
            disabled={params.quiz === true}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            on:change={handleRevoteToggle}
          />
        </SettingRow>
        <SettingRow
          variant="list"
          icon={ui.icon.CheckCircle}
          color="Houseplant"
          label={activity.string.QuizMode}
          description={activity.string.QuizModeHint}
          let:labelId
          let:descriptionId
          let:controlId
        >
          <Toggle
            id={controlId}
            kind="primary"
            checked={params.quiz ?? false}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            on:change={handleQuizToggle}
          />
        </SettingRow>
        <PollTimeSetting
          icon={ui.icon.Calendar}
          color="Sunshine"
          label={activity.string.DelayedStart}
          description={activity.string.DelayedStartHint}
          dateLabel={activity.string.StartTime}
          kind="delay"
          span={params.startDelay}
          at={params.startAt}
          resolved={resolvedTimes.startAt}
          defaultSpan={HOUR_MS}
          on:change={(e) => {
            params = { ...params, startDelay: e.detail.span, startAt: e.detail.at }
          }}
        />
        <PollTimeSetting
          icon={ui.icon.ClockCounterClockwise}
          color="Firework"
          label={activity.string.LimitDuration}
          description={activity.string.LimitDurationHint}
          dateLabel={activity.string.EndTime}
          kind="duration"
          span={params.duration}
          at={params.endAt}
          resolved={resolvedTimes.endAt}
          defaultSpan={DAY_MS}
          on:change={(e) => {
            params = { ...params, duration: e.detail.span, endAt: e.detail.at }
          }}
        />
      </div>
    </div>
  </div>
</Dialog>

<style lang="scss">
  .poll {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    flex-shrink: 0;
    width: 100%;
    min-width: 0;
  }
  .poll__setting-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
    flex-shrink: 0;
    width: 100%;
    min-width: 0;
  }
  .label {
    text-transform: uppercase;
    font-weight: 500;
    font-size: 0.75rem;
    font-style: normal;
    line-height: 1rem;
    color: var(--global-secondary-TextColor);
  }

  .settings {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }

  .option-actions {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }
</style>
