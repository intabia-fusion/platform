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
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import Dialog from './Dialog.svelte'

  // Asked over a dialog with `closeConfirmationIntl`: `true` closes it, anything else keeps it open.
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let message: IntlString
  // Called however the question goes, `closePopup` included, which skips the close callback.
  export let onDestroyed: (() => void) | undefined = undefined

  const dispatch = createEventDispatcher<{ close: boolean }>()
  onDestroy(() => {
    onDestroyed?.()
  })
  // The title is the one of the dialog asked over: the question itself describes this one.
  const messageId = `close-confirm-${Math.random().toString(36).slice(2, 10)}`
</script>

<Dialog
  {label}
  {labelParams}
  width="small"
  dividers={false}
  submitLabel={ui.string.Close}
  submitKind="negative"
  aria-describedby={messageId}
  on:submit={() => dispatch('close', true)}
  on:close={() => dispatch('close', false)}
>
  <span class="close-confirm" id={messageId}><Label label={message} /></span>
</Dialog>

<style lang="scss">
  .close-confirm {
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--global-primary-TextColor);
  }
</style>
