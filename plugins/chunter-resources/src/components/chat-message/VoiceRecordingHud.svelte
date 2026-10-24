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
  import type { AudioTranscribe } from '@hcengineering/ai-bot'
  import aiBot from '@hcengineering/ai-bot'
  import type { Class, Doc, Ref, Space } from '@hcengineering/core'
  import { generateId, getCurrentAccount } from '@hcengineering/core'
  import { setPlatformStatus, unknownError } from '@hcengineering/platform'
  import { uploadFile } from '@hcengineering/presentation'
  import { getCurrentEmployeeName } from '@hcengineering/contact-resources'
  import { VoiceRecorderBar } from '@hcengineering/ui/kit'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import slugify from 'slugify'

  import { VoiceRecorder } from '../../voiceRecorder'

  // Draft message this recording attaches to (objectId = future message id).
  export let objectId: Ref<Doc>
  export let objectClass: Ref<Class<Doc>>
  export let space: Ref<Space>

  const dispatch = createEventDispatcher()

  const recorder = new VoiceRecorder()

  type Phase = 'starting' | 'recording' | 'saving'
  // 'starting' while getUserMedia/permission resolves, so the user waits for the go-ahead instead
  // of talking into a mic that isn't capturing yet (losing the first words).
  let phase: Phase = 'starting'
  let elapsed = 0
  let timer: any
  let raf: number | undefined

  // A wide input shows about the last ten seconds.
  const LEVELS = 128
  const LEVEL_MS = 80
  let levels: number[] = []
  let sampled = 0
  let destroyed = false

  onMount(() => {
    void begin()
  })

  async function begin (): Promise<void> {
    try {
      await recorder.start()
    } catch {
      dispatch('close')
      return
    }
    // getUserMedia may resolve after the HUD is gone; release the mic instead of leaking it.
    if (destroyed) {
      recorder.cancel()
      return
    }
    phase = 'recording'
    timer = setInterval(() => {
      elapsed += 1
    }, 1000)
    const tick = (now: number): void => {
      if (now - sampled >= LEVEL_MS) {
        sampled = now
        levels = [...levels.slice(1 - LEVELS), recorder.getLevel()]
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  function stopTimers (): void {
    if (timer !== undefined) clearInterval(timer)
    if (raf !== undefined) cancelAnimationFrame(raf)
    timer = undefined
    raf = undefined
  }

  // Uploads only: the input creates the doc on send.
  async function persist (): Promise<AudioTranscribe> {
    stopTimers()
    let rec
    try {
      rec = await recorder.stop()
    } catch (err: any) {
      dispatch('close')
      throw err
    }
    phase = 'saving'
    const id = generateId<AudioTranscribe>()
    const ext = rec.type.includes('ogg') ? 'ogg' : 'webm'
    const author = slugify(await getCurrentEmployeeName(), { lower: false }) || 'voice'
    const name = `${author}-${Date.now()}.${ext}`
    const file = new File([rec.blob], name, { type: rec.type })
    let stored
    try {
      stored = await uploadFile(file)
    } catch (err: any) {
      dispatch('close')
      throw err
    }
    const { uuid, metadata } = stored
    const data = {
      name,
      file: uuid,
      type: rec.type,
      size: file.size,
      lastModified: Date.now(),
      metadata,
      state: 'pending' as const,
      durationSec: Math.round(rec.durationSec)
    }
    const doc = {
      _id: id,
      _class: aiBot.class.AudioTranscribe,
      space,
      attachedTo: objectId,
      attachedToClass: objectClass,
      collection: 'attachments',
      modifiedOn: Date.now(),
      modifiedBy: getCurrentAccount().primarySocialId,
      ...data
    } as unknown as AudioTranscribe
    dispatch('audio', doc)
    return doc
  }

  // A send during the upload must wait: a second stop finds the recorder released.
  let attaching: Promise<void> | undefined

  export async function finish (): Promise<void> {
    // A failure reaches the caller: a send must stop, not go out empty.
    attaching ??= persist().then(() => {
      dispatch('close')
    })
    await attaching
  }

  function onCancel (): void {
    stopTimers()
    recorder.cancel()
    dispatch('close')
  }

  onDestroy(() => {
    destroyed = true
    stopTimers()
    // Release the mic on any teardown path so the browser tab drops the recording indicator.
    recorder.cancel()
  })
</script>

<VoiceRecorderBar
  state={phase}
  {elapsed}
  {levels}
  on:discard={onCancel}
  on:attach={() => {
    finish().catch((err) => {
      void setPlatformStatus(unknownError(err))
    })
  }}
/>
