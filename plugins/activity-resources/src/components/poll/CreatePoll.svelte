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
  import { createEventDispatcher, onDestroy } from 'svelte'
  import {
    ButtonIcon,
    CheckBox,
    IconClose,
    Label,
    Modal,
    ModernEditbox,
    ModernToggle,
    showPopup
  } from '@hcengineering/ui'
  import { generateId } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import emoji from '@hcengineering/emoji'
  import presentation from '@hcengineering/presentation'
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
  const optionElements: Record<OptionID, HTMLInputElement | undefined> = {}

  params = {
    ...params,
    options:
      (params.options?.length ?? 0) > 0 ? params.options.map((o) => ({ ...o })) : [{ id: generateId(), label: '' }]
  }

  $: updateOptions(params.options)

  // A chosen time can pass while the form is open: the Create button has to notice it.
  let now = Date.now()
  const clock = setInterval(() => {
    now = Date.now()
  }, 1000)
  onDestroy(() => {
    clearInterval(clock)
  })

  $: resolvedTimes = resolvePollTimes(params, now)

  // Mirrors ActivityMiddleware.validatePollCreate, the server rejects the whole message otherwise.
  function getErrorMessage (p: CreatePollParams, now: number): IntlString | undefined {
    if ((p.question ?? '').trim() === '') return activity.string.AskQuestion
    const filled = p.options.filter((it) => it.label.trim() !== '')
    if (filled.length < 2) return activity.string.AtLeastTwoOptions
    if (p.quiz === true && !filled.some((it) => it.id === p.quizAnswer)) return activity.string.ChooseCorrectAnswer
    // An exact start only, a preset counts from the sending; the server takes a past one, but it is a slip here.
    if (p.startDelay == null && p.startAt != null && p.startAt < now) return activity.string.StartInPast
    return getPollTimeError(p, now)
  }

  function canSave (p: CreatePollParams, now: number): boolean {
    return getErrorMessage(p, now) === undefined
  }

  function okAction (): void {
    if (!canSave(params, Date.now())) return

    const validQuestion = (params.question ?? '').trim()
    const validOptions = params.options.filter((it) => it.label.trim() !== '')

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
    const appendEmpty = options[end - 1].label.trim() !== '' && end < pollLimits.options
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

    if (e.key === 'Enter') {
      e.preventDefault()
      const index = option != null ? params.options.findIndex((it) => it.id === option) : -1
      const next = params.options[index + 1]
      if (next !== undefined) {
        optionElements[next.id]?.focus()
      }
    }
  }

  function removeOption (option: OptionID): void {
    if (params.options.length <= 1) return
    params = {
      ...params,
      options: params.options.filter((it) => it.id !== option),
      quizAnswer: params.quizAnswer === option ? undefined : params.quizAnswer
    }
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
        if (label.length + text.length > pollLimits.option) return

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

  function toggleQuizAnswer (optionId: OptionID): void {
    params = {
      ...params,
      quizAnswer: params.quizAnswer === optionId ? undefined : optionId
    }
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
    if (params.quiz) return
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

<Modal
  label={isEdit ? applet.editLabel : applet.createLabel}
  type="type-popup"
  width="large"
  okLabel={isEdit ? presentation.string.Save : presentation.string.Create}
  {okAction}
  canSave={canSave(params, now)}
  onCancel={handleCancel}
  okTooltip={{ label: getErrorMessage(params, now) }}
  on:close
>
  <div class="poll">
    <div class="poll__setting-item">
      <span class="label"><Label label={activity.string.Question} /></span>
      <ModernEditbox
        bind:value={params.question}
        label={activity.string.AskQuestion}
        limit={pollLimits.question}
        size="medium"
        kind="default"
        width="100%"
        autoFocus
        on:keydown={handleKeydown}
      />
    </div>

    <div class="poll__setting-item">
      <span class="label"><Label label={activity.string.PollOptions} /></span>
      {#each params.options as option, i (option.id)}
        <ModernEditbox
          bind:value={option.label}
          bind:element={optionElements[option.id]}
          autoAction={false}
          label={activity.string.Option}
          limit={pollLimits.option}
          size="medium"
          kind="default"
          width="100%"
          on:keydown={(e) => {
            handleKeydown(e, option.id)
          }}
        >
          {#if params.quiz === true}
            <CheckBox
              checked={params.quizAnswer === option.id}
              kind="todo"
              size="small"
              on:value={() => {
                toggleQuizAnswer(option.id)
              }}
            />
          {/if}
          <svelte:fragment slot="after">
            <div class="option-actions">
              <ButtonIcon
                icon={activity.icon.Emoji}
                size="small"
                iconSize="small"
                kind="tertiary"
                on:click={(e) => {
                  showEmojiPicker(e, option.id)
                }}
              />
              <!-- The last option is the empty one to type into, unless the limit left no room for it. -->
              {#if params.options.length > 2 && (i !== params.options.length - 1 || option.label.trim() !== '')}
                <ButtonIcon
                  icon={IconClose}
                  size="small"
                  iconSize="small"
                  kind="tertiary"
                  on:click={() => {
                    removeOption(option.id)
                  }}
                />
              {/if}
            </div>
          </svelte:fragment>
        </ModernEditbox>
      {/each}
    </div>

    <div class="poll__setting-item">
      <ModernToggle
        label={activity.string.AnonymousVoting}
        size="large"
        checked={params.anonymous ?? false}
        on:change={handleAnonymousToggle}
      />
      <ModernToggle
        label={activity.string.MultipleChoice}
        size="large"
        checked={params.mode === 'multiple'}
        disabled={params.quiz}
        on:change={handleModeToggle}
      />
      <!-- A quiz vote is final: the voter sees the correct option right after voting. -->
      <ModernToggle
        label={activity.string.Revote}
        size="large"
        checked={params.quiz !== true && params.revote !== false}
        disabled={params.quiz}
        on:change={handleRevoteToggle}
      />
      <ModernToggle
        label={activity.string.QuizMode}
        size="large"
        checked={params.quiz ?? false}
        on:change={handleQuizToggle}
      />
    </div>

    <div class="poll__setting-item">
      <PollTimeSetting
        label={activity.string.DelayedStart}
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
        label={activity.string.LimitDuration}
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
</Modal>

<style lang="scss">
  .poll {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    flex-shrink: 0;
    width: 100%;
    min-width: 0;
  }
  .poll__setting-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    flex-shrink: 0;
    padding: 1rem 0;
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

  .option-actions {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    margin-right: -0.5rem;
  }
</style>
