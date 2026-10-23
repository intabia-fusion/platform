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
  import type { Attachment } from '@hcengineering/attachment'
  import type { BlobType, WithLookup } from '@hcengineering/core'

  import AudioAttachment from './AudioAttachment.svelte'

  export let value: WithLookup<Attachment> | BlobType
</script>

<div class="audio-preview">
  <AudioAttachment {value} withActions={false} />
</div>

<style lang="scss">
  .audio-preview {
    display: flex;
    justify-content: center;
    width: 100%;
    padding: 2rem 1rem;
    // The viewer has room: a wider card and a wave across all of it.
    --audio-card-width: 28rem;
    --waveform-max-width: none;
  }
</style>
