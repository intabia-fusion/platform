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
  import { createEventDispatcher } from 'svelte'
  import {
    ButtonIcon,
    CheckBox,
    DateTimePresenter,
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
  import type { Applet, CreatePollParams, OptionID, PollOption } from '@hcengineering/activity'

  import activity from '../../plugin'

  export let applet: Applet
  export let params: CreatePollParams = {
    question: '',
    options: [{ id: generateId(), label: '' }],
    mode: 'single',
    anonymous: false,
    quiz: false,
    quizAnswer: undefined,
    startAt: undefined,
    endAt: undefined
  }
  export let isEdit: boolean = false

  const dispatch = createEventDispatcher<{
    close: CreatePollParams | undefined
  }>()

  let questionElement: HTMLInputElement | undefined
  const optionElements: (HTMLInputElement | undefined)[] = []

  params = {
    ...params,
    options:
      params.options && params.options.length > 0
        ? params.options.map((o) => ({ ...o }))
        : [{ id: generateId(), label: '' }],
    quizAnswer: params.quizAnswer
  }

  $: updateOptions(params.options)

  function getErrorMessage (p: CreatePollParams): IntlString | undefined {
    if ((p.question ?? '').trim() === '') return activity.string.AskQuestion
    if (!p.options.some((it) => it.label.trim() !== '')) return activity.string.Option
    const now = Date.now()
    if (p.startAt != null && p.startAt < now) return activity.string.StartTime
    if (p.endAt != null && p.startAt != null && p.endAt <= p.startAt) return activity.string.EndTime
    if (p.endAt != null && p.startAt == null && p.endAt <= now) return activity.string.EndTime
    return undefined
  }

  function canSave (p: CreatePollParams): boolean {
    if ((p.question ?? '').trim() === '') return false
    if (!p.options.some((it) => it.label.trim() !== '')) return false
    const now = Date.now()
    if (p.startAt != null && p.startAt < now) return false
    if (p.endAt != null && p.startAt != null && p.endAt <= p.startAt) return false
    if (p.endAt != null && p.startAt == null && p.endAt <= now) return false
    return true
  }

  function okAction (): void {
    if (!canSave(params)) return

    const validQuestion = (params.question ?? '').trim()
    const validOptions = params.options.filter((it) => it.label.trim() !== '')

    if (validQuestion === '' || validOptions.length === 0) return

    const validIds = new Set(validOptions.map((it) => it.id))
    const saveConfig: CreatePollParams = {
      ...params,
      question: validQuestion,
      options: validOptions,
      quizAnswer: params.quiz && params.quizAnswer && validIds.has(params.quizAnswer) ? params.quizAnswer : undefined,
      startAt: params.startAt ?? undefined,
      endAt: params.endAt ?? undefined
    }

    dispatch('close', saveConfig)
  }

  function handleCancel (): void {
    dispatch('close')
  }

  function updateOptions (options: PollOption[]): void {
    if (!Array.isArray(options) || options.length === 0) return

    const lastOption = options[options.length - 1]
    const prevOption = options[options.length - 2]

    let newOptions: PollOption[] | undefined

    if (lastOption != null && lastOption.label.trim() !== '') {
      newOptions = [...options, { id: generateId(), label: '' }]
    } else if (
      lastOption != null &&
      prevOption != null &&
      lastOption.label.trim() === '' &&
      prevOption.label.trim() === ''
    ) {
      newOptions = options.slice(0, -1)
    }

    if (newOptions != null) {
      const validIds = new Set(newOptions.map((o) => o.id))
      const cleanedQuizAnswer = params.quizAnswer && validIds.has(params.quizAnswer) ? params.quizAnswer : undefined
      params = {
        ...params,
        options: newOptions,
        quizAnswer: cleanedQuizAnswer
      }
    }
  }

  function handleKeydown (e: KeyboardEvent, option?: OptionID): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (canSave(params)) {
        okAction()
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (option != null) {
        const index = params.options.findIndex((it) => it.id === option)
        if (index !== -1 && index + 1 < optionElements.length) {
          optionElements[index + 1]?.focus()
        }
      } else {
        optionElements[0]?.focus()
      }
    }
  }

  function addOption (): void {
    const newOption: PollOption = { id: generateId(), label: '' }
    params = {
      ...params,
      options: [...params.options, newOption]
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
        if (text == null) return

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
  canSave={canSave(params)}
  onCancel={handleCancel}
  okTooltip={{ label: getErrorMessage(params) }}
  on:close
>
  <div class="poll">
    <div class="poll__setting-item">
      <span class="label"><Label label={activity.string.Question} /></span>
      <ModernEditbox
        bind:value={params.question}
        bind:element={questionElement}
        label={activity.string.AskQuestion}
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
          bind:element={optionElements[i]}
          autoAction={false}
          label={activity.string.Option}
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
              {#if params.options.length > 2 && i !== params.options.length - 1}
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
      <ModernToggle
        label={activity.string.QuizMode}
        size="large"
        checked={params.quiz ?? false}
        on:change={handleQuizToggle}
      />
    </div>

    <div class="poll__setting-item line">
      <span class="label"><Label label={activity.string.StartTime} /></span>
      <DateTimePresenter bind:value={params.startAt} editable />
    </div>
    <div class="poll__setting-item line">
      <span class="label"><Label label={activity.string.EndTime} /></span>
      <DateTimePresenter bind:value={params.endAt} editable />
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

    &.line {
      flex-direction: row;
      align-items: center;
      padding-bottom: 0;
    }
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
