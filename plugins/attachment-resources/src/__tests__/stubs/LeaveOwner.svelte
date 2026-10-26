<!--
// Copyright © 2026 Intabia Fusion.
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
  import type { Class, Doc, Ref, Space } from '@hcengineering/core'
  import { onDestroy } from 'svelte'

  import AttachmentRefInput from '../../components/AttachmentRefInput.svelte'

  // Shaped like the chat input: it saves the draft from the callback, after its own destroy has run.
  export let record: (event: string) => void

  const objectId = 'message1' as Ref<Doc>
  const space = 'space1' as Ref<Space>
  const _class = 'chunter:class:ChatMessage' as Ref<Class<Doc>>

  function onLeave (count: number): void {
    record(`left with ${count}`)
  }

  onDestroy(() => {
    record('owner destroyed')
  })
</script>

<AttachmentRefInput {objectId} {space} {_class} shouldSaveDraft {onLeave} />
