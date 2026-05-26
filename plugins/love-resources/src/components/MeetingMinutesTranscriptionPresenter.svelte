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
  import type { Doc } from '@hcengineering/core'
  import { MeetingMinutes } from '@hcengineering/love'
  import { Button, ButtonKind, ButtonSize, IconScribble } from '@hcengineering/ui'

  import CollectionChatMessagesPopup from './CollectionChatMessagesPopup.svelte'

  export let value: number | MeetingMinutes | undefined
  export let object: Doc | undefined = undefined
  export let kind: ButtonKind = 'link'
  export let size: ButtonSize = 'small'
  export let showCounter: boolean = true
  export let compactMode: boolean = false

  $: doc = object ?? (typeof value === 'object' ? value : undefined)
  $: count = typeof value === 'number' ? value : ((doc as MeetingMinutes | undefined)?.transcription ?? 0)
</script>

{#if doc && count > 0}
  <Button
    {kind}
    {size}
    showTooltip={{
      component: CollectionChatMessagesPopup,
      props: { object: doc, collection: 'transcription' }
    }}
  >
    <div slot="icon">
      <IconScribble size={'small'} />
    </div>
    <div slot="content" style:margin-left={showCounter && !compactMode ? '.375rem' : '0'}>
      {#if showCounter && !compactMode}{count}{/if}
    </div>
  </Button>
{/if}
