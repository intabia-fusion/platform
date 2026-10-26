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
  import type { Applet, CreatePollParams } from '@hcengineering/activity'
  import activity from '@hcengineering/activity'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import { getPollTimeError, getPollTimeErrorFrom, MAX_TIMER_DELAY } from '../../pollTime'
  import AppletTile from '../applet/AppletTile.svelte'

  export let applet: Applet
  export let params: CreatePollParams

  const dispatch = createEventDispatcher()

  let now = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  $: scheduleExpiry(params != null ? getPollTimeErrorFrom(params) : undefined)
  // A draft can outlive its end time, sending it would post an already ended poll or fail.
  $: timeError = params != null ? getPollTimeError(params, now) : undefined

  function scheduleExpiry (expiresAt: number | undefined): void {
    clearTimeout(timer)
    now = Date.now()
    if (expiresAt == null || expiresAt <= now) return
    timer = setTimeout(
      () => {
        scheduleExpiry(expiresAt)
      },
      Math.min(expiresAt - now + 1, MAX_TIMER_DELAY)
    )
  }

  onDestroy(() => {
    clearTimeout(timer)
  })

  // The same label as the badge of the posted poll.
  $: typeLabel =
    params?.anonymous === true && params?.quiz === true
      ? activity.string.AnonymousQuiz
      : params?.anonymous === true
        ? activity.string.AnonymousPoll
        : params?.quiz === true
          ? activity.string.Quiz
          : activity.string.Poll
</script>

<AppletTile
  icon={applet.icon}
  color={applet.color}
  title={params?.question ?? ''}
  placeholder={applet.label}
  label={typeLabel}
  error={timeError}
  on:open={() => {
    dispatch('change')
  }}
  on:remove={() => {
    dispatch('delete')
  }}
/>
