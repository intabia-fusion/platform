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
  import {
    AudioBar,
    AudioCard,
    AudioCover,
    FileCard,
    VoiceRecorderBar,
    type FileBadgeData,
    type Playback
  } from '@hcengineering/ui/kit'
  import { onDestroy } from 'svelte'
  import { readable } from 'svelte/store'

  import { speech } from '../attachments/fixtures'
  import Group from '../attachments/Group.svelte'
  import Specimen from '../attachments/Specimen.svelte'
  import Board from './Board.svelte'

  const mp3: FileBadgeData = { label: 'MP3', color: 'Pink' }
  const ogg: FileBadgeData = { label: 'OGG', color: 'Pink' }
  const music = speech(12, 3)
  const voice = speech(7, 7)

  function still (id: string, playing: boolean, time: number, rate: number): Playback {
    const state = readable({ id, playing, time, duration: 7, rate })
    return {
      subscribe: state.subscribe,
      toggle: () => {},
      seek: () => {},
      stop: () => {},
      cycleRate: () => {},
      show: () => () => {},
      position: () => undefined
    }
  }
  const rates = [0.5, 0.75, 1, 1.5, 2]

  let step = 0
  let levels: number[] = []
  const loudness = (i: number): number => {
    const voice = 0.45 + 0.3 * Math.sin(i * 0.37) + 0.25 * Math.sin(i * 1.13 + 1)
    const word = Math.sin(i * 0.11) > -0.4 ? 1 : 0.06
    return Math.max(0.04, Math.min(1, voice * word))
  }
  const heard = Array.from({ length: 128 }, (_, i) => loudness(i))
  const timer = setInterval(() => {
    step++
    levels = [...levels.slice(-127), loudness(step)]
  }, 80)
  onDestroy(() => {
    clearInterval(timer)
  })
</script>

<Board>
  <Group
    title="AudioCard · AudioBar"
    note="One player for the chat; the states are held still, nothing plays."
    direction="column"
  >
    <AudioCard id="kit-music" name="Morning ambient loop.mp3" size={2_100_000} badge={mp3} url={music} />
    <div class="bar"><AudioBar id="kit-voice" src={voice} size={56_000} duration={7} /></div>
    <Specimen label="AudioCard · playing">
      <AudioCard
        id="kit-music-playing"
        name="Morning ambient loop.mp3"
        size={2_100_000}
        badge={mp3}
        url={music}
        playback={still('kit-music-playing', true, 5, 1.5)}
      />
    </Specimen>
    <Specimen label="at rest"
      ><div class="bar">
        <AudioBar id="kit-state-rest" src={voice} size={56_000} duration={7} playback={still('', false, 0, 1)} />
      </div></Specimen
    >
    <Specimen label="paused halfway"
      ><div class="bar">
        <AudioBar
          id="kit-state-paused"
          src={voice}
          size={56_000}
          duration={7}
          playback={still('kit-state-paused', false, 3, 1)}
        />
      </div></Specimen
    >
    {#each rates as rate}
      <Specimen label={`playing · ${rate}×`}>
        <div class="bar">
          <AudioBar
            id={`kit-state-${rate}`}
            src={voice}
            size={56_000}
            duration={7}
            playback={still(`kit-state-${rate}`, true, 2, rate)}
          />
        </div>
      </Specimen>
    {/each}
    <Specimen label="no waveform (large file)">
      <div class="bar">
        <AudioBar
          id="kit-state-line"
          src={voice}
          size={48_000_000}
          duration={7}
          playback={still('kit-state-line', true, 4, 2)}
        />
      </div>
    </Specimen>
  </Group>

  <Group title="AudioCover" note="The cover of a recording in a grid of file cards; it plays once opened.">
    <div class="covers">
      <Specimen label="length from the header">
        <FileCard --file-card-width="100%" name="All_hands_12_May_2026.ogg" size={14_000_000} badge={ogg} url={music}>
          <AudioCover slot="cover" id="kit-cover" src={music} badge={ogg} />
        </FileCard>
      </Specimen>
      <Specimen label="length unknown">
        <FileCard --file-card-width="100%" name="Meeting_Room_1.webm" size={1_400_000} badge={ogg} url="">
          <AudioCover slot="cover" id="kit-cover-none" src="" badge={ogg} />
        </FileCard>
      </Specimen>
    </div>
  </Group>

  <Group
    title="VoiceRecorderBar"
    note="Leads the input's header, above its files, while a voice message records; the text can still be typed. The cross cancels, the check attaches the recording, the message is sent as usual."
    direction="column"
  >
    <Specimen label="starting"><div class="recorder"><VoiceRecorderBar state="starting" /></div></Specimen>
    <Specimen label="recording">
      <div class="recorder"><VoiceRecorderBar elapsed={Math.floor(step / 12.5)} {levels} /></div>
    </Specimen>
    <Specimen label="saving"
      ><div class="recorder"><VoiceRecorderBar state="saving" elapsed={23} levels={heard} /></div></Specimen
    >
  </Group>
</Board>

<style lang="scss">
  // As wide as a chat input on a large screen: the recorder keeps to its own width.
  .covers {
    display: grid;
    grid-template-columns: repeat(2, 13.5rem);
    gap: 0.875rem;
  }

  .recorder {
    width: 72rem;
    max-width: 100%;
  }

  .bar {
    width: 22rem;
  }
</style>
